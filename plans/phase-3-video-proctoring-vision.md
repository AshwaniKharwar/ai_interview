# Phase 3: Live Video Proctoring & Computer Vision

## 1. Objective & Scope

Phase 3 introduces automated computer vision proctoring to evaluate candidate engagement, eye contact, and interview integrity. The system monitors live video in real time to detect:
1. **Head pose & gaze movement** (looking away from the screen, prolonged downward glances at notes).
2. **Face presence** (no face in frame, or multiple people in frame).
3. **Unauthorized objects** (mobile phones, secondary screens, smart devices).

---

## 2. Architectural Decision: Client-Side Edge Inference vs Cloud GPUs

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Why Client-Side Edge?                           │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Zero Server GPU Cost: No expensive Nvidia A10G/T4 clusters needed.   │
│ 2. Bandwidth & Privacy: HD video never leaves candidate's machine.     │
│ 3. Millisecond Feedback: Instant detection without network roundtrip.  │
│ 4. GDPR / Biometric Compliance: Only incident thumbnails are saved.     │
└────────────────────────────────────────────────────────────────────────┘
```

The browser executes lightweight neural networks using **WebAssembly (WASM)** and **WebGPU** via **MediaPipe** and **ONNX Runtime Web / TensorFlow.js**.

---

## 3. Vision Detection Modules

```
Video Stream (Webcam 720p @ 30 FPS)
  │
  ├── Frame Sampler (Downsample to 3 - 5 FPS to preserve CPU/battery)
  │
  ├──► Module A: MediaPipe Face Mesh
  │      ├── Head Pose Estimation (Pitch, Yaw, Roll angles)
  │      ├── Iris / Gaze Tracking (Detect left/right/down eye shifts)
  │      └── Face Count (0 = Absent, 1 = Normal, >1 = Unauthorized Person)
  │
  └──► Module B: Object Detection (YOLOv8n ONNX / COCO-SSD)
         ├── Class: "cell phone" (Confidence > 0.75)
         └── Class: "book" / "laptop" (Optional secondary screen detection)
```

### 3.1 Head Pose & Gaze Estimation
Using MediaPipe Face Mesh (468 3D landmarks):
- **Yaw (Horizontal rotation)**: $|\text{Yaw}| > 28^\circ \implies$ Looking sideways.
- **Pitch (Vertical rotation)**: $\text{Pitch} < -20^\circ \implies$ Looking down at lap/desk (potential phone/notes).
- **Temporal Debouncing**: A flag is triggered only if the candidate looks away for **$\ge 4$ continuous seconds**. A quick glance at a thought is completely ignored.

### 3.2 Cell Phone & Object Detection
Using a lightweight **YOLOv8n (nano)** exported to ONNX (~6MB) or **COCO-SSD**:
- Target class: `cell phone` (COCO class ID 67).
- If bounding box detected with confidence $\ge 0.80$ for at least **1.5 seconds**, emit `PHONE_DETECTED`.

---

## 4. Incident Event Pipeline & Anomaly Smoothing

Raw detection outputs fluctuate frame-to-frame. An anomaly pipeline smooths the signal:

```
[Frame Detection: Phone 0.82] ──► Sliding Window Buffer (5 frames)
                                       │
                                       ▼
                     Is condition met for >= 1.5 seconds?
                                       │
                      ┌────────────────┴────────────────┐
                      │ YES                             │ NO
                      ▼                                 ▼
             Trigger Proctoring Event             Discard (Noise)
             1. Capture 320x240 WebP snapshot
             2. Send to FastAPI via WebSocket
             3. Mark on Interview Timeline
```

### 4.3 Incident Event Payload
```json
{
  "type": "proctoring_event",
  "event_type": "PHONE_DETECTED", // LOOKING_AWAY, MULTIPLE_FACES, NO_FACE
  "timestamp_offset_seconds": 412,
  "confidence": 0.88,
  "snapshot_base64": "data:image/webp;base64,UklGRt4AAABXRUJQVlA4..."
}
```

---

## 5. Database Schema for Proctoring

```python
# backend/apps/interview/models.py

class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True)
    turn_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("interview_turns.id", ondelete="SET NULL"), nullable=True)

    event_type: Mapped[str] = mapped_column(String(50), nullable=False) # PHONE_DETECTED, LOOKING_AWAY, MULTIPLE_FACES, NO_FACE
    timestamp_offset_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Visual evidence (stored on local disk / S3 / MinIO)
    snapshot_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

---

## 6. Frontend Candidate Experience & UX

- **Pre-Interview Camera Check**:
  - Test webcam and microphone.
  - Lighting check and face framing guide (bounding box overlay indicating proper face placement).
- **During the Interview**:
  - Discreet, professional PIP (picture-in-picture) webcam preview in the corner.
  - Optional subtle notification: "Please keep your face centered in the frame" if no face is detected for 10 seconds.
  - Avoid overly aggressive warning popups that distract or panic the candidate.

---

## 7. Brainstorming & Decision Points

1. **Active Warning vs Silent Audit**:
   - Should the UI notify the user when a phone or multiple faces are detected (e.g. "Unauthorized object detected"), or should it silently log it for the post-interview report?
   - *Recommendation*: Silent audit with subtle framing reminders. Aggressive warnings derail candidate interview performance.
2. **Model Delivery & Caching**:
   - Models (MediaPipe & YOLOv8n ONNX ~6MB) should be pre-cached in IndexedDB/Service Worker during the setup step so that the live interview starts instantaneously.
3. **Integrity Score Impact**:
   - How heavily should proctoring flags affect the overall score? (e.g. A separate "Integrity Confidence Index: 94%" alongside technical scores).
