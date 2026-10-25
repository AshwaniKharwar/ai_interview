import asyncio
import base64
import json
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from apps.auth.models import User
from apps.interview.models import InterviewSession, InterviewStatus
from apps.interview.service import InterviewService
from apps.interview.services.orchestrator import ConversationalOrchestrator
from apps.interview.services.stt_service import DeepgramSTTService
from apps.interview.services.tts_service import CartesiaTTSService
from core.config import settings
from core.security import decode_token

logger = logging.getLogger(__name__)

ws_router = APIRouter(tags=["Live Interview WebSocket"])


class WebSocketSessionHandler:
    def __init__(self, websocket: WebSocket, session_id: uuid.UUID):
        self.ws = websocket
        self.session_id = session_id
        self.session_factory = InterviewService.get_session_factory()
        self.user: Optional[User] = None
        self.session: Optional[InterviewSession] = None
        self.orchestrator: Optional[ConversationalOrchestrator] = None
        self.stt_service: Optional[DeepgramSTTService] = None
        self.tts_service: Optional[CartesiaTTSService] = None

        self.current_candidate_text: str = ""
        self.candidate_transcript_buffer: list[str] = []
        self.active_ai_task: Optional[asyncio.Task] = None
        self.active_context_id: Optional[str] = None
        self.stt_task: Optional[asyncio.Task] = None
        self.last_question_text: str = ""
        self.turn_start_time: float = time.time()
        self.was_interrupted: bool = False
        self._is_closed: bool = False

    async def authenticate_and_verify(self, token_param: Optional[str]) -> bool:
        """Handles authentication handshake via query param, HttpOnly cookie, or initial auth message."""
        token = token_param or (
            self.ws.cookies.get("access_token")
            if hasattr(self.ws, "cookies") and self.ws.cookies
            else None
        )
        if not token:
            try:
                # Wait up to 3.0s for auth frame
                raw_msg = await asyncio.wait_for(self.ws.receive(), timeout=3.0)
                if raw_msg.get("type") == "websocket.receive" and "text" in raw_msg and raw_msg["text"]:
                    auth_data = json.loads(raw_msg["text"])
                    if auth_data.get("type") == "auth":
                        token = auth_data.get("token")
            except Exception as e:
                logger.warning("Auth handshake timed out or failed: %s", e)
                await self.ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Auth timeout")
                return False

        if not token:
            await self.ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
            return False

        # Validate JWT
        try:
            payload = decode_token(token)
            if payload.get("type") != "access":
                await self.ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token type")
                return False
            user_uuid = uuid.UUID(payload.get("sub"))
        except Exception as e:
            logger.warning("Token verification failed: %s", e)
            await self.ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
            return False

        # Verify session ownership & status in database
        async with self.session_factory() as db:
            stmt = select(InterviewSession).where(InterviewSession.id == self.session_id)
            res = await db.execute(stmt)
            session = res.scalar_one_or_none()
            if not session:
                await self.ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Session not found")
                return False

            if session.user_id != user_uuid:
                await self.ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Access denied to session")
                return False

            if session.status not in [
                InterviewStatus.BLUEPRINT_READY.value,
                InterviewStatus.IN_PROGRESS.value,
            ]:
                await self.ws.close(
                    code=status.WS_1008_POLICY_VIOLATION,
                    reason=f"Cannot start interview in status {session.status}",
                )
                return False

            self.session = session

        # Verify external service credentials (Strict Zero-Fallback Policy)
        if (
            not settings.DEEPGRAM_API_KEY
            or not settings.CARTESIA_API_KEY
            or not settings.GEMINI_API_KEY
        ):
            logger.error("Missing required API keys for voice engine.")
            await self.ws.send_json(
                {
                    "type": "error",
                    "code": "MISSING_SERVICE_CREDENTIALS",
                    "message": "Required speech/LLM credentials are not configured on server.",
                    "fatal": True,
                }
            )
            await self.ws.close(code=1011, reason="Missing voice engine credentials")
            return False

        return True

    async def run(self):
        """Main lifecycle runner for the live WebSocket session."""
        try:
            self.orchestrator = ConversationalOrchestrator(self.session_id, self.session_factory)
            self.session, active_stage = await self.orchestrator.initialize()

            # Connect Deepgram STT
            self.stt_service = DeepgramSTTService()
            await self.stt_service.connect()

            # Connect Cartesia TTS
            self.tts_service = CartesiaTTSService()
            await self.tts_service.connect()

            # Start background STT transcript receiver
            self.stt_task = asyncio.create_task(self._receive_stt_transcripts())

            # Send auth_success frame
            await self.ws.send_json(
                {
                    "type": "auth_success",
                    "session_id": str(self.session_id),
                    "status": "IN_PROGRESS",
                    "active_stage": {
                        "stage_id": active_stage.stage_id,
                        "title": active_stage.title,
                        "duration_minutes": active_stage.duration_minutes,
                        "max_turns": active_stage.max_turns,
                    },
                }
            )

            # Process incoming messages from client
            while not self._is_closed:
                message = await self.ws.receive()
                if message.get("type") == "websocket.disconnect":
                    break

                # 1. Binary frames: 16kHz PCM audio bytes
                if "bytes" in message and message["bytes"]:
                    if self.stt_service:
                        await self.stt_service.send_audio(message["bytes"])
                    continue

                # 2. Text frames: JSON control messages
                if "text" in message and message["text"]:
                    await self._handle_text_frame(message["text"])

        except WebSocketDisconnect:
            logger.info("Client disconnected from session %s", self.session_id)
        except Exception as e:
            logger.exception("Live interview session error for %s: %s", self.session_id, e)
            try:
                await self.ws.send_json(
                    {
                        "type": "error",
                        "code": "SESSION_RUNTIME_ERROR",
                        "message": str(e),
                        "fatal": True,
                    }
                )
            except Exception:
                pass
        finally:
            await self.cleanup()

    async def _handle_text_frame(self, raw_text: str):
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            return

        msg_type = data.get("type")

        if msg_type == "client_ready":
            # Candidate setup complete; AI speaks opening greeting
            await self._trigger_ai_greeting()

        elif msg_type == "audio_chunk":
            # Fallback Base64 audio chunk
            base64_data = data.get("data")
            if base64_data and self.stt_service:
                try:
                    pcm_bytes = base64.b64decode(base64_data)
                    await self.stt_service.send_audio(pcm_bytes)
                except Exception as e:
                    logger.warning("Failed to decode base64 audio chunk: %s", e)

        elif msg_type == "speech_started":
            # VAD Candidate speech started
            pass

        elif msg_type == "interrupt":
            # Candidate interrupted (barge-in) while AI was speaking
            await self._handle_interrupt()

        elif msg_type in ["speech_stopped", "finish_answer"]:
            # Candidate finished speaking or clicked manual submit CTA
            await self._handle_candidate_answer_complete()

        elif msg_type == "text_message":
            # Text fallback input
            text = (data.get("text") or "").strip()
            if text:
                self.current_candidate_text = text
                await self._handle_candidate_answer_complete()

        elif msg_type == "end_session":
            # Candidate requests graceful session end
            await self._handle_session_end()

    async def _receive_stt_transcripts(self):
        """Streams STT transcripts from Deepgram to client and accumulates final answers."""
        try:
            if not self.stt_service:
                return
            async for event in self.stt_service.receive_transcripts():
                if self._is_closed:
                    break

                transcript = event.get("transcript", "")
                is_final = event.get("is_final", False)
                speech_final = event.get("speech_final", False)

                if transcript:
                    if is_final:
                        self.candidate_transcript_buffer.append(transcript)
                        self.current_candidate_text = " ".join(self.candidate_transcript_buffer)

                    # Send real-time transcript update to client
                    await self.ws.send_json(
                        {
                            "type": "transcript_update",
                            "speaker": "candidate",
                            "text": transcript if not is_final else self.current_candidate_text,
                            "is_final": is_final,
                        }
                    )

                if speech_final and self.current_candidate_text:
                    # Speech segment finalized by Deepgram
                    pass

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("STT transcript loop error: %s", e)

    async def _trigger_ai_greeting(self):
        """Generates opening welcome message and starter question for stage 0."""
        if not self.orchestrator or not self.session:
            return

        self.was_interrupted = False
        greeting = await self.orchestrator.generate_initial_greeting(self.session)
        self.last_question_text = greeting

        # Notify state change to AI_SPEAKING
        stage_info = self.orchestrator.get_stage_info()
        await self.ws.send_json(
            {
                "type": "state_change",
                "state": "AI_SPEAKING",
                "current_stage": stage_info["stage_id"],
                "stage_index": stage_info["stage_index"],
                "total_stages": stage_info["total_stages"],
                "time_remaining_seconds": stage_info["time_remaining_seconds"],
            }
        )

        # Send full text transcript
        await self.ws.send_json(
            {
                "type": "transcript_update",
                "speaker": "ai",
                "text": greeting,
                "is_final": True,
            }
        )

        # Synthesize speech via Cartesia
        self.active_context_id = str(uuid.uuid4())
        self.active_ai_task = asyncio.create_task(
            self._stream_tts(greeting, self.active_context_id, self.orchestrator.total_turn_count)
        )
        await self.active_ai_task

        # Return to LISTENING if not interrupted
        self.turn_start_time = time.time()
        if not self.was_interrupted:
            stage_info = self.orchestrator.get_stage_info()
            await self.ws.send_json(
                {
                    "type": "state_change",
                    "state": "LISTENING",
                    "current_stage": stage_info["stage_id"],
                    "stage_index": stage_info["stage_index"],
                    "total_stages": stage_info["total_stages"],
                    "time_remaining_seconds": stage_info["time_remaining_seconds"],
                }
            )

    async def _handle_interrupt(self):
        """Immediately flushes active AI synthesis and playback upon candidate barge-in."""
        self.was_interrupted = True
        logger.info("Candidate interrupted AI speech (barge-in detected).")

        # Cancel active Gemini generation or TTS task
        if self.active_ai_task and not self.active_ai_task.done():
            self.active_ai_task.cancel()
            self.active_ai_task = None

        # Send Cartesia cancel frame
        if self.tts_service and self.active_context_id:
            await self.tts_service.cancel_context(self.active_context_id)

        turn_idx = self.orchestrator.total_turn_count if self.orchestrator else 1
        await self.ws.send_json(
            {
                "type": "interrupt_ack",
                "turn_index": turn_idx,
            }
        )

        stage_info = self.orchestrator.get_stage_info() if self.orchestrator else {}
        await self.ws.send_json(
            {
                "type": "state_change",
                "state": "INTERRUPT_FLUSH",
                "current_stage": stage_info.get("stage_id", ""),
                "stage_index": stage_info.get("stage_index", 0),
                "total_stages": stage_info.get("total_stages", 1),
                "time_remaining_seconds": stage_info.get("time_remaining_seconds", 0),
            }
        )

        await asyncio.sleep(0.05)
        await self.ws.send_json(
            {
                "type": "state_change",
                "state": "LISTENING",
                "current_stage": stage_info.get("stage_id", ""),
                "stage_index": stage_info.get("stage_index", 0),
                "total_stages": stage_info.get("total_stages", 1),
                "time_remaining_seconds": stage_info.get("time_remaining_seconds", 0),
            }
        )

    async def _handle_candidate_answer_complete(self):
        """Processes candidate's submitted answer, evaluates stage budget,
        streams AI response, and records completed turn.
        """
        if not self.orchestrator or not self.session:
            return

        answer_text = self.current_candidate_text.strip()
        # Reset current transcript buffers
        self.current_candidate_text = ""
        self.candidate_transcript_buffer.clear()

        if not answer_text:
            return

        latency_ms = int((time.time() - self.turn_start_time) * 1000)
        current_turn_index = self.orchestrator.total_turn_count
        active_stage = self.orchestrator.get_current_stage()

        # Send state change to PROCESSING
        stage_info = self.orchestrator.get_stage_info()
        await self.ws.send_json(
            {
                "type": "state_change",
                "state": "PROCESSING",
                "current_stage": stage_info["stage_id"],
                "stage_index": stage_info["stage_index"],
                "total_stages": stage_info["total_stages"],
                "time_remaining_seconds": stage_info["time_remaining_seconds"],
            }
        )

        # Record candidate's answer for previous question
        if self.last_question_text:
            await self.orchestrator.record_completed_turn(
                turn_index=current_turn_index,
                stage_id=active_stage.stage_id,
                question_text=self.last_question_text,
                answer_transcript=answer_text,
                latency_ms=latency_ms,
                was_interrupted=self.was_interrupted,
            )
            await self.ws.send_json(
                {
                    "type": "turn_completed",
                    "turn_index": current_turn_index,
                    "stage_id": active_stage.stage_id,
                    "question_text": self.last_question_text,
                    "answer_transcript": answer_text,
                    "latency_ms": latency_ms,
                    "was_interrupted": self.was_interrupted,
                }
            )

        # Check stage progression
        if self.orchestrator.should_advance_stage():
            transition = self.orchestrator.advance_stage()
            if transition:
                prev_stg, next_stg = transition
                await self.ws.send_json(
                    {
                        "type": "stage_transition",
                        "previous_stage": prev_stg.stage_id,
                        "new_stage": next_stg.stage_id,
                        "title": next_stg.title,
                        "objective": next_stg.objective,
                    }
                )
            elif self.orchestrator.is_completed:
                # All stages completed
                await self._handle_session_end()
                return

        # Cancel any previous AI task still running
        if self.active_ai_task and not self.active_ai_task.done():
            self.active_ai_task.cancel()

        # Stream AI response using Gemini + Cartesia
        self.was_interrupted = False
        self.active_context_id = str(uuid.uuid4())
        self.active_ai_task = asyncio.create_task(
            self._process_ai_response_pipeline(answer_text, self.active_context_id)
        )

    async def _process_ai_response_pipeline(self, answer_text: str, context_id: str):
        """Streams sentences from Gemini to Cartesia and transmits audio chunks to client."""
        if not self.orchestrator or not self.session:
            return

        stage_info = self.orchestrator.get_stage_info()
        await self.ws.send_json(
            {
                "type": "state_change",
                "state": "AI_SPEAKING",
                "current_stage": stage_info["stage_id"],
                "stage_index": stage_info["stage_index"],
                "total_stages": stage_info["total_stages"],
                "time_remaining_seconds": stage_info["time_remaining_seconds"],
            }
        )

        accumulated_ai_response = []
        turn_num = self.orchestrator.total_turn_count + 1
        ai_stream = self.orchestrator.stream_ai_response(answer_text, self.session)

        try:
            phrase_idx = 0
            async for phrase in ai_stream:
                if self.was_interrupted:
                    break
                accumulated_ai_response.append(phrase)
                phrase_idx += 1
                phrase_context_id = f"{context_id}-{phrase_idx}"
                self.active_context_id = phrase_context_id

                # Send real-time transcript update to UI
                await self.ws.send_json(
                    {
                        "type": "transcript_update",
                        "speaker": "ai",
                        "text": " ".join(accumulated_ai_response),
                        "is_final": False,
                    }
                )

                # Synthesize and stream audio chunks for this phrase
                await self._stream_tts(phrase, phrase_context_id, turn_num)

            full_text = " ".join(accumulated_ai_response)
            self.last_question_text = full_text

            await self.ws.send_json(
                {
                    "type": "transcript_update",
                    "speaker": "ai",
                    "text": full_text,
                    "is_final": True,
                }
            )

        except asyncio.CancelledError:
            logger.info("AI response pipeline task cancelled.")
            partial_text = " ".join(accumulated_ai_response).strip()
            self.last_question_text = partial_text or "[Response interrupted]"
        except Exception as e:
            logger.error("Error in AI response pipeline: %s", e)
            try:
                await self.ws.send_json(
                    {
                        "type": "error",
                        "code": "SESSION_RUNTIME_ERROR",
                        "message": str(e),
                        "fatal": True,
                    }
                )
            except Exception:
                pass
            raise
        finally:
            await ai_stream.aclose()
            self.turn_start_time = time.time()
            if not self.was_interrupted:
                stage_info = self.orchestrator.get_stage_info()
                await self.ws.send_json(
                    {
                        "type": "state_change",
                        "state": "LISTENING",
                        "current_stage": stage_info["stage_id"],
                        "stage_index": stage_info["stage_index"],
                        "total_stages": stage_info["total_stages"],
                        "time_remaining_seconds": stage_info["time_remaining_seconds"],
                    }
                )

    async def _stream_tts(self, text: str, context_id: str, turn_index: int):
        """Synthesizes text through Cartesia and forwards chunks to client."""
        if not self.tts_service or self.was_interrupted:
            return

        chunk_idx = 0
        try:
            async for base64_chunk in self.tts_service.stream_synthesize(text, context_id):
                if self.was_interrupted:
                    break
                chunk_idx += 1
                await self.ws.send_json(
                    {
                        "type": "ai_audio_chunk",
                        "turn_index": turn_index,
                        "chunk_index": chunk_idx,
                        "data": base64_chunk,
                    }
                )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Error streaming Cartesia TTS chunks: %s", e)

    async def _handle_session_end(self):
        """Handles completion of the interview session."""
        if self.orchestrator:
            await self.orchestrator.complete_session()

        await self.ws.send_json(
            {
                "type": "session_completed",
                "session_id": str(self.session_id),
                "message": "Interview completed successfully. Proceeding to evaluation.",
            }
        )
        self._is_closed = True
        await self.ws.close(code=status.WS_1000_NORMAL_CLOSURE, reason="Interview completed")

    async def cleanup(self):
        """Cleans up active tasks and open third-party sockets."""
        self._is_closed = True
        if self.stt_task and not self.stt_task.done():
            self.stt_task.cancel()
        if self.active_ai_task and not self.active_ai_task.done():
            self.active_ai_task.cancel()
        if self.stt_service:
            await self.stt_service.close()
        if self.tts_service:
            await self.tts_service.close()


@ws_router.websocket("/{session_id}/live")
async def live_interview_websocket(
    websocket: WebSocket,
    session_id: uuid.UUID,
    token: Optional[str] = None,
):
    """Bidirectional WebSocket connection for live conversational interview.
    Streams 16kHz PCM audio and JSON control frames between candidate and voice engine.
    """
    await websocket.accept()
    handler = WebSocketSessionHandler(websocket, session_id)
    token_val = token or websocket.cookies.get("access_token")
    authenticated = await handler.authenticate_and_verify(token_val)
    if not authenticated:
        return

    await handler.run()
