import asyncio
from datetime import datetime, timezone
import json
import logging
import re
import time
import uuid
from typing import AsyncGenerator, Dict, List, Optional, Tuple

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.interview.models import InterviewSession, InterviewStatus, InterviewTurn
from apps.interview.schemas import InterviewBlueprint, InterviewStage
from core.config import settings

logger = logging.getLogger(__name__)

SENTENCE_SPLIT_REGEX = re.compile(r"([.!?]+(?:\s+|$))")


class ConversationalOrchestrator:
    """Orchestrates stage progression, turn budgeting, Gemini prompt context assembly,
    streaming token generation, and audio synthesis chunking for live voice interaction.
    """

    def __init__(self, session_id: uuid.UUID, session_factory):
        self.session_id = session_id
        self.session_factory = session_factory
        self.current_stage_idx: int = 0
        self.current_stage_turn_count: int = 0
        self.total_turn_count: int = 0
        self.stage_start_time: float = time.time()
        self.session_start_time: float = time.time()
        self.history: List[Dict[str, str]] = []
        self.blueprint: Optional[InterviewBlueprint] = None
        self.stages: List[InterviewStage] = []
        self.is_completed: bool = False

    async def initialize(self) -> Tuple[InterviewSession, InterviewStage]:
        """Loads session and blueprint from database and sets initial stage."""
        async with self.session_factory() as db:
            stmt = select(InterviewSession).where(InterviewSession.id == self.session_id)
            res = await db.execute(stmt)
            session = res.scalar_one_or_none()
            if not session:
                raise ValueError(f"Interview session {self.session_id} not found.")

            if not session.blueprint_json or "stages" not in session.blueprint_json:
                raise ValueError(f"Session {self.session_id} does not have a generated blueprint.")

            self.blueprint = InterviewBlueprint.model_validate(session.blueprint_json)
            self.stages = self.blueprint.stages
            if not self.stages:
                raise ValueError(f"Session {self.session_id} blueprint has no stages configured.")

            # Transition session to IN_PROGRESS if not already
            if session.status != InterviewStatus.IN_PROGRESS.value:
                session.status = InterviewStatus.IN_PROGRESS.value
                await db.commit()

            self.stage_start_time = time.time()
            self.session_start_time = time.time()
            return session, self.get_current_stage()

    def get_current_stage(self) -> InterviewStage:
        if 0 <= self.current_stage_idx < len(self.stages):
            return self.stages[self.current_stage_idx]
        return self.stages[-1]

    def get_stage_info(self) -> dict:
        stage = self.get_current_stage()
        elapsed_stage = time.time() - self.stage_start_time
        total_duration = (self.blueprint.total_duration_minutes if self.blueprint else 30) * 60
        elapsed_total = time.time() - self.session_start_time
        remaining = max(0, int(total_duration - elapsed_total))

        return {
            "stage_id": stage.stage_id,
            "title": stage.title,
            "stage_index": self.current_stage_idx,
            "total_stages": len(self.stages),
            "turn_in_stage": self.current_stage_turn_count,
            "max_turns": stage.max_turns,
            "min_turns": stage.min_turns,
            "duration_minutes": stage.duration_minutes,
            "time_remaining_seconds": remaining,
        }

    def should_advance_stage(self) -> bool:
        """Determines whether to advance to the next interview stage based on turn budget or duration."""
        stage = self.get_current_stage()
        elapsed_mins = (time.time() - self.stage_start_time) / 60.0
        if self.current_stage_turn_count >= stage.max_turns:
            return True
        if elapsed_mins >= stage.duration_minutes:
            return True
        return False

    def advance_stage(self) -> Optional[Tuple[InterviewStage, InterviewStage]]:
        """Advances to next stage if available, or marks session as completed."""
        previous_stage = self.get_current_stage()
        if self.current_stage_idx + 1 < len(self.stages):
            self.current_stage_idx += 1
            self.current_stage_turn_count = 0
            self.stage_start_time = time.time()
            return previous_stage, self.get_current_stage()
        else:
            self.is_completed = True
            return None

    def build_system_prompt(self, session: InterviewSession) -> str:
        """Assembles rich context from Phase 1 (resume, JD, gap analysis, rubric) into system instructions."""
        stage = self.get_current_stage()
        rubric_signals = ""
        if stage.probing_rubric:
            rubric_signals = (
                f"\nExpected Signals: {', '.join(stage.probing_rubric.expected_signals)}\n"
                f"Red Flags: {', '.join(stage.probing_rubric.red_flags)}"
            )

        gap_info = ""
        if session.gap_analysis_json:
            alignments = [
                f"- {a.get('skill_or_domain')}: {a.get('evidence')}"
                for a in session.gap_analysis_json.get("strong_alignments", [])
            ]
            gaps = [
                f"- {g.get('skill_or_domain')}: {g.get('jd_requirement')} (Candidate: {g.get('resume_status')})"
                for g in session.gap_analysis_json.get("potential_gaps", [])
            ]
            unverified = [
                f"- {u.get('claim')} (Goal: {u.get('verification_goal')})"
                for u in session.gap_analysis_json.get("unverified_claims", [])
            ]
            gap_info = (
                f"\n<candidate_gap_analysis>\n"
                f"Key Alignments:\n{chr(10).join(alignments[:3])}\n"
                f"Identified Gaps to Probe:\n{chr(10).join(gaps[:3])}\n"
                f"Unverified Claims:\n{chr(10).join(unverified[:3])}\n"
                f"</candidate_gap_analysis>"
            )

        return f"""You are the AI technical interviewer conducting a live conversational voice interview.
Target Role: {session.job_title} at {session.company_name or 'the company'}
Difficulty: {session.difficulty_level}
Interviewer Persona: {session.interviewer_persona}

<current_stage>
Stage: {stage.title} (ID: {stage.stage_id})
Objective: {stage.objective}
Focus Areas: {', '.join(stage.focus_areas)}
Suggested Starter Questions: {', '.join(stage.starter_questions[:2])}
Suggested Follow-up Probes: {', '.join(stage.follow_up_probes[:3])}
{rubric_signals}
</current_stage>
{gap_info}

CRITICAL VOICE INTERACTION RULES:
1. You are speaking over a live voice connection. Speak naturally, warmly, professionally, and concisely.
2. KEEP RESPONSES SHORT: 1 to 3 sentences maximum (under 45 words).
3. DO NOT use markdown formatting, tables, bold asterisks (**), bullet points, or emojis, as your text is fed directly to speech synthesis.
4. Ask only ONE question or probe at a time. Never ask compound multi-part questions.
5. Acknowledge what the candidate just said briefly before probing deeper or shifting focus.
"""

    async def generate_initial_greeting(self, session: InterviewSession) -> str:
        """Generates opening welcome message and first starter question for Stage 0."""
        stage = self.stages[0]
        starter = stage.starter_questions[0] if stage.starter_questions else "Could you introduce yourself and walk me through your recent background?"
        greeting = (
            f"Hello and welcome! I am your AI interviewer for the {session.job_title} role. "
            f"We will start with {stage.title}. To begin, {starter}"
        )
        # Seed initial candidate readiness trigger so history begins with a user turn
        self.history.append({"role": "user", "content": "Hello, I am ready to begin the interview."})
        self.history.append({"role": "model", "content": greeting})
        self.total_turn_count += 1
        self.current_stage_turn_count += 1
        return greeting

    async def stream_ai_response(
        self,
        candidate_transcript: str,
        session: InterviewSession,
    ) -> AsyncGenerator[str, None]:
        """Streams text chunks from Gemini for candidate's answer and buffers phrases for TTS."""
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured.")

        # Append candidate's answer to conversation history
        self.history.append({"role": "user", "content": candidate_transcript})
        self.current_stage_turn_count += 1
        self.total_turn_count += 1

        stage = self.get_current_stage()
        system_instruction = self.build_system_prompt(session)

        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        # Build message contents ensuring it begins with user and strictly alternates
        raw_slice = self.history[-8:]
        while raw_slice and raw_slice[0]["role"] == "model":
            raw_slice = raw_slice[1:]

        if not raw_slice:
            raw_slice = [{"role": "user", "content": candidate_transcript}]

        # Coalesce consecutive turns with the same role to maintain strict alternation
        coalesced: List[Dict[str, str]] = []
        for msg in raw_slice:
            if coalesced and coalesced[-1]["role"] == msg["role"]:
                coalesced[-1]["content"] += f"\n{msg['content']}"
            else:
                coalesced.append({"role": msg["role"], "content": msg["content"]})

        contents = [
            types.Content(
                role=msg["role"],
                parts=[types.Part.from_text(text=msg["content"])],
            )
            for msg in coalesced
        ]

        full_ai_text = []
        try:
            response_stream = await client.aio.models.generate_content_stream(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.6,
                    max_output_tokens=150,
                ),
            )

            token_buffer = ""
            async for chunk in response_stream:
                if chunk.text:
                    token_buffer += chunk.text
                    full_ai_text.append(chunk.text)
                    # Yield complete sentences/clauses as soon as punctuation is detected
                    while True:
                        match = SENTENCE_SPLIT_REGEX.search(token_buffer)
                        if not match:
                            break
                        end_pos = match.end()
                        sentence = token_buffer[:end_pos].strip()
                        token_buffer = token_buffer[end_pos:]
                        if sentence:
                            yield sentence

            # Yield any trailing tokens left in buffer
            trailing = token_buffer.strip()
            if trailing:
                yield trailing

        except Exception as e:
            logger.error("Error generating Gemini stream: %s", e)
            raise

        complete_text = "".join(full_ai_text).strip()
        if complete_text:
            self.history.append({"role": "model", "content": complete_text})

    async def record_completed_turn(
        self,
        turn_index: int,
        stage_id: str,
        question_text: str,
        answer_transcript: Optional[str],
        latency_ms: Optional[int],
        was_interrupted: bool = False,
    ) -> InterviewTurn:
        """Persists turn telemetry and Q&A record to interview_turns table."""
        async with self.session_factory() as db:
            turn = InterviewTurn(
                session_id=self.session_id,
                turn_index=turn_index,
                stage_id=stage_id,
                question_text=question_text,
                answer_transcript=answer_transcript,
                started_at=datetime.now(timezone.utc),
                ended_at=datetime.now(timezone.utc),
                latency_ms=latency_ms,
                was_interrupted=was_interrupted,
            )
            db.add(turn)
            await db.commit()
            await db.refresh(turn)
            return turn

    async def complete_session(self) -> None:
        """Marks interview session status as COMPLETED in the database."""
        self.is_completed = True
        async with self.session_factory() as db:
            stmt = select(InterviewSession).where(InterviewSession.id == self.session_id)
            res = await db.execute(stmt)
            session = res.scalar_one_or_none()
            if session:
                session.status = InterviewStatus.COMPLETED.value
                await db.commit()
                logger.info("Session %s successfully marked as COMPLETED.", self.session_id)
