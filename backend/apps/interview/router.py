import uuid
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from apps.auth.dependencies import get_current_active_user
from apps.auth.models import User
from apps.interview.models import InterviewStatus
from apps.interview.schemas import (
    BlueprintUpdateRequest,
    InterviewCreateRequest,
    InterviewResponse,
    InterviewStatusResponse,
    ResumeUploadResponse,
    StageRegenerateRequest,
)
from apps.interview.service import InterviewService
from apps.interview.ws_router import ws_router
from core.database import get_db

router = APIRouter(prefix="/interviews", tags=["Interviews"])
router.include_router(ws_router)


@router.post("/upload-resume", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """Uploads a candidate resume (PDF or DOCX), securely persists it to Cloudflare R2,
    and returns extracted sanitized text and preliminary preview metadata.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided.")

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith(".pdf") or filename_lower.endswith(".docx") or filename_lower.endswith(".doc")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a PDF or Word document (.docx).",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        response = await InterviewService.upload_resume(
            user_id=current_user.id,
            file_bytes=file_bytes,
            filename=file.filename,
        )
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to process document: {str(e)}",
        )


@router.post("/", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
async def create_interview(
    data: InterviewCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Creates a new interview session in DRAFT state with JD, resume data, and configuration."""
    session = await InterviewService.create_session(
        db=db,
        user_id=current_user.id,
        data=data,
    )
    presigned_url = await InterviewService.get_presigned_resume_url(session.resume_file_url)

    resp = InterviewResponse.model_validate(session)
    resp.resume_download_url = presigned_url
    return resp


@router.get("/", response_model=list[InterviewResponse])
async def list_interviews(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Lists all interview sessions for the current authenticated user."""
    sessions = await InterviewService.list_sessions(
        db=db, user_id=current_user.id, limit=limit, offset=offset
    )
    responses = []
    for s in sessions:
        presigned_url = await InterviewService.get_presigned_resume_url(s.resume_file_url)
        resp = InterviewResponse.model_validate(s)
        resp.resume_download_url = presigned_url
        responses.append(resp)
    return responses


@router.post(
    "/{session_id}/generate-blueprint",
    response_model=InterviewStatusResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate_blueprint(
    session_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Dispatches an asynchronous background task to parse candidate profile,
    job profile, compute gap analysis, and synthesize the interview blueprint.
    """
    session = await InterviewService.get_session(db=db, session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    if session.status == InterviewStatus.BLUEPRINT_GENERATING.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Blueprint generation is already in progress for this session.",
        )
    if session.status in [
        InterviewStatus.IN_PROGRESS.value,
        InterviewStatus.COMPLETED.value,
        InterviewStatus.EVALUATED.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot generate blueprint for session in status {session.status}.",
        )

    session.status = InterviewStatus.BLUEPRINT_GENERATING.value
    await db.commit()

    # Enqueue background task
    background_tasks.add_task(InterviewService.run_async_blueprint_generation, session_id)

    return InterviewStatusResponse(
        id=session.id,
        status=session.status,
        error_message=session.error_message,
        has_blueprint=bool(session.blueprint_json),
    )


@router.get("/{session_id}/status", response_model=InterviewStatusResponse)
async def get_interview_status(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Polls the status of the interview session (e.g., BLUEPRINT_GENERATING, BLUEPRINT_READY)."""
    session = await InterviewService.get_session(db=db, session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    return InterviewStatusResponse(
        id=session.id,
        status=session.status,
        error_message=session.error_message,
        has_blueprint=bool(session.blueprint_json),
    )


@router.get("/{session_id}", response_model=InterviewResponse)
async def get_interview_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Fetches complete details for an interview session including parsed profiles,
    gap analysis, interview blueprint, and fresh presigned download URL for the resume.
    """
    session = await InterviewService.get_session(db=db, session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    presigned_url = await InterviewService.get_presigned_resume_url(session.resume_file_url)
    resp = InterviewResponse.model_validate(session)
    resp.resume_download_url = presigned_url
    return resp


@router.put("/{session_id}/blueprint", response_model=InterviewResponse)
async def update_blueprint(
    session_id: uuid.UUID,
    data: BlueprintUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Updates the interview blueprint with customized stage configurations."""
    session = await InterviewService.get_session(db=db, session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    if session.status not in [InterviewStatus.DRAFT.value, InterviewStatus.BLUEPRINT_READY.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Blueprint modifications are only allowed prior to starting the interview.",
        )

    updated_session = await InterviewService.update_blueprint(db=db, session=session, data=data)
    presigned_url = await InterviewService.get_presigned_resume_url(updated_session.resume_file_url)
    resp = InterviewResponse.model_validate(updated_session)
    resp.resume_download_url = presigned_url
    return resp


@router.post("/{session_id}/stages/{stage_id}/regenerate", response_model=InterviewResponse)
async def regenerate_blueprint_stage(
    session_id: uuid.UUID,
    stage_id: str,
    data: StageRegenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Regenerates a single stage within the interview blueprint using optional custom instructions."""
    session = await InterviewService.get_session(db=db, session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found.")

    if session.status not in [InterviewStatus.DRAFT.value, InterviewStatus.BLUEPRINT_READY.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Blueprint modifications are only allowed prior to starting the interview.",
        )

    try:
        updated_session = await InterviewService.regenerate_stage(
            db=db,
            session=session,
            stage_id=stage_id,
            user_instructions=data.user_instructions,
        )
        presigned_url = await InterviewService.get_presigned_resume_url(updated_session.resume_file_url)
        resp = InterviewResponse.model_validate(updated_session)
        resp.resume_download_url = presigned_url
        return resp
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
