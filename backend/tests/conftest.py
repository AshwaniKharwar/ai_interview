import os
from collections.abc import AsyncGenerator
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

os.environ.setdefault(
    "JWT_SECRET_KEY", "test_secure_jwt_secret_key_for_testing_purposes_only_32chars"
)

from core.config import settings
from core.database import Base, get_db
from main import app

from pathlib import Path
import sqlalchemy as sa
from apps.interview.service import InterviewService

TEST_DB_PATH = Path("./test_suite.db")
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH.resolve()}"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest.fixture(scope="session", autouse=True)
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
async def setup_test_db(monkeypatch: pytest.MonkeyPatch):
    """Create all database tables before test and drop afterwards."""
    # Ensure automated tests run offline and deterministically without remote LLM calls
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    import core.database
    import apps.interview.service
    core.database.AsyncSessionLocal = TestingSessionLocal
    apps.interview.service.AsyncSessionLocal = TestingSessionLocal
    InterviewService._session_factory = TestingSessionLocal

    async with test_engine.begin() as conn:
        await conn.execute(sa.text("PRAGMA journal_mode=WAL;"))
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except Exception:
            pass


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency override providing test session."""
    async with TestingSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async test client with get_db dependency overridden."""
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()
