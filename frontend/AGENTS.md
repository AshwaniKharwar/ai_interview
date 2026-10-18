<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend Engineering & SOLID Design Standards

All future AI agents working on the frontend must adhere to the following rules:

### 1. API Architecture (Service / Repository Pattern)
Never dump APIs into a single monolithic file. The API layer is strictly partitioned in `src/lib/api/`:
- **`src/lib/api/client.ts`**: Contains the single `HttpClient` class responsible exclusively for transport, token injection, and 401 token refresh queue.
- **`src/lib/api/services/{domain}.service.ts`**: Each business domain gets its own dedicated class (e.g., `AuthApiService`, `InterviewApiService`). Future domains (e.g., Phase 2 `LiveSessionApiService`, Phase 3 `CodingWorkspaceApiService`, Phase 4 `EvaluationApiService`) must be created here.
- **`src/lib/api/index.ts`**: Exports the domain services and unified facade.
- **Zero raw `fetch` in UI components**: Components must always invoke domain service methods (e.g. `interviewApi.createInterview(...)`).

### 2. Layout & Styling Standards
- Use the authenticated **Sidebar** layout (`Sidebar.tsx` + `AuthenticatedLayout.tsx`) for all internal views.
- Styling must use native Tailwind CSS v4 and Lucide React icons.
- Avoid introducing third-party UI component dependencies with peer conflicts on React 19.

### 3. Verification
Always verify changes before concluding:
```bash
bun run lint && bun run build
```

