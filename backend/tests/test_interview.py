import io
import uuid
import pytest
from docx import Document
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from apps.auth.models import User
from apps.auth.service import generate_tokens_for_user
from apps.interview.models import InterviewSession, InterviewStatus
from apps.interview.service import InterviewService


from tests.conftest import TestingSessionLocal


@pytest.fixture
async def test_user() -> User:
    async with TestingSessionLocal() as session:
        user = User(
            id=uuid.uuid4(),
            email="test_engineer@example.com",
            google_id="google_sub_12345",
            full_name="Alex Morgan",
            is_active=True,
            role="user",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
async def auth_headers(test_user: User) -> dict[str, str]:
    tokens = generate_tokens_for_user(test_user)
    return {"Authorization": f"Bearer {tokens.access_token}"}


@pytest.fixture
async def second_user() -> User:
    async with TestingSessionLocal() as session:
        user = User(
            id=uuid.uuid4(),
            email="other_candidate@example.com",
            google_id="google_sub_67890",
            full_name="Other User",
            is_active=True,
            role="user",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
async def second_auth_headers(second_user: User) -> dict[str, str]:
    tokens = generate_tokens_for_user(second_user)
    return {"Authorization": f"Bearer {tokens.access_token}"}


def create_sample_docx_bytes() -> bytes:
    doc = Document()
    doc.add_heading("Alex Morgan", level=1)
    doc.add_paragraph("Senior Distributed Systems Engineer with 6 years experience.")
    doc.add_paragraph("Skills: Go, Python, Kafka, PostgreSQL, Kubernetes.")
    doc.add_paragraph("FinTech Corp - Architected real-time transaction processing system handling 10k TPS.")
    stream = io.BytesIO()
    doc.save(stream)
    return stream.getvalue()


# --- Endpoint Tests ---

@pytest.mark.asyncio
async def test_upload_resume_unauthorized(client: AsyncClient):
    docx_bytes = create_sample_docx_bytes()
    files = {"file": ("resume.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    resp = await client.post("/api/v1/interviews/upload-resume", files=files)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_resume_invalid_format(client: AsyncClient, auth_headers: dict[str, str]):
    files = {"file": ("malicious.exe", b"fake binary", "application/octet-stream")}
    resp = await client.post("/api/v1/interviews/upload-resume", files=files, headers=auth_headers)
    assert resp.status_code == 400
    assert "Unsupported file format" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_resume_empty_file(client: AsyncClient, auth_headers: dict[str, str]):
    files = {"file": ("empty.pdf", b"", "application/pdf")}
    resp = await client.post("/api/v1/interviews/upload-resume", files=files, headers=auth_headers)
    assert resp.status_code == 400
    assert "Uploaded file is empty" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_resume_docx_success(client: AsyncClient, auth_headers: dict[str, str]):
    docx_bytes = create_sample_docx_bytes()
    files = {"file": ("alex_resume.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    resp = await client.post("/api/v1/interviews/upload-resume", files=files, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "resume_file_url" in data
    assert "Alex Morgan" in data["raw_text"]
    assert "Kafka" in data["raw_text"]
    assert data["char_count"] > 100


@pytest.mark.asyncio
async def test_create_interview_session(client: AsyncClient, auth_headers: dict[str, str]):
    payload = {
        "job_title": "Lead Backend Engineer",
        "company_name": "Acme Payments",
        "job_description_raw": "Looking for Lead Backend Engineer with deep Go, Kafka, and PostgreSQL experience.",
        "resume_raw_text": "Alex Morgan, Senior Engineer. Kafka and PostgreSQL expert.",
        "duration_minutes": 30,
        "difficulty_level": "hard",
        "interviewer_persona": "rigorous_collaborative",
    }
    resp = await client.post("/api/v1/interviews/", json=payload, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["job_title"] == "Lead Backend Engineer"
    assert data["company_name"] == "Acme Payments"
    assert data["status"] == "DRAFT"
    assert data["difficulty_level"] == "hard"
    assert "id" in data


@pytest.mark.asyncio
async def test_generate_blueprint_and_polling(
    client: AsyncClient, auth_headers: dict[str, str], db_session: AsyncSession
):
    # 1. Create interview session
    payload = {
        "job_title": "Lead Backend Engineer",
        "company_name": "FinTech Corp",
        "job_description_raw": "Must know Kafka, Go, Distributed Systems, and High TPS architecture.",
        "resume_raw_text": "Alex Morgan, 6 years experience. Architected 10k TPS pipeline with Kafka and PostgreSQL.",
        "duration_minutes": 30,
        "difficulty_level": "medium",
    }
    create_resp = await client.post("/api/v1/interviews/", json=payload, headers=auth_headers)
    session_id = create_resp.json()["id"]

    # 2. Trigger asynchronous blueprint generation (FastAPI BackgroundTasks executes automatically)
    gen_resp = await client.post(
        f"/api/v1/interviews/{session_id}/generate-blueprint", headers=auth_headers
    )
    assert gen_resp.status_code == 202
    assert gen_resp.json()["status"] == "BLUEPRINT_GENERATING"

    # 3. Check status
    status_resp = await client.get(f"/api/v1/interviews/{session_id}/status", headers=auth_headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "BLUEPRINT_READY"
    assert status_resp.json()["has_blueprint"] is True

    # 4. Fetch full session details
    detail_resp = await client.get(f"/api/v1/interviews/{session_id}", headers=auth_headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()

    # Verify Gap Analysis is populated
    assert detail["gap_analysis_json"] is not None
    assert "match_score" in detail["gap_analysis_json"]
    assert len(detail["gap_analysis_json"]["strong_alignments"]) > 0

    # Verify Blueprint is populated with stages, rubrics, and starters
    assert detail["blueprint_json"] is not None
    stages = detail["blueprint_json"]["stages"]
    assert len(stages) >= 3
    stage_ids = [s["stage_id"] for s in stages]
    assert "warmup_background" in stage_ids
    assert "technical_deep_dive" in stage_ids

    # Verify probing rubrics
    tech_stage = next(s for s in stages if s["stage_id"] == "technical_deep_dive")
    assert len(tech_stage["starter_questions"]) > 0
    assert tech_stage["probing_rubric"] is not None
    assert len(tech_stage["probing_rubric"]["expected_signals"]) > 0


@pytest.mark.asyncio
async def test_update_blueprint(client: AsyncClient, auth_headers: dict[str, str]):
    # Create and setup session
    payload = {
        "job_title": "Backend Engineer",
        "job_description_raw": "Python, SQL, Microservices",
        "resume_raw_text": "Experienced Python Engineer",
    }
    create_resp = await client.post("/api/v1/interviews/", json=payload, headers=auth_headers)
    session_id = create_resp.json()["id"]

    await client.post(f"/api/v1/interviews/{session_id}/generate-blueprint", headers=auth_headers)

    # Fetch existing blueprint
    detail_resp = await client.get(f"/api/v1/interviews/{session_id}", headers=auth_headers)
    blueprint = detail_resp.json()["blueprint_json"]

    # Customize first stage title and duration
    blueprint["stages"][0]["title"] = "Customized Intro Stage"
    blueprint["stages"][0]["duration_minutes"] = 5
    blueprint["total_duration_minutes"] = 45

    put_resp = await client.put(
        f"/api/v1/interviews/{session_id}/blueprint",
        json={"blueprint": blueprint},
        headers=auth_headers,
    )
    assert put_resp.status_code == 200
    updated_data = put_resp.json()
    assert updated_data["duration_minutes"] == 45
    assert updated_data["blueprint_json"]["stages"][0]["title"] == "Customized Intro Stage"


@pytest.mark.asyncio
async def test_regenerate_stage(client: AsyncClient, auth_headers: dict[str, str]):
    payload = {
        "job_title": "Platform Engineer",
        "job_description_raw": "Kubernetes and Go",
        "resume_raw_text": "Platform Engineer experienced with Kubernetes",
    }
    create_resp = await client.post("/api/v1/interviews/", json=payload, headers=auth_headers)
    session_id = create_resp.json()["id"]

    await client.post(f"/api/v1/interviews/{session_id}/generate-blueprint", headers=auth_headers)

    regen_resp = await client.post(
        f"/api/v1/interviews/{session_id}/stages/technical_deep_dive/regenerate",
        json={"user_instructions": "Focus heavily on Kubernetes Operators and custom CRDs"},
        headers=auth_headers,
    )
    assert regen_resp.status_code == 200
    stages = regen_resp.json()["blueprint_json"]["stages"]
    tech_stage = next(s for s in stages if s["stage_id"] == "technical_deep_dive")
    assert any("Kubernetes Operators" in q for q in tech_stage["starter_questions"] + tech_stage["focus_areas"])


@pytest.mark.asyncio
async def test_user_session_isolation(
    client: AsyncClient,
    auth_headers: dict[str, str],
    second_auth_headers: dict[str, str],
):
    # User 1 creates session
    payload = {
        "job_title": "Confidential Role",
        "job_description_raw": "Private JD",
        "resume_raw_text": "User 1 Resume",
    }
    create_resp = await client.post("/api/v1/interviews/", json=payload, headers=auth_headers)
    session_id = create_resp.json()["id"]

    # User 2 attempts to view User 1's session -> must be 404
    resp = await client.get(f"/api/v1/interviews/{session_id}", headers=second_auth_headers)
    assert resp.status_code == 404

    # User 2 attempts to update User 1's blueprint -> must be 404
    put_resp = await client.put(
        f"/api/v1/interviews/{session_id}/blueprint",
        json={"blueprint": {"total_duration_minutes": 30, "difficulty_level": "easy", "interviewer_persona": "friendly", "stages": []}},
        headers=second_auth_headers,
    )
    assert put_resp.status_code == 404
