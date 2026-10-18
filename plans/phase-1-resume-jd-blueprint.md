# Phase 1: Resume & Job Description Analysis & Interview Blueprinting

## 1. Objective & Scope

Phase 1 sets up the contextual foundation for the entire interview. The AI interviewer must not ask generic, canned questions; instead, it should act like an expert hiring manager who has thoroughly reviewed the candidate's resume and the target Job Description (JD).

---

## 2. Ingestion & Extraction Architecture

```
Candidate Uploads
├── Resume (PDF / DOCX) ───► Text Extraction (pypdf/pdfplumber) ──┐
└── Job Description (Text) ────────────────────────────────────────┼──► LLM Structuring Engine
                                                                   │    (Pydantic Structured Output)
                                                                   ▼
                                                       ┌───────────────────────┐
                                                       │ Candidate Profile     │
                                                       │  - Technical Skills   │
                                                       │  - Project Deep Dives │
                                                       │  - Experience Level   │
                                                       ├───────────────────────┤
                                                       │ Job Profile           │
                                                       │  - Must-have skills   │
                                                       │  - Nice-to-have skills│
                                                       │  - Role Expectations  │
                                                       └───────────┬───────────┘
                                                                   │
                                                                   ▼
                                                       ┌───────────────────────┐
                                                       │ Gap Analysis Engine   │
                                                       │  - Strong alignments  │
                                                       │  - Potential gaps     │
                                                       │  - Unverified claims  │
                                                       └───────────┬───────────┘
                                                                   │
                                                                   ▼
                                                       ┌───────────────────────┐
                                                       │ Interview Blueprint   │
                                                       │ (Structured Syllabus) │
                                                       └───────────────────────┘
```

---

## 3. Data Models & Schemas

### 3.1 Candidate Profile Schema (JSONB)
```json
{
  "name": "Alex Morgan",
  "seniority_level": "Senior (5-7 years)",
  "primary_domains": ["Distributed Systems", "Backend Engineering"],
  "skills": ["Go", "Python", "Kubernetes", "PostgreSQL", "Kafka"],
  "experience": [
    {
      "company": "FinTech Corp",
      "title": "Senior Software Engineer",
      "duration": "2022 - Present",
      "key_highlights": [
        "Architected real-time transaction processing system handling 10k TPS",
        "Migrated monolith to event-driven microservices with Kafka"
      ]
    }
  ],
  "education": "B.Tech in Computer Science"
}
```

### 3.2 Job Description Profile Schema (JSONB)
```json
{
  "job_title": "Lead Backend Engineer",
  "department": "Platform Core",
  "required_skills": ["Go", "Distributed Systems", "Kafka", "PostgreSQL"],
  "preferred_skills": ["Rust", "Kubernetes Operator development"],
  "seniority_target": "Staff / Lead",
  "key_responsibilities": [
    "Design high-throughput event processing pipelines",
    "Mentor junior and mid-level engineers"
  ]
}
```

### 3.3 Dynamic Interview Blueprint Schema (JSONB)
The blueprint splits the session into structured stages with estimated time allocations and targeted probing themes:

```json
{
  "total_duration_minutes": 30,
  "stages": [
    {
      "stage_id": "warmup_background",
      "title": "Introduction & Resume Walkthrough",
      "duration_minutes": 4,
      "objective": "Verify background and break the ice",
      "focus_areas": [
        "Transition into FinTech Corp",
        "Role in high TPS transaction processing project"
      ],
      "sample_starter_questions": [
        "Can you walk me through your recent work at FinTech Corp, specifically your architecture for the 10k TPS transaction system?"
      ]
    },
    {
      "stage_id": "technical_deep_dive",
      "title": "System Design & Technical Architecture",
      "duration_minutes": 15,
      "objective": "Evaluate deep architectural trade-offs, concurrency, and failure modes",
      "focus_areas": [
        "Kafka partitioning and consumer lag management",
        "Distributed database consistency vs availability (CAP)",
        "Handling network partitions in financial ledgers"
      ],
      "probing_rubric": {
        "depth": "Look for concrete numbers, caching strategies, and idempotency keys"
      }
    },
    {
      "stage_id": "behavioral_leadership",
      "title": "Behavioral & Cross-Functional Conflict",
      "duration_minutes": 8,
      "objective": "Evaluate leadership, communication, and decision making under pressure",
      "focus_areas": [
        "Handling technical disagreements during architectural refactors",
        "Mentorship of struggling engineers"
      ]
    },
    {
      "stage_id": "wrap_up",
      "title": "Candidate Q&A & Conclusion",
      "duration_minutes": 3,
      "objective": "Let candidate ask questions and conclude gracefully"
    }
  ]
}
```

---

## 4. Database Schema (PostgreSQL via SQLAlchemy)

```python
# backend/apps/interview/models.py

class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    
    # Target Job Details
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    job_description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Candidate Resume & Parsed Data
    resume_file_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    parsed_resume_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    parsed_jd_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    
    # Interview Configuration
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    difficulty_level: Mapped[str] = mapped_column(String(50), default="medium") # easy, medium, hard
    
    # Blueprint generated by LLM
    blueprint_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    
    # Session Status
    status: Mapped[str] = mapped_column(
        String(50), 
        default="DRAFT", # DRAFT, BLUEPRINT_READY, IN_PROGRESS, COMPLETED, EVALUATED
        index=True
    )
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
```

---

## 5. REST API Specifications

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/interviews/upload-resume` | Upload PDF/DOCX file, parse text, and return extracted profile preview. |
| `POST` | `/api/v1/interviews/` | Create a new interview session with resume data, JD, and parameters. |
| `POST` | `/api/v1/interviews/{id}/generate-blueprint` | Trigger LLM to generate stage breakdown, gap analysis, and blueprint. |
| `GET` | `/api/v1/interviews/{id}` | Fetch session details, blueprint, and current status. |
| `PUT` | `/api/v1/interviews/{id}/blueprint` | Allow candidate or recruiter to customize topics/stages before starting. |

---

## 6. Frontend UI / UX Flow (Next.js)

1. **Dashboard Overview** (`/dashboard`):
   - "Start New Interview" primary CTA.
   - History of past interview sessions and their scores.
2. **Setup Wizard** (`/interview/new`):
   - **Step 1: Resume Upload**: Drag-and-drop PDF with real-time text extraction preview.
   - **Step 2: Job Description Input**: Textarea for JD, target job title, company name, and level.
   - **Step 3: Configuration**: Select duration (15m, 30m, 45m), difficulty level, interview focus (Technical, Behavioral, Mixed).
3. **Blueprint Review & Customization** (`/interview/[id]/prepare`):
   - Visual timeline showing generated interview stages and questions.
   - Option to regenerate or tweak topics before hitting **"Enter Interview Room"**.

---

## 7. Brainstorming & Decision Points

1. **PDF Parser Choice**:
   - `pypdf`: Extremely fast, zero external dependencies, great for clean text PDFs.
   - `pdfplumber`: Better at multi-column layouts and tables.
   - *Recommendation*: Start with `pypdf` with fallback to `pdfplumber`.
2. **Model for Extraction & Blueprinting**:
   - Gemini 2.0 Flash or Claude 3.5 Sonnet: Excellent at structured JSON adherence and reasoning through resumes.
3. **Allowing User Customization**:
   - Should candidates be allowed to edit the generated syllabus (e.g. "Focus more on Kubernetes and less on AWS"), or should it remain strictly automated?
