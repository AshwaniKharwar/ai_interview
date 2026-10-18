# Phase 4: Scoring, Feedback & Comprehensive Analytics

## 1. Objective & Scope

Phase 4 generates transparent, actionable, and structured evaluations for both the candidate and the hiring team. The system evaluates performance on two levels:
1. **Turn-Level Scoring**: Evaluated asynchronously after each question-and-answer exchange.
2. **Global-Level Holistic Feedback**: An aggregate evaluation synthesized across the entire session, combining technical mastery, communication style, behavioral competencies, and the proctoring integrity audit.

---

## 2. Two-Tier Evaluation Architecture

```
[Interview In Progress]
       │
       ├── Turn Completed ──► Async Background Worker (Celery / FastAPI BackgroundTasks)
       │                         │
       │                         ├── Evaluate Turn Transcript vs Expected Blueprint Criteria
       │                         └── Store Turn Score & Constructive Micro-Feedback
       │
[Candidate Concludes Interview]
       │
       ▼
[Global Evaluation Synthesizer (LLM)]
       │
       ├── Input 1: All Turn Transcripts + Micro-Scores
       ├── Input 2: Resume & Job Description Blueprint
       ├── Input 3: Proctoring Event Log (Phone, Gaze, Face counts)
       │
       ▼
[Structured Final Report (JSONB)]
       ├── Overall Score (0 - 100)
       ├── Category Radar Breakdown
       ├── Executive Summary & Hiring Recommendation
       ├── Key Strengths & Concrete Improvement Areas
       └── Proctoring Integrity Index & Incident Timeline
```

---

## 3. Scoring Rubric & Weighted Metrics

### 3.1 Global Category Weights
| Dimension | Weight | What It Evaluates |
| :--- | :--- | :--- |
| **Technical Depth & Accuracy** | **40%** | Mastery of core domain concepts, handling edge cases, design trade-offs. |
| **Problem Solving & Systems Thinking**| **25%** | Structured decomposition, scalability, failure tolerance considerations. |
| **Communication & Articulation** | **20%** | Conciseness, pacing, structure (e.g., STAR format), avoidance of filler words. |
| **Behavioral & Culture Fit** | **10%** | Ownership, conflict resolution, collaboration, adaptability. |
| **Engagement & Confidence** | **5%** | Eye contact, composure under probing questions. |

### 3.2 Proctoring Integrity Index
- Base Score: **100%**
- Deductions:
  - Phone detected in frame: **-20% per confirmed incident**
  - Prolonged gaze away from screen ($>8\text{s}$): **-5% per incident**
  - Multiple faces detected: **-15% per incident**
  - Candidate absence ($>10\text{s}$): **-10% per incident**
- Calculated as a standalone **Integrity Confidence Score** (e.g., "94% - High Integrity").

---

## 4. Turn-Level Evaluation Schema (JSONB)

Stored inside `interview_turns.turn_score` and `turn_feedback`:

```json
{
  "turn_index": 3,
  "score": 8.2,
  "criteria_breakdown": {
    "relevance": 9.0,
    "technical_depth": 8.0,
    "communication_structure": 7.5
  },
  "positive_highlights": [
    "Accurately described Kafka consumer group rebalancing mechanisms",
    "Highlighted the difference between eager rebalancing and cooperative sticky rebalancing"
  ],
  "areas_for_improvement": [
    "Did not specify how consumer lag is monitored or alerted in production",
    "Could have mentioned partition assignment strategies"
  ],
  "ideal_response_summary": "A complete answer would explicitly address lag metrics in Prometheus and explain cooperative sticky assignment."
}
```

---

## 5. Global Interview Report Schema (JSONB)

```json
{
  "overall_score": 84,
  "hiring_recommendation": "Strong Hire", // Strong Hire, Hire, Leaning Hire, Leaning No Hire, No Hire
  "executive_summary": "Alex demonstrated exceptional depth in distributed systems and event-driven architecture, accurately decomposing complex failure modes in financial systems. Communication was clear and structured, with strong STAR methodology in the behavioral section.",
  "category_scores": {
    "technical_depth": 88,
    "problem_solving": 82,
    "communication": 85,
    "behavioral": 80,
    "engagement_confidence": 78
  },
  "strengths": [
    {
      "title": "Distributed Systems Mastery",
      "detail": "Demonstrated nuanced understanding of Kafka rebalancing and database idempotency.",
      "evidence_quote": "We implemented idempotency keys at the ingestion gateway using Redis sets..."
    }
  ],
  "weaknesses": [
    {
      "title": "Observability & Production Monitoring",
      "detail": "Did not proactively address metric collection and alerting for high TPS systems."
    }
  ],
  "actionable_study_plan": [
    "Review Prometheus + Grafana consumer lag alerting patterns",
    "Explore distributed tracing with OpenTelemetry"
  ],
  "proctoring_summary": {
    "integrity_score": 96,
    "total_flags": 1,
    "flags": [
      {
        "type": "LOOKING_AWAY",
        "timestamp_offset": 540,
        "duration_seconds": 5.2,
        "note": "Candidate glanced left for 5 seconds during system design question"
      }
    ]
  }
}
```

---

## 6. Database Schema for Reports

```python
# backend/apps/interview/models.py

class InterviewReport(Base):
    __tablename__ = "interview_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), unique=True, index=True)

    overall_score: Mapped[float] = mapped_column(Float, nullable=False)
    hiring_recommendation: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Detailed structured report
    report_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

---

## 7. Frontend Analytics & Report UI (`/interview/[id]/report`)

The candidate and recruiter are presented with a modern dashboard:

1. **Executive Hero Card**:
   - Overall Score (Big Circular Gauge: 84/100).
   - Recommendation Badge ("Strong Hire" in emerald green).
   - Quick stats: Duration, total questions answered, integrity score.
2. **Skill Radar Chart**:
   - Visualizing strengths across Technical, Problem Solving, Communication, Behavioral, and Confidence.
3. **Turn-by-Turn Replay & Drilldown**:
   - Expandable accordion per question.
   - Shows question text, candidate's transcribed answer, turn score, and constructive tips.
4. **Proctoring Audit Timeline**:
   - Interactive timeline scrubber showing green intervals and flagged warning markers with expandable snapshot evidence.
5. **Action Plan & PDF Download**:
   - One-click "Export PDF Report" button for sharing with candidates or hiring panels.

---

## 8. Brainstorming & Decision Points

1. **Immediate vs Delayed Report**:
   - Should the candidate see the score immediately after the interview, or should it take 1-2 minutes to compile all feedback comprehensively?
   - *Recommendation*: Show a clean "Analyzing your interview..." progress screen for ~30 seconds while the LLM synthesizes all turns and proctoring logs.
2. **Feedback Tone for Candidates**:
   - Constructive and growth-oriented (e.g. "To reach Staff level, consider focusing on X") rather than harsh rejections.
3. **Recruiter vs Candidate Views**:
   - Should candidate and recruiter see the same report, or should proctoring snapshots only be visible to recruiters/admins?
