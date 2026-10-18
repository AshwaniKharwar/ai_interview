# Phase 2: Live Voice Interaction Engine (STT + LLM + TTS)

## 1. Objective & Scope

Phase 2 constitutes the conversational heart of the AI Interview System. The AI interviewer conducts natural, low-latency, two-way technical speech interactions with the candidate over a persistent bidirectional WebSocket connection.

The engine executes the structured stage-by-stage blueprint generated in Phase 1 (Warmup, Technical Deep Dive, Behavioral, Wrap-up), manages turn budgets, evaluates transition criteria, and handles natural conversational dynamics: turn-taking, pauses for technical thought, and seamless barge-in (interruption).

---

## 2. Selected Architecture: Modular Pipeline (Deepgram + Gemini + Cartesia)

In accordance with system specifications and high transcription accuracy requirements for Phase 4 scoring, Phase 2 implements the **Modular Pipeline**:

```
[Candidate Voice] 
       │
       ▼ (16kHz PCM Audio Stream)
┌──────────────────────────────────────────────┐
│        Frontend Web Audio Worklet            │
│  - Downsample hardware rate (48k) to 16kHz   │
│  - Client VAD (1.2s-1.5s thinking tolerance) │
│  - Echo Cancellation (AEC) & Noise Suppr.    │
└──────────────────────┬───────────────────────┘
                       │ WebSocket (Binary Audio / JSON Events)
                       ▼
┌──────────────────────────────────────────────┐
│        FastAPI WebSocket Gateway             │
│          /ws/interview/{session_id}          │
└──────────────┬───────────────────────────────┘
               │
      ┌────────┴───────────────────────────┐
      │ (Streaming PCM)                    │ (Interim & Final Transcripts)
      ▼                                    ▲
┌───────────────────────────┐              │
│   Deepgram Nova-2 (STT)   ├──────────────┘
│   - Streaming WebSocket   │
│   - Sub-150ms transcription│
└───────────────────────────┘
               │
               ▼ (Final Candidate Turn Text)
┌──────────────────────────────────────────────┐
│     Conversational Stage Orchestrator        │
│  - Injects Phase 1 Blueprint & Stage Rubrics │
│  - Enforces min/max turns & elapsed timings  │
│  - Evaluates follow-up probes vs next stage  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼ (Prompt Context + History)
┌──────────────────────────────────────────────┐
│        Google Gemini 2.0 Flash (LLM)         │
│  - Streaming text token generation           │
│  - TTFT ~180ms                               │
└──────────────────────┬───────────────────────┘
                       │ (Streaming Text Tokens / Sentences)
                       ▼
┌──────────────────────────────────────────────┐
│          Cartesia Sonic (TTS)                │
│  - Streaming WebSocket synthesis             │
│  - Time-to-First-Audio ~120ms                │
│  - High-naturalness conversational voice     │
└──────────────────────┬───────────────────────┘
                       │ (PCM / MP3 Audio Chunks)
                       ▼
┌──────────────────────────────────────────────┐
│          Frontend Audio Player               │
│  - Sequential gapless AudioContext scheduler │
│  - Instant flush on barge-in / interrupt     │
│  - Real-time Audio Spectrum Visualizer       │
└──────────────────────────────────────────────┘
```

### Latency Budget Breakdown:
```
Candidate stops speaking (silence detected)
  ──► VAD Speech-End Trigger: 400ms – 600ms (client)
  ──► Deepgram Final Transcript: 120ms – 150ms
  ──► Gemini 3.5 Flash lite First Token: 150ms – 200ms
  ──► Cartesia Sonic First Audio Chunk: 90ms – 120ms
  ──► Network & Playback Buffer: 40ms – 60ms
────────────────────────────────────────────────────
[Total Latency to AI Voice Playback: ~800ms – 1,100ms]
```

---

## 3. Environment & Credentials Configuration

Per the repository's **Strict Zero-Fallback Policy** ([AGENTS.md](file:///Users/ashwanikharwar/workspace/ai_interview_system/AGENTS.md)), all required service credentials must be explicitly validated at startup and connection time:

```python
# backend/core/config.py additions
DEEPGRAM_API_KEY: str = Field(..., description="Deepgram Nova-2 API key for streaming STT")
CARTESIA_API_KEY: str = Field(..., description="Cartesia Sonic API key for ultra-low latency TTS")
CARTESIA_VOICE_ID: str = Field(
    default="248be419-c632-4f23-adf1-5324ed7dbf10", 
    description="Cartesia Sonic Voice ID (default: Barbershop / conversational English)"
)
CARTESIA_MODEL_ID: str = Field(default="sonic-english", description="Cartesia model ID")
```

If `DEEPGRAM_API_KEY` or `CARTESIA_API_KEY` is missing or invalid, the WebSocket connection must immediately close with an explicit error code (`1011 Internal Error`) and diagnostics, with zero synthetic mock audio fallbacks.

---

## 4. WebSocket Protocol Specification (`/ws/interview/{session_id}`)

### 4.1 Connection & Authentication Handshake
Browsers cannot attach custom headers (`Authorization: Bearer ...`) in standard `new WebSocket()`. Authentication is handled via connection handshake:
1. **URL**: `ws://localhost:8000/api/v1/interviews/{session_id}/live?token=<jwt_access_token>`
2. **Alternative Handshake Frame**: If token is omitted from query params, client must transmit an `auth` message within **3000ms** of socket connection:
   ```json
   {
     "type": "auth",
     "token": "<jwt_access_token>"
   }
   ```
3. **Session Verification**:
   - Backend validates the JWT and resolves `current_user`.
   - Backend verifies that `session.user_id == current_user.id`.
   - Backend verifies that `session.status` is either `BLUEPRINT_READY` or `IN_PROGRESS`.
   - If invalid, backend closes connection with code `1008 (Policy Violation)`.
   - On success, backend sends `auth_success` and transitions session status to `IN_PROGRESS`.

---

### 4.2 Client-to-Server Messages

#### A. Binary Frame (Preferred Audio Transport)
* **Format**: Raw binary WebSocket frame containing 16-bit signed linear PCM, mono, 16,000 Hz.
* **Chunk Frequency**: Every 50ms – 100ms (1,600 to 3,200 bytes per chunk).

#### B. Text Control Frames (JSON)

```json
// 1. Client confirms microphone/speaker ready and initiates the session
{
  "type": "client_ready"
}

// 2. Base64 Audio Chunk (Fallback if binary transport unsupported)
{
  "type": "audio_chunk",
  "data": "<base64_encoded_pcm16_mono_16khz>"
}

// 3. VAD Event: Candidate speech started
{
  "type": "speech_started",
  "timestamp": 1729241800123
}

// 4. VAD Event: Candidate speech stopped
{
  "type": "speech_stopped",
  "timestamp": 1729241808450
}

// 5. Interruption (Barge-in): Candidate spoke while AI was playing speech
{
  "type": "interrupt",
  "timestamp": 1729241804200
}

// 6. Manual Answer Complete (User clicks "Finish Answer" button without waiting for silence)
{
  "type": "finish_answer"
}

// 7. Text Message Fallback (If mic fails or user types clarification)
{
  "type": "text_message",
  "text": "Could you clarify what you mean by event idempotency?"
}

// 8. Graceful Session End requested by candidate
{
  "type": "end_session"
}
```

---

### 4.3 Server-to-Client Messages

```json
// 1. Authentication & Initialization Acknowledgment
{
  "type": "auth_success",
  "session_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "status": "IN_PROGRESS",
  "active_stage": {
    "stage_id": "warmup_background",
    "title": "Introduction & Resume Walkthrough",
    "duration_minutes": 4,
    "max_turns": 4
  }
}

// 2. Streaming AI Audio Chunk (JSON wrapper with base64 PCM 24kHz or MP3)
{
  "type": "ai_audio_chunk",
  "turn_index": 1,
  "chunk_index": 4,
  "data": "<base64_encoded_audio_bytes>"
}

// 3. Real-time Transcript Updates (Interim or Final)
{
  "type": "transcript_update",
  "speaker": "candidate", // or "ai"
  "text": "In our architecture, we chose Kafka over RabbitMQ because...",
  "is_final": true
}

// 4. Conversational State Change
{
  "type": "state_change",
  "state": "AI_SPEAKING", // INIT, AI_SPEAKING, LISTENING, PROCESSING, INTERRUPT_FLUSH, COMPLETED
  "current_stage": "technical_deep_dive",
  "stage_index": 1,
  "total_stages": 4,
  "time_remaining_seconds": 1340
}

// 5. Stage Transition Notification
{
  "type": "stage_transition",
  "previous_stage": "warmup_background",
  "new_stage": "technical_deep_dive",
  "title": "System Design & Technical Architecture",
  "objective": "Evaluate deep architectural trade-offs, concurrency, and failure modes"
}

// 6. Interruption Acknowledged (Instructs frontend to instantly flush audio playback buffer)
{
  "type": "interrupt_ack",
  "turn_index": 2
}

// 7. Turn Completed Record
{
  "type": "turn_completed",
  "turn_index": 2,
  "stage_id": "technical_deep_dive",
  "question_text": "How did you handle consumer lag spikes?",
  "answer_transcript": "We set up an alert on Kafka consumer lag and auto-scaled consumers...",
  "latency_ms": 780,
  "was_interrupted": false
}

// 8. Session Wrap-Up & Completion
{
  "type": "session_completed",
  "session_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "message": "Interview completed successfully. Proceeding to evaluation."
}

// 9. Structured Diagnostic Error
{
  "type": "error",
  "code": "STT_SERVICE_ERROR",
  "message": "Deepgram streaming connection dropped. Reconnecting...",
  "fatal": false
}
```

---

## 5. Conversational State Machine & Stage Orchestration

```
              ┌──────────────────────────────────────────────┐
              │                     INIT                     │
              │  (Auth, Load Blueprint, Open STT/TTS Pipes)  │
              └──────────────────────┬───────────────────────┘
                                     │ client_ready
                                     ▼
              ┌──────────────────────────────────────────────┐
              │                 AI_SPEAKING                  │
              │ (Streams stage question / response to user)  │
              └──────────────┬───────────────────────────────┘
                             │
             ┌───────────────┴────────────────┐
             │ AI playback stream finishes     │ Candidate Interruption (Barge-in)
             ▼                                 ▼
┌───────────────────────────────┐  ┌─────────────────────────────────────────┐
│           LISTENING           │  │            INTERRUPT_FLUSH              │
│ (Awaiting candidate speech;   │  │ (Cancel Gemini stream, abort Cartesia,  │
│  VAD monitors voice activity) │  │  flush frontend buffer, send ack)       │
└──────────────┬────────────────┘  └────────────────────┬────────────────────┘
               │                                        │
               │ Candidate stops speaking /             │ Candidate resumes speaking
               │ clicks "Finish Answer"                 │
               ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                                PROCESSING                                  │
│ 1. Deepgram commits final candidate transcript                             │
│ 2. Stage Orchestrator assesses stage budget (turns + duration):             │
│    - If turns >= max_turns OR time expired -> Advance to next stage        │
│    - Else -> Select follow-up probe or dynamic rubric question             │
│ 3. Gemini 2.0 Flash streams response tokens                                │
│ 4. Cartesia Sonic synthesizes audio chunks on first complete phrase        │
│ 5. Store completed turn in `interview_turns`                                │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ First audio chunk ready
                                      ▼
                            (Return to AI_SPEAKING)
```

### 5.1 Dynamic Stage Orchestrator Logic
The backend orchestrator deterministically governs stage transitions so the interview maintains structure:
1. **Context Assembly**: Compiles Phase 1 `parsed_resume_json`, `parsed_jd_json`, `gap_analysis_json`, and active stage `probing_rubric` into the Gemini system prompt.
2. **Turn Budgeting**:
   - Each stage has `min_turns` and `max_turns` (e.g., Warmup: 2–4 turns; Technical: 6–12 turns).
   - If candidate response satisfies the stage's `transition_criteria` and `turn >= min_turns`, orchestrator transitions stage.
   - If `turn >= max_turns` or elapsed time exceeds stage minutes, stage transition is forced automatically.
3. **Stage Conclusion**:
   - Once the final `wrap_up` stage finishes, the orchestrator triggers graceful closure, updates `interview_sessions.status = "COMPLETED"`, and notifies client via `session_completed`.

---

## 6. Barge-in, Echo Cancellation & Audio Defense

Natural conversations include interjections, clarifications, and quick corrections. Robust barge-in requires defensive audio engineering:

### 6.1 Hardware Echo Cancellation (AEC)
Without AEC, the candidate's microphone captures the AI voice emitting from laptop speakers, immediately triggering a false barge-in:
```typescript
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    sampleRate: 16000,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});
```

### 6.2 Speech Duration Filter (False Positive Prevention)
Short coughs, background clatter, or keyboard clicks must **not** interrupt the AI:
* The client-side VAD requires candidate speech energy to persist for **$\ge$250ms** continuously before emitting the `interrupt` event.
* If candidate stops speaking within 200ms, the event is treated as noise.

### 6.3 Cancellation Flow
1. Candidate speaks $\ge$250ms while AI is in `AI_SPEAKING` state.
2. Frontend immediately pauses local `AudioContext` playback and clears its audio chunk queue.
3. Frontend sends `{"type": "interrupt", "timestamp": ...}` to WebSocket.
4. Backend:
   - Cancels the active Gemini generation `asyncio.Task`.
   - Sends cancellation/abort signal to Cartesia TTS streaming socket.
   - Discards pending unstreamed audio chunks.
   - Records `was_interrupted = True` on the current turn.
   - Sends `{"type": "interrupt_ack", "turn_index": ...}`.
   - Transitions state to `LISTENING`.

---

## 7. Frontend Audio Architecture (Web Audio API)

### 7.1 Audio Capture & Resampling (`AudioWorklet`)
Browsers record at hardware clock rates (44,100Hz or 48,000Hz). Deepgram expects 16,000Hz PCM:
* An `AudioWorkletNode` performs real-time linear interpolation downsampling from the context's sample rate down to 16,000Hz.
* Converts 32-bit float audio frames to 16-bit signed integer PCM buffers.
* Dispatches chunks to the worker/WebSocket without blocking the React UI thread.

### 7.2 Technical Thinking Pauses (Adaptive VAD)
In engineering interviews, candidates often pause 1 to 2 seconds to formulate thoughts:
* Standard 400ms VAD silence timers cut candidates off prematurely.
* **Configured Silence Threshold**: **1,200ms to 1,500ms** of continuous silence before committing the turn.
* **Manual Override**: UI provides a prominent **"Finish Answer"** CTA button allowing candidates to immediately submit their turn without waiting for the silence timer.

### 7.3 Gapless Audio Queue Player
* Manages an array of incoming PCM/MP3 audio buffers.
* Schedules chunks back-to-back using `AudioContext.currentTime` precision scheduling to avoid audible pops, clicks, or gaps between streaming chunks.
* `flush()` instantly calls `stop()` on all scheduled `AudioBufferSourceNodes` when an interrupt occurs.

### 7.4 Autoplay Policy Compliance
Modern browsers reject audio playback until a user gesture occurs:
* Candidates must pass through a **"Microphone & Audio Setup"** modal.
* Clicking **"Join Interview"** triggers `audioContext.resume()` on the user click event, ensuring seamless voice playback throughout the session.

---

## 8. Database Schema for Turns (`interview_turns`)

```python
# backend/apps/interview/models.py
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base
from apps.interview.models import JSON_TYPE


class InterviewTurn(Base):
    __tablename__ = "interview_turns"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4, 
        index=True
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"), 
        index=True,
        nullable=False,
    )
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    
    stage_id: Mapped[str] = mapped_column(String(100), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    answer_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timing & Performance Telemetry
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    was_interrupted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Phase 4 Hook: Structured evaluation of this specific turn
    turn_evaluation_json: Mapped[dict | None] = mapped_column(JSON_TYPE, nullable=True)

    # Relationships
    session: Mapped["InterviewSession"] = relationship("InterviewSession", back_populates="turns")

    def __repr__(self) -> str:
        return f"<InterviewTurn id={self.id} session_id={self.session_id} turn={self.turn_index} stage={self.stage_id}>"
```

And update `InterviewSession` in `backend/apps/interview/models.py`:
```python
# Added to InterviewSession:
turns: Mapped[list["InterviewTurn"]] = relationship(
    "InterviewTurn",
    back_populates="session",
    cascade="all, delete-orphan",
    order_by="InterviewTurn.turn_index",
)
```

---

## 9. Frontend Room UI & UX Flow (`/interview/[id]/room`)

### 9.1 Component Layout Hierarchy
```
frontend/src/app/interview/[id]/room/page.tsx
├── DeviceCheckModal (Pre-flight Mic & Speaker Check + Headphone Warning)
└── AuthenticatedLayout
    ├── StageProgressHeader
    │   ├── Stage Badges (Warmup -> Technical -> Behavioral -> Wrap-up)
    │   ├── Turn Counter ("Turn 3 of 8")
    │   └── Countdown Clock ("21:45 remaining")
    ├── Center Stage:
    │   ├── AudioVisualizer (3D Glowing Orb or dynamic SVG frequency bars)
    │   └── ConversationalStatusBadge ("AI Speaking...", "Listening...", "Thinking...")
    ├── LiveTranscriptPanel
    │   ├── Auto-scrolling conversation history
    │   ├── Interim speech preview
    │   └── Speaker tags (Interviewer / Candidate)
    └── ControlBar
        ├── Mic Mute / Unmute Toggle
        ├── "Finish Answer" Button (Green CTA)
        ├── Text Input Fallback drawer toggle
        └── "End Interview" Red Button (with confirmation dialog)
```

---

## 10. Implementation Plan & File Checklist

### 10.1 Backend Tasks (`/backend`)
- [ ] Add `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` to `backend/core/config.py`.
- [ ] Add `deepgram-sdk` and `cartesia` (or async websockets client) to `pyproject.toml`.
- [ ] Implement `InterviewTurn` model in `backend/apps/interview/models.py` and relate to `InterviewSession`.
- [ ] Create `backend/apps/interview/services/stt_service.py` (Deepgram streaming client).
- [ ] Create `backend/apps/interview/services/tts_service.py` (Cartesia streaming client).
- [ ] Create `backend/apps/interview/services/orchestrator.py` (Stage progression, turn counting, prompt assembling).
- [ ] Create `backend/apps/interview/ws_router.py` (WebSocket path `/api/v1/interviews/{session_id}/live` with auth handshake).
- [ ] Mount WebSocket router in `backend/main.py` and `backend/apps/interview/router.py`.

### 10.2 Frontend Tasks (`/frontend`)
- [ ] Create domain API service `frontend/src/lib/api/services/live-session.service.ts` per `AGENTS.md`.
- [ ] Implement `frontend/src/lib/audio/pcm-resampler.worklet.ts` (downsample to 16kHz PCM).
- [ ] Implement `frontend/src/lib/audio/audio-player.ts` (gapless Web Audio queue player with flush).
- [ ] Implement `frontend/src/lib/audio/vad.ts` (voice activity energy threshold detector).
- [ ] Implement `frontend/src/hooks/useLiveInterview.ts` (WebSocket coordination, state machine, audio I/O).
- [ ] Build UI components:
  - `DeviceCheckModal.tsx`
  - `StageProgressHeader.tsx`
  - `AudioVisualizer.tsx`
  - `LiveTranscript.tsx`
  - `InterviewControls.tsx`
- [ ] Wire full room in `frontend/src/app/interview/[id]/room/page.tsx`.

### 10.3 Verification & Quality Gate
- [ ] Backend test suite: `cd backend && .venv/bin/pytest tests/ -v`
- [ ] Frontend build verification: `cd frontend && bun run lint && bun run build`
