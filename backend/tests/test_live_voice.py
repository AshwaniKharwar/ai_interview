import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from apps.auth.models import User
from apps.interview.models import InterviewSession, InterviewStatus, InterviewTurn
from apps.interview.services.orchestrator import ConversationalOrchestrator
from apps.interview.services.stt_service import DeepgramSTTService
from apps.interview.services.tts_service import CartesiaTTSService
from core.config import settings
from core.security import create_access_token
from main import app


@pytest.mark.asyncio
async def test_stt_strictly_fails_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "DEEPGRAM_API_KEY", "")
    with pytest.raises(ValueError, match="DEEPGRAM_API_KEY is not configured"):
        DeepgramSTTService()


@pytest.mark.asyncio
async def test_tts_strictly_fails_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "CARTESIA_API_KEY", "")
    with pytest.raises(ValueError, match="CARTESIA_API_KEY is not configured"):
        CartesiaTTSService()


@pytest.mark.asyncio
async def test_orchestrator_stage_progression_and_turns(db_session: AsyncSession):
    # 1. Create a user
    user = User(
        id=uuid.uuid4(),
        email="candidate@example.com",
        full_name="Candidate User",
        google_id="google-cand-123",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    # 2. Create an interview session with 2 stages
    blueprint_mock = {
        "total_duration_minutes": 30,
        "difficulty_level": "medium",
        "interviewer_persona": "rigorous_collaborative",
        "stages": [
            {
                "stage_id": "warmup",
                "title": "Warmup & Resume",
                "duration_minutes": 5,
                "min_turns": 1,
                "max_turns": 2,
                "objective": "Understand background",
                "transition_criteria": "Clear intro",
                "focus_areas": ["Career", "Projects"],
                "starter_questions": ["Tell me about yourself."],
                "follow_up_probes": ["What technologies did you use?"],
            },
            {
                "stage_id": "technical",
                "title": "Technical Deep Dive",
                "duration_minutes": 15,
                "min_turns": 2,
                "max_turns": 4,
                "objective": "Assess architecture",
                "transition_criteria": "Deep answers",
                "focus_areas": ["Concurrency", "Databases"],
                "starter_questions": ["Explain how you handled concurrency."],
                "follow_up_probes": ["What was the bottleneck?"],
            },
        ],
    }

    session = InterviewSession(
        id=uuid.uuid4(),
        user_id=user.id,
        job_title="Senior Python Engineer",
        job_description_raw="We need a strong Python engineer.",
        blueprint_json=blueprint_mock,
        status=InterviewStatus.BLUEPRINT_READY.value,
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(session)

    # Factory returning the active test session
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_factory():
        yield db_session

    orchestrator = ConversationalOrchestrator(session.id, session_factory)

    # Initialize
    sess_loaded, initial_stage = await orchestrator.initialize()
    assert initial_stage.stage_id == "warmup"
    assert orchestrator.get_current_stage().stage_id == "warmup"

    # Stage turn 0: should not advance
    assert not orchestrator.should_advance_stage()

    # Generate initial greeting
    greeting = await orchestrator.generate_initial_greeting(sess_loaded)
    assert "Warmup & Resume" in greeting
    assert orchestrator.current_stage_turn_count == 1

    # Record turn
    turn1 = await orchestrator.record_completed_turn(
        turn_index=1,
        stage_id="warmup",
        question_text=greeting,
        answer_transcript="I have 5 years of Python experience.",
        latency_ms=650,
        was_interrupted=False,
    )
    assert turn1.id is not None
    assert turn1.latency_ms == 650

    # Advance stage when max turns reached
    orchestrator.current_stage_turn_count = 2
    assert orchestrator.should_advance_stage()

    transition = orchestrator.advance_stage()
    assert transition is not None
    prev_stg, next_stg = transition
    assert prev_stg.stage_id == "warmup"
    assert next_stg.stage_id == "technical"
    assert orchestrator.current_stage_turn_count == 0

    # Advance again from technical (last stage) -> marks complete
    orchestrator.current_stage_turn_count = 4
    assert orchestrator.should_advance_stage()
    final_transition = orchestrator.advance_stage()
    assert final_transition is None
    assert orchestrator.is_completed

    await orchestrator.complete_session()
    await db_session.refresh(session)
    assert session.status == InterviewStatus.COMPLETED.value


from unittest.mock import AsyncMock
from apps.interview.ws_router import WebSocketSessionHandler


@pytest.mark.asyncio
async def test_websocket_missing_token_rejected(db_session: AsyncSession):
    random_uuid = uuid.uuid4()
    mock_ws = AsyncMock()
    mock_ws.cookies = {}
    mock_ws.receive.side_effect = TimeoutError()

    handler = WebSocketSessionHandler(mock_ws, random_uuid)
    authenticated = await handler.authenticate_and_verify(token_param=None)
    assert authenticated is False
    mock_ws.close.assert_called_once()
    assert mock_ws.close.call_args[1]["code"] == 1008


@pytest.mark.asyncio
async def test_websocket_invalid_token_rejected(db_session: AsyncSession):
    random_uuid = uuid.uuid4()
    mock_ws = AsyncMock()

    handler = WebSocketSessionHandler(mock_ws, random_uuid)
    authenticated = await handler.authenticate_and_verify(token_param="invalid.bearer.token")
    assert authenticated is False
    mock_ws.close.assert_called_once()
    assert mock_ws.close.call_args[1]["code"] == 1008


@pytest.mark.asyncio
async def test_websocket_cross_user_session_access_rejected(db_session: AsyncSession):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_factory():
        yield db_session

    user1 = User(
        id=uuid.uuid4(),
        email="user1@example.com",
        full_name="User One",
        google_id="g1",
        is_active=True,
    )
    user2 = User(
        id=uuid.uuid4(),
        email="user2@example.com",
        full_name="User Two",
        google_id="g2",
        is_active=True,
    )
    db_session.add_all([user1, user2])
    await db_session.commit()

    session = InterviewSession(
        id=uuid.uuid4(),
        user_id=user1.id,
        job_title="DevOps",
        job_description_raw="DevOps role",
        status=InterviewStatus.BLUEPRINT_READY.value,
    )
    db_session.add(session)
    await db_session.commit()

    token_user2 = create_access_token({"sub": str(user2.id)})
    mock_ws = AsyncMock()

    handler = WebSocketSessionHandler(mock_ws, session.id)
    handler.session_factory = session_factory
    authenticated = await handler.authenticate_and_verify(token_param=token_user2)
    assert authenticated is False
    mock_ws.close.assert_called_once()
    assert mock_ws.close.call_args[1]["code"] == 1008


@pytest.mark.asyncio
async def test_websocket_draft_session_rejected(db_session: AsyncSession):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_factory():
        yield db_session

    user = User(
        id=uuid.uuid4(),
        email="draftuser@example.com",
        full_name="Draft User",
        google_id="g_draft",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    session = InterviewSession(
        id=uuid.uuid4(),
        user_id=user.id,
        job_title="Frontend",
        job_description_raw="Frontend role",
        status=InterviewStatus.DRAFT.value,
    )
    db_session.add(session)
    await db_session.commit()

    token = create_access_token({"sub": str(user.id)})
    mock_ws = AsyncMock()

    handler = WebSocketSessionHandler(mock_ws, session.id)
    handler.session_factory = session_factory
    authenticated = await handler.authenticate_and_verify(token_param=token)
    assert authenticated is False
    mock_ws.close.assert_called_once()
    assert mock_ws.close.call_args[1]["code"] == 1008


@pytest.mark.asyncio
async def test_websocket_missing_voice_credentials_fails_fast(db_session: AsyncSession, monkeypatch):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_factory():
        yield db_session

    monkeypatch.setattr(settings, "DEEPGRAM_API_KEY", "")
    user = User(
        id=uuid.uuid4(),
        email="readyuser@example.com",
        full_name="Ready User",
        google_id="g_ready",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    session = InterviewSession(
        id=uuid.uuid4(),
        user_id=user.id,
        job_title="QA Engineer",
        job_description_raw="QA role",
        status=InterviewStatus.BLUEPRINT_READY.value,
    )
    db_session.add(session)
    await db_session.commit()

    token = create_access_token({"sub": str(user.id)})
    mock_ws = AsyncMock()

    handler = WebSocketSessionHandler(mock_ws, session.id)
    handler.session_factory = session_factory
    authenticated = await handler.authenticate_and_verify(token_param=token)
    assert authenticated is False
    mock_ws.send_json.assert_called_once()
    sent_payload = mock_ws.send_json.call_args[0][0]
    assert sent_payload["code"] == "MISSING_SERVICE_CREDENTIALS"
    assert sent_payload["fatal"] is True
    assert mock_ws.close.call_args[1]["code"] == 1011


@pytest.mark.asyncio
async def test_websocket_interrupt_handling():
    from unittest.mock import MagicMock
    mock_ws = AsyncMock()
    handler = WebSocketSessionHandler(mock_ws, uuid.uuid4())
    task_mock = MagicMock()
    task_mock.done.return_value = False
    handler.active_ai_task = task_mock
    handler.active_context_id = "test-context-123"
    handler.tts_service = AsyncMock()

    await handler._handle_interrupt()

    assert handler.was_interrupted is True
    handler.tts_service.cancel_context.assert_called_once_with("test-context-123")
    assert mock_ws.send_json.call_count >= 2
    # Verify interrupt_ack sent
    ack_call = mock_ws.send_json.call_args_list[0][0][0]
    assert ack_call["type"] == "interrupt_ack"



