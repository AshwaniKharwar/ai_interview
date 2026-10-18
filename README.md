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
├── .gitignore          # Root repository git ignore configuration
└── README.md           # Project documentation
```

## Quick Start

### Backend Setup

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

## API Documentation

When the backend server is running:
- **Interactive Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
