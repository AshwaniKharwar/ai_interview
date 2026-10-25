import json
import uuid
from unittest.mock import AsyncMock, MagicMock
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


@pytest.mark.asyncio
async def test_orchestrator_initial_greeting_and_contents_turn_rules(
    db_session: AsyncSession, monkeypatch
):
    from unittest.mock import MagicMock
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_factory():
        yield db_session

    user = User(
        id=uuid.uuid4(),
        email="test_turns@example.com",
        full_name="Turn User",
        google_id="g_turns",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    blueprint_mock = {
        "total_duration_minutes": 15,
        "difficulty_level": "medium",
        "interviewer_persona": "collaborative",
        "stages": [
            {
                "stage_id": "intro",
                "title": "Intro Stage",
                "duration_minutes": 5,
                "min_turns": 1,
                "max_turns": 3,
                "objective": "Intro objective",
                "transition_criteria": "Done intro",
                "focus_areas": ["Intro"],
                "starter_questions": ["Tell me about your background."],
                "follow_up_probes": ["Can you give an example?"],
            }
        ],
    }

    session = InterviewSession(
        id=uuid.uuid4(),
        user_id=user.id,
        job_title="Backend Engineer",
        job_description_raw="Python developer",
        blueprint_json=blueprint_mock,
        status=InterviewStatus.BLUEPRINT_READY.value,
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(session)

    orchestrator = ConversationalOrchestrator(session.id, session_factory)
    await orchestrator.initialize()

    # 1. Verify generate_initial_greeting appends candidate trigger before model greeting
    greeting = await orchestrator.generate_initial_greeting(session)
    assert len(orchestrator.history) == 2
    assert orchestrator.history[0]["role"] == "user"
    assert orchestrator.history[0]["content"] == "Hello, I am ready to begin the interview."
    assert orchestrator.history[1]["role"] == "model"
    assert orchestrator.history[1]["content"] == greeting

    # 2. Mock Gemini client to capture contents passed to generate_content_stream
    captured_contents = []

    async def mock_generate_content_stream(*args, **kwargs):
        captured_contents.append(kwargs.get("contents", []))

        class MockChunk:
            text = "Thank you for sharing that background."

        async def chunk_generator():
            yield MockChunk()

        return chunk_generator()

    mock_client = MagicMock()
    mock_client.aio.models.generate_content_stream = mock_generate_content_stream
    monkeypatch.setattr("apps.interview.services.orchestrator.genai.Client", lambda api_key: mock_client)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "fake-gemini-key")

    # Turn 1: Candidate answers greeting
    chunks = [c async for c in orchestrator.stream_ai_response("I have 4 years of Python.", session)]
    assert len(chunks) == 1
    assert "Thank you" in chunks[0]

    first_call_contents = captured_contents[0]
    assert len(first_call_contents) == 3
    # Gemini requires first content to be user
    assert first_call_contents[0].role == "user"
    assert first_call_contents[0].parts[0].text == "Hello, I am ready to begin the interview."
    assert first_call_contents[1].role == "model"
    assert first_call_contents[1].parts[0].text == greeting
    assert first_call_contents[2].role == "user"
    assert first_call_contents[2].parts[0].text == "I have 4 years of Python."

    # 3. Simulate multi-turn history where slicing [-8:] begins with a model turn
    # Manually populate history to test sliding window trimming
    orchestrator.history = [
        {"role": "user", "content": "u1"},
        {"role": "model", "content": "m1"},
        {"role": "user", "content": "u2"},
        {"role": "model", "content": "m2"},
        {"role": "user", "content": "u3"},
        {"role": "model", "content": "m3"},
        {"role": "user", "content": "u4"},
        {"role": "model", "content": "m4"},
    ]
    # At this point, history has 8 items ending in model.
    # When stream_ai_response is called with u5, history becomes 9 items.
    # history[-8:] would select m1 (model), u2, m2, u3, m3, u4, m4, u5.
    # The trimmer must strip m1 so contents begins with u2 (user).
    captured_contents.clear()
    _ = [c async for c in orchestrator.stream_ai_response("u5", session)]

    second_call_contents = captured_contents[0]
    assert second_call_contents[0].role == "user"
    assert second_call_contents[0].parts[0].text == "u2"
    # Ensure all contents strictly alternate roles
    for i in range(len(second_call_contents) - 1):
        assert second_call_contents[i].role != second_call_contents[i + 1].role

    # 4. Simulate consecutive turns of same role (e.g. candidate interruption)
    orchestrator.history = [
        {"role": "user", "content": "first thought"},
        {"role": "user", "content": "second thought after pause"},
    ]
    captured_contents.clear()
    _ = [c async for c in orchestrator.stream_ai_response("third thought", session)]

    third_call_contents = captured_contents[0]
    assert len(third_call_contents) == 1
    assert third_call_contents[0].role == "user"
    assert "first thought\nsecond thought after pause\nthird thought" in third_call_contents[0].parts[0].text


@pytest.mark.asyncio
async def test_process_ai_response_pipeline_subcontext_ids_per_phrase():
    """Verify that multi-sentence responses generate unique sub-context IDs
    per phrase to prevent Cartesia context collisions.
    """
    mock_ws = AsyncMock()
    session_id = uuid.uuid4()
    handler = WebSocketSessionHandler(mock_ws, session_id)

    # Mock orchestrator yielding 3 distinct phrases
    mock_orchestrator = MagicMock()
    mock_orchestrator.total_turn_count = 1
    mock_orchestrator.get_stage_info.return_value = {
        "stage_id": "warmup",
        "stage_index": 0,
        "total_stages": 2,
        "time_remaining_seconds": 300,
    }

    async def mock_stream_ai_response(answer_text, session):
        yield "First sentence in response."
        yield "Second sentence probing deeper."
        yield "Third sentence concluding question."

    mock_orchestrator.stream_ai_response = mock_stream_ai_response
    handler.orchestrator = mock_orchestrator
    handler.session = MagicMock()

    # Capture calls to _stream_tts
    stream_tts_calls = []

    async def mock_stream_tts(phrase, context_id, turn_num):
        stream_tts_calls.append(
            {
                "phrase": phrase,
                "context_id": context_id,
                "turn_num": turn_num,
                "active_context_at_call": handler.active_context_id,
            }
        )

    handler._stream_tts = mock_stream_tts

    turn_context_id = "test-turn-context-uuid"
    handler.active_context_id = turn_context_id

    await handler._process_ai_response_pipeline("candidate answer", turn_context_id)

    # 1. Verify 3 phrases were streamed
    assert len(stream_tts_calls) == 3

    # 2. Verify subcontext IDs are unique per phrase and follow {context_id}-{phrase_idx}
    assert stream_tts_calls[0]["phrase"] == "First sentence in response."
    assert stream_tts_calls[0]["context_id"] == f"{turn_context_id}-1"
    assert stream_tts_calls[0]["active_context_at_call"] == f"{turn_context_id}-1"

    assert stream_tts_calls[1]["phrase"] == "Second sentence probing deeper."
    assert stream_tts_calls[1]["context_id"] == f"{turn_context_id}-2"
    assert stream_tts_calls[1]["active_context_at_call"] == f"{turn_context_id}-2"

    assert stream_tts_calls[2]["phrase"] == "Third sentence concluding question."
    assert stream_tts_calls[2]["context_id"] == f"{turn_context_id}-3"
    assert stream_tts_calls[2]["active_context_at_call"] == f"{turn_context_id}-3"

    # 3. Final active context ID is the last phrase context ID
    assert handler.active_context_id == f"{turn_context_id}-3"

    # 4. Final question text is joined correctly
    assert (
        handler.last_question_text
        == "First sentence in response. Second sentence probing deeper. Third sentence concluding question."
    )


@pytest.mark.asyncio
async def test_cartesia_tts_empty_text_and_error_handling(monkeypatch):
    """Verify that CartesiaTTSService handles empty strings gracefully and raises
    RuntimeError on Cartesia error frames.
    """
    monkeypatch.setattr(settings, "CARTESIA_API_KEY", "test-cartesia-key")
    service = CartesiaTTSService(api_key="test-cartesia-key")

    # Empty or whitespace text yields nothing and doesn't connect
    chunks = [c async for c in service.stream_synthesize("")]
    assert chunks == []
    chunks_ws = [c async for c in service.stream_synthesize("   \n\t  ")]
    assert chunks_ws == []

    # Test error frame handling
    mock_ws = AsyncMock()

    class MockAsyncIter:
        def __init__(self, items):
            self.items = list(items)

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self.items:
                raise StopAsyncIteration
            return self.items.pop(0)

    error_response = json.dumps(
        {
            "context_id": "sub-ctx-1",
            "type": "error",
            "error": "Context sub-ctx-1 is already closed",
            "status_code": 400,
        }
    )
    mock_ws.__aiter__.side_effect = lambda: MockAsyncIter([error_response])
    service.ws = mock_ws
    service._is_closed = False

    with pytest.raises(RuntimeError, match="Context sub-ctx-1 is already closed"):
        _ = [c async for c in service.stream_synthesize("Hello world", context_id="sub-ctx-1")]


@pytest.mark.asyncio
async def test_orchestrator_barge_in_interruption_persists_model_history_and_prevents_consecutive_user_turns(
    db_session: AsyncSession, monkeypatch
):
    import asyncio
    from unittest.mock import MagicMock
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_factory():
        yield db_session

    user = User(
        id=uuid.uuid4(),
        email="interruption_test@example.com",
        full_name="Interruption User",
        google_id="g_interruption",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    blueprint_mock = {
        "total_duration_minutes": 15,
        "difficulty_level": "medium",
        "interviewer_persona": "collaborative",
        "stages": [
            {
                "stage_id": "warmup",
                "title": "Warmup",
                "duration_minutes": 5,
                "min_turns": 1,
                "max_turns": 3,
                "objective": "Introduction",
                "transition_criteria": "Done",
                "focus_areas": ["Python"],
                "starter_questions": ["Tell me about yourself."],
                "follow_up_probes": ["Any projects?"],
            }
        ],
    }

    session = InterviewSession(
        id=uuid.uuid4(),
        user_id=user.id,
        job_title="Backend Engineer",
        job_description_raw="Python Developer",
        blueprint_json=blueprint_mock,
        status=InterviewStatus.BLUEPRINT_READY.value,
    )
    db_session.add(session)
    await db_session.commit()

    orchestrator = ConversationalOrchestrator(session.id, session_factory)
    await orchestrator.initialize()

    # Initial state: candidate says hello, AI responds with greeting
    orchestrator.history = [
        {"role": "user", "content": "Hello, I am ready to begin."},
        {"role": "model", "content": "Welcome! Could you tell me about your background?"},
    ]

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "fake-gemini-key")

    captured_contents = []

    async def mock_generate_content_stream_interrupted(*args, **kwargs):
        captured_contents.append(kwargs.get("contents", []))

        class MockChunk1:
            text = "That sounds interesting! "

        class MockChunk2:
            text = "Can you elaborate on your Python experience?"

        async def chunk_generator():
            yield MockChunk1()
            await asyncio.sleep(0.5)
            yield MockChunk2()

        return chunk_generator()

    mock_client = MagicMock()
    mock_client.aio.models.generate_content_stream = mock_generate_content_stream_interrupted
    monkeypatch.setattr("apps.interview.services.orchestrator.genai.Client", lambda api_key: mock_client)

    # Turn 1: Candidate starts speaking, AI starts answering, but candidate interrupts
    async def run_and_interrupt():
        stream = orchestrator.stream_ai_response("I have worked with Django for 3 years.", session)
        try:
            async for chunk in stream:
                asyncio.current_task().cancel()
                await asyncio.sleep(0)
        finally:
            await stream.aclose()

    task = asyncio.create_task(run_and_interrupt())
    with pytest.raises(asyncio.CancelledError):
        await task

    # Verify that orchestrator.history contains the interrupted model turn
    assert len(orchestrator.history) == 4
    assert orchestrator.history[2]["role"] == "user"
    assert orchestrator.history[2]["content"] == "I have worked with Django for 3 years."
    assert orchestrator.history[3]["role"] == "model"
    assert orchestrator.history[3]["content"] == "That sounds interesting!"

    # Turn 2: Candidate speaks again on the next turn.
    # Verify that contents sent to Gemini does NOT have consecutive user roles
    captured_contents.clear()

    async def mock_generate_content_stream_turn2(*args, **kwargs):
        captured_contents.append(kwargs.get("contents", []))

        class MockChunk:
            text = "Understood. Let's move to async programming."

        async def chunk_generator():
            yield MockChunk()

        return chunk_generator()

    mock_client.aio.models.generate_content_stream = mock_generate_content_stream_turn2

    _ = [c async for c in orchestrator.stream_ai_response("Also worked with FastAPI.", session)]

    assert len(captured_contents) == 1
    call2_contents = captured_contents[0]
    # Ensure Gemini receives alternating roles: user, model, user, model, user
    assert len(call2_contents) == 5
    for i in range(len(call2_contents)):
        expected_role = "user" if i % 2 == 0 else "model"
        assert call2_contents[i].role == expected_role


@pytest.mark.asyncio
async def test_process_ai_response_pipeline_cancellation_updates_last_question_text():
    """Verify that when active_ai_task is cancelled during response pipeline,
    last_question_text is updated with partial text or interrupted marker.
    """
    import asyncio
    from unittest.mock import MagicMock
    mock_ws = AsyncMock()
    handler = WebSocketSessionHandler(mock_ws, uuid.uuid4())
    mock_orchestrator = MagicMock()
    mock_orchestrator.total_turn_count = 1
    mock_orchestrator.get_stage_info.return_value = {
        "stage_id": "warmup",
        "stage_index": 0,
        "total_stages": 3,
        "time_remaining_seconds": 300,
    }

    async def mock_stream_ai_response(answer_text, session):
        yield "First sentence generated."
        # Simulate interruption during streaming
        raise asyncio.CancelledError()

    mock_orchestrator.stream_ai_response = mock_stream_ai_response
    handler.orchestrator = mock_orchestrator
    handler.session = MagicMock()

    async def mock_stream_tts(text, context_id, turn_num):
        pass

    handler._stream_tts = mock_stream_tts

    # Run pipeline in a task and let it get cancelled
    await handler._process_ai_response_pipeline("candidate answer", "ctx-test-123")

    # Verify last_question_text was persisted with the partial sentence
    assert handler.last_question_text == "First sentence generated."






