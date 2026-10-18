import logging
import uuid
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.interview.models import InterviewSession, InterviewStatus
from apps.interview.schemas import (
    BlueprintUpdateRequest,
    InterviewBlueprint,
    InterviewCreateRequest,
    InterviewStage,
    ResumeUploadResponse,
)
from apps.interview.services.llm import generate_extraction_and_blueprint, regenerate_stage
from apps.interview.services.parser import parse_resume_document
from core.database import AsyncSessionLocal
from core.storage import storage_service

logger = logging.getLogger(__name__)


class InterviewService:
    @staticmethod
    async def upload_resume(
        user_id: uuid.UUID, file_bytes: bytes, filename: str
    ) -> ResumeUploadResponse:
        """Parses the uploaded resume and stores the raw file securely in Cloudflare R2."""
        # 1. Parse text and check if sparse/scanned
        raw_text, is_sparse = parse_resume_document(file_bytes, filename)

        # 2. Determine content-type
        content_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        # 3. Upload to R2 under resumes/{user_id}/{unique_id}/{filename}
        r2_key = f"resumes/{user_id}/{uuid.uuid4()}/{filename}"
        if not storage_service.is_configured:
            raise ValueError("Cloudflare R2 storage is not configured. Resume upload cannot proceed.")
        await storage_service.upload_file_bytes(file_bytes, r2_key, content_type)

        return ResumeUploadResponse(
            resume_file_url=r2_key,
            raw_text=raw_text,
            is_sparse=is_sparse,
            char_count=len(raw_text),
        )

    @staticmethod
    async def create_session(
        db: AsyncSession, user_id: uuid.UUID, data: InterviewCreateRequest
    ) -> InterviewSession:
        """Creates an interview session in DRAFT state."""
        session = InterviewSession(
            user_id=user_id,
            job_title=data.job_title,
            company_name=data.company_name,
            job_description_raw=data.job_description_raw,
            resume_file_url=data.resume_file_url,
            resume_raw_text=data.resume_raw_text,
            duration_minutes=data.duration_minutes,
            difficulty_level=data.difficulty_level,
            interviewer_persona=data.interviewer_persona,
            status=InterviewStatus.DRAFT.value,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def get_session(
        db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> Optional[InterviewSession]:
        """Fetches a session belonging to the specified user."""
        stmt = select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == user_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_sessions(
        db: AsyncSession,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[InterviewSession]:
        """Lists interview sessions belonging to the user ordered by created_at DESC."""
        stmt = (
            select(InterviewSession)
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_presigned_resume_url(r2_key: Optional[str]) -> Optional[str]:
        """Generates a secure temporary presigned download URL for the resume in R2."""
        if not r2_key or not storage_service.is_configured:
            return None
        try:
            return await storage_service.generate_presigned_download_url(r2_key)
        except Exception as e:
            logger.error("Failed to generate presigned download URL: %s", e)
            return None

    _session_factory = None

    @classmethod
    def get_session_factory(cls):
        return cls._session_factory or AsyncSessionLocal

    @staticmethod
    async def run_async_blueprint_generation(
        session_id: uuid.UUID,
        db_session: Optional[AsyncSession] = None,
    ) -> None:
        """Background worker task to extract profiles, compute gap analysis,
        and synthesize the interview blueprint.
        """
        if db_session is not None:
            await InterviewService._process_blueprint_generation(db_session, session_id)
            return

        factory = InterviewService.get_session_factory()
        async with factory() as db:
            await InterviewService._process_blueprint_generation(db, session_id)

    @staticmethod
    async def _process_blueprint_generation(db: AsyncSession, session_id: uuid.UUID) -> None:
        stmt = select(InterviewSession).where(InterviewSession.id == session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            logger.error("Session %s not found for blueprint generation", session_id)
            return

        try:
            session.status = InterviewStatus.BLUEPRINT_GENERATING.value
            session.error_message = None
            await db.commit()

            # Call LLM structuring engine
            extraction_result = await generate_extraction_and_blueprint(
                resume_text=session.resume_raw_text or "",
                jd_text=session.job_description_raw,
                job_title=session.job_title,
                company_name=session.company_name,
                duration_minutes=session.duration_minutes,
                difficulty=session.difficulty_level,
                persona=session.interviewer_persona,
            )

            # Persist extracted structures
            session.parsed_resume_json = extraction_result.candidate_profile.model_dump()
            session.parsed_jd_json = extraction_result.job_profile.model_dump()
            session.gap_analysis_json = extraction_result.gap_analysis.model_dump()
            session.blueprint_json = extraction_result.blueprint.model_dump()
            session.status = InterviewStatus.BLUEPRINT_READY.value
            await db.commit()
            logger.info("Blueprint generated successfully for session %s", session_id)

        except Exception as e:
            logger.exception("Blueprint generation failed for session %s: %s", session_id, e)
            session.status = InterviewStatus.FAILED_GENERATION.value
            session.error_message = str(e)
            await db.commit()

    @staticmethod
    async def update_blueprint(
        db: AsyncSession, session: InterviewSession, data: BlueprintUpdateRequest
    ) -> InterviewSession:
        """Updates the interview blueprint with customized user changes."""
        session.blueprint_json = data.blueprint.model_dump()
        session.duration_minutes = data.blueprint.total_duration_minutes
        session.difficulty_level = data.blueprint.difficulty_level
        session.interviewer_persona = data.blueprint.interviewer_persona
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def regenerate_stage(
        db: AsyncSession,
        session: InterviewSession,
        stage_id: str,
        user_instructions: Optional[str] = None,
    ) -> InterviewSession:
        """Regenerates a single stage within the session blueprint."""
        if not session.blueprint_json or "stages" not in session.blueprint_json:
            raise ValueError("No existing blueprint found to regenerate stage.")

        blueprint = InterviewBlueprint.model_validate(session.blueprint_json)
        target_stage: Optional[InterviewStage] = None
        target_idx: Optional[int] = None

        for idx, stage in enumerate(blueprint.stages):
            if stage.stage_id == stage_id:
                target_stage = stage
                target_idx = idx
                break

        if target_stage is None or target_idx is None:
            raise ValueError(f"Stage '{stage_id}' not found in blueprint.")

        # Re-synthesize stage
        updated_stage = await regenerate_stage(
            current_stage=target_stage,
            job_title=session.job_title,
            user_instructions=user_instructions,
        )

        blueprint.stages[target_idx] = updated_stage
        session.blueprint_json = blueprint.model_dump()
        await db.commit()
        await db.refresh(session)
        return session
