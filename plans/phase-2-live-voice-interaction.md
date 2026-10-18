# Phase 2: Live Voice Interaction Engine (STT + LLM + TTS)

## 1. Objective & Scope

Phase 2 is the conversational core of the interview. The AI interviewer interacts with the candidate using natural, low-latency, two-way speech over a persistent WebSocket connection. The interaction must support natural turn-taking, fluid audio streaming, and seamless interruption (barge-in).

---

## 2. Latency Budget & Target

In human conversation, delays greater than **1,000ms** create awkward pauses. We target an end-to-end round-trip latency of **600ms – 900ms**:

```
[Candidate stops speaking] 
  ──► VAD Silence Trigger: 400ms (client)
  ──► Final STT Transcript: 150ms (Deepgram Nova-2 / streaming)
  ──► LLM First Token: 180ms (Gemini 2.0 Flash / Claude 3.5 Haiku)
  ──► TTS First Audio Chunk: 120ms (Cartesia Sonic / ElevenLabs Flash)
  ──► Network & Playback Buffer: 50ms
[Total Time to AI Voice Playback: ~900ms]
```

---

## 3. Architecture Comparison: Modular vs Native Realtime

| Feature | Option A: Modular Pipeline (Deepgram + LLM + Cartesia) | Option B: Native Multimodal (Gemini Live / OpenAI Realtime) |
| :--- | :--- | :--- |
| **Transcription Control** | 100% access to exact text per turn for logging & scoring | Text transcription extracted via secondary hooks |
| **Cost** | Low & Predictable (~$0.015 - $0.03 per minute) | Higher ($0.06 - $0.20 per minute) |
| **Custom Turn Evaluation** | Easy to intercept transcripts between turns | Must be computed post-hoc or via tool calls |
| **Voice Naturalness** | Extremely high (Cartesia Sonic / ElevenLabs) | High, natively responsive |
| **Implementation Complexity** | Medium (handling audio chunks + TTS buffer) | Low-Medium (direct audio stream) |
| **Recommendation** | **Recommended for production control & scoring** | **Great alternative for ultra-rapid prototyping** |

---

## 4. WebSocket Protocol Specification (`/ws/interview/{session_id}`)

### 4.1 Client-to-Server Messages
```json
// 1. Audio stream chunk (candidate microphone PCM or Opus)
{
  "type": "audio_chunk",
  "data": "<base64_encoded_pcm_audio>"
}

// 2. VAD Event: Candidate started speaking
{
  "type": "speech_started",
  "timestamp": 1729241800123
}

// 3. VAD Event: Candidate finished speaking
{
  "type": "speech_stopped",
  "timestamp": 1729241808450
}

// 4. Interruption (Barge-in): User started talking while AI was speaking
{
  "type": "interrupt",
  "timestamp": 1729241804200
}
```

### 4.2 Server-to-Client Messages
```json
// 1. Audio chunk for playback
{
  "type": "ai_audio_chunk",
  "data": "<base64_encoded_pcm_or_mp3>",
  "turn_index": 2
}

// 2. Live transcript updates (for display / closed captions)
{
  "type": "transcript_update",
  "speaker": "candidate", // or "ai"
  "text": "In our architecture, we chose Kafka over RabbitMQ because...",
  "is_final": true
}

// 3. Interview State & Stage Update
{
  "type": "state_change",
  "state": "AI_SPEAKING", // LISTENING, THINKING, AI_SPEAKING, COMPLETED
  "current_stage": "technical_deep_dive",
  "time_remaining_seconds": 1240
}
```

---

## 5. Conversational State Machine

```
              ┌──────────────────────────────────────────────┐
              │                     INIT                     │
              │  (Load Session, Blueprint, Auth Handshake)   │
              └──────────────────────┬───────────────────────┘
                                     │
                                     ▼
              ┌──────────────────────────────────────────────┐
              │                 AI_SPEAKING                  │
              │   (Streams question audio to candidate)      │
              └──────────────┬───────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │ Audio playback finishes          │ Candidate Interrupts (Barge-in)
            ▼                                  ▼
┌───────────────────────────────┐  ┌─────────────────────────────────────────┐
│           LISTENING           │  │            INTERRUPT_FLUSH              │
│ (Awaiting candidate response; │  │ (Cancel pending TTS, clear client audio │
│   VAD detects voice activity) │  │  buffer, transition to LISTENING)       │
└──────────────┬────────────────┘  └─────────────────────────────────────────┘
               │ Candidate stops speaking (VAD silence threshold ~700ms)
               ▼
┌───────────────────────────────┐
│          PROCESSING           │
│ 1. Finalize STT text          │
│ 2. Async dispatch for scoring │
│ 3. LLM decides: follow-up or  │
│    next blueprint question    │
│ 4. Pipe LLM stream into TTS   │
└──────────────┬────────────────┘
               │ First TTS audio chunk ready
               ▼
    (Return to AI_SPEAKING)
```

---

## 6. Barge-in & Interruption Handling

Natural conversations involve occasional interruptions or candidate interjections ("Actually, let me clarify that..."):
1. **Frontend Detection**: When the candidate starts speaking while the audio player is playing AI speech, the frontend **immediately pauses client audio playback**.
2. **Interrupt Packet**: Frontend sends `{"type": "interrupt"}` to the backend WebSocket.
3. **Backend Cancellation**:
   - The backend cancels the running LLM generation task (via `asyncio.Task.cancel()`).
   - Any unplayed TTS chunks in the pipeline queue are discarded.
   - The backend logs the truncated turn and resumes in `LISTENING` mode.

---

## 7. Frontend Audio Architecture (Web Audio API)

- **Audio Capture**: `navigator.mediaDevices.getUserMedia({ audio: true })` using an `AudioWorkletNode` for zero-lag PCM 16kHz capture.
- **Client-Side VAD**: Run **Silero VAD** in a Web Worker or using an RMS energy + zero-crossing threshold to detect speech start/stop without sending dead air.
- **Audio Queue Player**: A sequential buffer using `AudioContext` that queues incoming audio chunks and plays them without stutter, crackles, or audible seams.
- **Visualizer**: Dynamic audio waveform (using canvas or Framer Motion / CSS bars) that pulses with the AI's and candidate's voice.

---

## 8. Database Schema for Turns

```python
# backend/apps/interview/models.py

class InterviewTurn(Base):
    __tablename__ = "interview_turns"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True)
    turn_index: Mapped[int] = mapped_column(Integer, nullable=False)
    
    stage_id: Mapped[str] = mapped_column(String(100), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    answer_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timing & Performance Metrics
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True) # Time from candidate silence to AI speech
    was_interrupted: Mapped[bool] = mapped_column(Boolean, default=False)
```

---

## 9. Brainstorming & Decision Points

1. **TTS Voice Persona**:
   - Should the interviewer sound formal and neutral, or conversational and encouraging? (Voices like Cartesia's "British Teacher" or ElevenLabs' "Rachel / George").
2. **Fallback for Browsers**:
   - For users with poor network connections, should we offer a **Closed-Captions & Text Box Fallback** alongside voice?
3. **Turn-taking Sensitivity**:
   - In technical interviews, candidates often pause for 2-3 seconds to think ("Hmm, let me consider..."). How do we prevent the AI from prematurely cutting them off? (e.g., adaptive silence timeout: 1.5s silence before concluding turn, or verbal acknowledgments like "Take your time").
