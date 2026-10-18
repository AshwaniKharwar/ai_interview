# AI Interview System - Project Plans & Architecture Roadmap

Welcome to the design and implementation plans for the **AI Interview System**. This directory contains detailed blueprints for all four phases of the project, designed to allow modular brainstorming, iterative refinement, and structured implementation.

---

## Architecture Overview

```
                                      ┌────────────────────────────────────────────────┐
                                      │              Next.js 16 Frontend               │
                                      │  - Audio Engine (VAD + Web Audio API)          │
                                      │  - Vision Engine (MediaPipe + ONNX Web)        │
                                      │  - Live Interactive UI & Video Preview         │
                                      └───────────────────────┬────────────────────────┘
                                                              │
                                            Bi-directional WS │ REST / Multipart
                                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              FastAPI Asynchronous Backend                            │
│                                                                                      │
│   ┌────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────┐   │
│   │ Phase 1: Blueprint │   │ Phase 2: Live Gateway     │   │ Phase 3: Proctoring │   │
│   │  - PDF/JD Parser   │   │  - State Orchestrator     │   │  - Event Ingestion  │   │
│   │  - Gap Analysis    │   │  - Audio STT/TTS Bridge   │   │  - Anomaly Logger   │   │
│   │  - Plan Generator  │   │  - Barge-in Controller    │   │  - Snapshot Storage │   │
│   └─────────┬──────────┘   └─────────────┬─────────────┘   └──────────┬──────────┘   │
│             │                            │                            │              │
│             └───────────────────┐        │        ┌───────────────────┘              │
│                                 ▼        ▼        ▼                                  │
│                            ┌───────────────────────────┐                             │
│                            │ Phase 4: Scoring Engine   │                             │
│                            │  - Turn-level Evaluator   │                             │
│                            │  - Global Feedback Report │                             │
│                            │  - Integrity Score Matrix │                             │
│                            └─────────────┬─────────────┘                             │
│                                          │                                           │
└──────────────────────────────────────────┼───────────────────────────────────────────┘
                                           │
                                           ▼
                             ┌───────────────────────────┐
                             │ PostgreSQL DB (SQLAlchemy)│
                             │  - Users & Profiles       │
                             │  - Sessions & Turns       │
                             │  - Proctoring Logs        │
                             │  - Evaluation Reports     │
                             └───────────────────────────┘
```

---

## Phase Breakdown Index

| Phase File | Title | Core Focus |
| :--- | :--- | :--- |
| **[`phase-1-resume-jd-blueprint.md`](./phase-1-resume-jd-blueprint.md)** | **Phase 1: Resume & JD Analysis & Blueprinting** | Ingestion of resumes (PDF/DOCX) and Job Descriptions, profile extraction, gap analysis, dynamic interview plan generation. |
| **[`phase-2-live-voice-interaction.md`](./phase-2-live-voice-interaction.md)** | **Phase 2: Live Voice Interaction Engine** | Low-latency bi-directional voice conversation, WebSocket gateway, STT/TTS integration, VAD (Voice Activity Detection), and barge-in/interruption management. |
| **[`phase-3-video-proctoring-vision.md`](./phase-3-video-proctoring-vision.md)** | **Phase 3: Video Proctoring & Computer Vision** | Edge-based client-side computer vision (MediaPipe + ONNX Web/COCO-SSD), gaze tracking, head pose (looking away), multiple faces detection, cell phone detection, and anomaly logging. |
| **[`phase-4-scoring-feedback-analytics.md`](./phase-4-scoring-feedback-analytics.md)** | **Phase 4: Scoring, Feedback & Reporting** | Turn-level evaluation, aggregate global scoring, category radar breakdown, integrity confidence audit, and interactive report dashboard. |

---

## How to Review and Brainstorm

1. Review each phase file individually.
2. Discuss architectural trade-offs (e.g., choice of TTS/STT, Edge vs Cloud Vision, database schemas).
3. Update and refine the documents with decided adjustments.
4. Begin phase-by-phase implementation with full test coverage and automated migrations.
