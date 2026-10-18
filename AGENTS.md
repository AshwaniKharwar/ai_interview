# AGENTS.md — AI Interview System Engineering Standards

This document establishes the mandatory architectural standards, design patterns, and engineering principles for all AI agents and human contributors working on the **AI Interview System** codebase.

---

## 1. Core Engineering Principles

### 1.1 Strict Zero-Fallback Policy (Non-Negotiable)
- **Zero Mock / Synthetic Fallbacks**: Under no circumstances should any module synthesize fake data, heuristic fallbacks, or silent degradations when external services (e.g., Google Gemini, Cloudflare R2, PostgreSQL) encounter errors or missing credentials.
- **Fail Fast & Explicitly**: Missing credentials (`GEMINI_API_KEY`, `R2_*`) or API errors must immediately raise explicit exceptions (e.g. `ValueError`, HTTP 422 / 500) with diagnostic messages.

### 1.2 SOLID Principles & Clean Architecture
All code added to this repository must rigorously adhere to SOLID design principles:

1. **Single Responsibility Principle (SRP)**:
   - Each module, class, or service must have one, and only one, reason to change.
   - **Never dump all API calls into a single monolithic file**.
   - Network transport (`HttpClient`), authentication interception, and domain-specific APIs (Interview, Auth, Evaluation) must be separate.
2. **Open / Closed Principle (OCP)**:
   - Systems must be open for extension, but closed for modification.
   - When introducing Phase 2 (Live Voice), Phase 3 (Live Coding), or Phase 4 (Evaluation), add new domain services (`live-session.service.ts`, `evaluation.service.ts`) without mutating existing stable modules.
3. **Liskov Substitution Principle (LSP)**:
   - Derived types or service implementations must honor the contracts of their base abstractions.
4. **Interface Segregation Principle (ISP)**:
   - Keep interfaces and types fine-grained. Components should not depend on bulky schemas they do not use.
5. **Dependency Inversion Principle (DIP)**:
   - High-level business logic must depend on abstractions (e.g., `HttpClient` class, database session interfaces), not concrete implementations or inline `fetch` calls.

---

## 2. Frontend Architecture & Design Patterns (`/frontend`)

### 2.1 API Layer (Service / Repository Pattern)
The frontend API layer is organized strictly by domain under `frontend/src/lib/api/`:

```
frontend/src/lib/api/
├── client.ts              # Core HTTP transport (HttpClient class): token refresh, auth retry queue, error handling
├── index.ts               # Unified facade exporting domain services and backward-compatible delegates
└── services/              # Domain-specific API services adhering to SRP
    ├── auth.service.ts     # AuthApiService: user profile, refresh token, logout
    ├── interview.service.ts# InterviewApiService: resume upload, blueprint synthesis, polling, stage regeneration
    └── [new-domain].service.ts # E.g., live-session.service.ts, evaluation.service.ts for future phases
```

#### Rules for Future Agents Adding API Endpoints:
1. **Never write raw `fetch` calls inside React UI components**.
2. **Never add non-auth APIs directly into `client.ts`**.
3. Create a dedicated service class in `services/{domain}.service.ts` injecting `HttpClient`.
4. Export an instantiated singleton service (e.g. `export const interviewApi = new InterviewApiService();`).
5. Re-export the service from `src/lib/api/index.ts`.

### 2.2 Component Hierarchy & Styling
- **Styling**: Use native **Tailwind CSS v4** and **Lucide React** icons.
- **Next.js 16 App Router & Turbopack**:
  - Use `src/proxy.ts` (Next.js 16 convention) for edge route protection; do not mix `middleware.ts` with `proxy.ts`.
  - For dynamic client pages accessing `useParams()` under Partial Prerendering (PPR), wrap the page content in `<Suspense>` boundaries.
- **Layouts**: Authenticated application views use the responsive **Sidebar** navigation (`Sidebar.tsx` + `AuthenticatedLayout.tsx`).

---

## 3. Backend Architecture & Patterns (`/backend`)

### 3.1 Modular App Structure
Backend code is organized in modular FastAPI apps under `backend/apps/{domain}/`:
```
backend/apps/interview/
├── models.py       # SQLAlchemy ORM models (InterviewSession with PostgreSQL JSONB)
├── schemas.py      # Pydantic V2 schemas for strict JSON structured inputs and outputs
├── service.py      # Core domain business logic and database transactions
├── router.py       # FastAPI router with path operations and dependency injection
└── services/       # Specialized worker engines (llm.py, parser.py)
```

### 3.2 Security & Storage Policy
- **Private Cloudflare R2 Storage**: Candidate resumes are strictly stored in private R2 buckets under `resumes/{user_id}/{unique_id}/{filename}`.
- **Presigned URLs Only**: Never expose direct public bucket URLs; always generate short-lived presigned URLs via `storage_service.generate_presigned_download_url()`.
- **Prompt Injection Defense**: All untrusted resume and job description text must be encapsulated in `<untrusted_resume_content>` XML delimiters before sending to Gemini.

---

## 4. Verification Commands

Before concluding any work, all AI agents must run:
```bash
# Backend test verification
cd backend && .venv/bin/pytest tests/ -v

# Frontend linting and production build
cd frontend && bun run lint && bun run build
```
