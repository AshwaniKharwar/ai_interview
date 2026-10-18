# AI Interview System

An automated, intelligent technical and behavioral interview platform powered by AI.

## Project Structure

```
ai_interview_system/
├── backend/            # Asynchronous FastAPI backend services
│   ├── alembic/        # Database migrations (asyncpg)
│   ├── apps/           # Modular domain applications (auth, interview, etc.)
│   ├── core/           # Shared config, database connection & security
│   ├── tests/          # Pytest automated test suite
│   ├── pyproject.toml  # Dependency and project metadata (uv)
│   └── main.py         # Application entrypoint
├── frontend/           # Next.js App Router frontend (Bun & Tailwind CSS)
│   ├── src/app/        # App Router pages (/login, /auth/callback, /dashboard)
│   ├── src/context/    # AuthContext React provider
│   ├── src/lib/        # API client and cookie utilities
│   ├── package.json    # Frontend dependencies (managed with bun)
│   └── bun.lock        # Bun lockfile
├── .gitignore          # Root repository git ignore configuration
└── README.md           # Project documentation
```

## Quick Start

### 1. Backend Setup

For detailed backend configuration, see [backend/README.md](backend/README.md).

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
3. Run database migrations:
   ```bash
   uv run alembic upgrade head
   ```
4. Start the development server:
   ```bash
   uv run uvicorn main:app --reload --port 8000
   ```
5. Run tests:
   ```bash
   uv run pytest
   ```

### 2. Frontend Setup (Next.js with Bun)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Configure environment variables:
   ```bash
   cp .env.local.example .env.local
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Start the development server:
   ```bash
   bun run dev --port 3000
   ```
5. Access the app at [http://localhost:3000](http://localhost:3000):
   - Directs to `/login` with Google OAuth button
   - Upon authentication, redirects to `/dashboard` (clean blank page)

## API Documentation

When the backend server is running:
- **Interactive Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
