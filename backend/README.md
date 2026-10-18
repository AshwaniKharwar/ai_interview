# Backend - AI Interview System

Modular asynchronous FastAPI backend using `uv`, SQLAlchemy 2.0 (asyncpg), Alembic, and Google OAuth 2.0 authentication.

---

## Architecture Overview

```
backend/
├── alembic/                 # Database migrations (async)
│   ├── env.py
│   └── versions/
│       └── 0001_create_users_table.py
├── alembic.ini              # Alembic migration configuration
├── apps/                    # Modular domain applications
│   └── auth/                # Self-contained authentication app
│       ├── dependencies.py  # get_current_user, role verification
│       ├── models.py        # User SQLAlchemy model
│       ├── router.py        # /auth endpoints
│       ├── schemas.py       # Pydantic request & response models
│       └── service.py       # Google OAuth exchange, user upsert & tokens
├── core/                    # Shared infrastructure
│   ├── config.py            # Pydantic BaseSettings
│   ├── database.py          # Async engine, sessionmaker, get_db dependency
│   └── security.py          # JWT creation, decode & validation
├── main.py                  # FastAPI application entrypoint & router registry
├── pyproject.toml           # Project metadata & dependencies (managed by uv)
├── tests/                   # Automated pytest test suite
├── .env.example             # Configuration template
└── README.md
```

---

## Getting Started

### 1. Prerequisites
- Python 3.13+
- [`uv`](https://github.com/astral-sh/uv) installed
- PostgreSQL running locally

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Make sure to set your Google OAuth credentials from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
- Authorized JavaScript origins: `http://localhost:8000`, `http://localhost:3000`
- Authorized redirect URIs: `http://localhost:8000/api/v1/auth/google/callback`

### 3. Database Migrations (Alembic)
Apply the database migrations to your PostgreSQL instance:

```bash
uv run alembic upgrade head
```

To create a new migration after modifying models:
```bash
uv run alembic revision --autogenerate -m "describe change"
```

### 4. Running the Development Server
Start the FastAPI server with hot reload:

```bash
uv run uvicorn main:app --reload --port 8000
```

- Interactive OpenAPI Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Interactive ReDoc documentation: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## Authentication Endpoints (`/api/v1/auth`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/auth/google/login` | Redirects to Google OAuth consent screen (or returns URL with `?redirect=false`) |
| `GET` | `/api/v1/auth/google/callback` | Handles callback from Google, creates/updates user, returns JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Refreshes access token using valid refresh token |
| `GET` | `/api/v1/auth/me` | Returns authenticated user profile (`Authorization: Bearer <token>`) |
| `POST` | `/api/v1/auth/logout` | Stateless logout hook |

---

## Running Automated Tests

Run the test suite using `pytest`:

```bash
uv run pytest
```
