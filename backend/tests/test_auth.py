import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from apps.auth.models import User
from apps.auth.schemas import GoogleUserInfo
from apps.auth.service import (
    generate_tokens_for_user,
    get_google_authorization_url,
    get_or_create_user,
)
from core.security import decode_token


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "docs" in data


@pytest.mark.asyncio
async def test_google_login_endpoints(client: AsyncClient):
    # Test JSON response when redirect=false
    response = await client.get("/api/v1/auth/google/login?redirect=false")
    assert response.status_code == 200
    json_data = response.json()
    assert "authorization_url" in json_data
    assert "accounts.google.com" in json_data["authorization_url"]

    # Test HTTP redirect when redirect=true
    redirect_response = await client.get("/api/v1/auth/google/login?redirect=true", follow_redirects=False)
    assert redirect_response.status_code == 307
    assert "accounts.google.com" in redirect_response.headers["location"]


@pytest.mark.asyncio
async def test_user_creation_and_tokens(db_session: AsyncSession):
    mock_google_user = GoogleUserInfo(
        id="google-123456789",
        email="interview.candidate@example.com",
        name="Candidate One",
        picture="https://example.com/photo.jpg",
    )

    user = await get_or_create_user(db_session, mock_google_user)
    await db_session.commit()

    assert user.id is not None
    assert user.email == "interview.candidate@example.com"
    assert user.google_id == "google-123456789"
    assert user.full_name == "Candidate One"
    assert user.is_active is True

    # Test token generation
    token_response = generate_tokens_for_user(user)
    assert token_response.access_token is not None
    assert token_response.refresh_token is not None

    access_payload = decode_token(token_response.access_token)
    assert access_payload["sub"] == str(user.id)
    assert access_payload["email"] == user.email
    assert access_payload["type"] == "access"

    refresh_payload = decode_token(token_response.refresh_token)
    assert refresh_payload["sub"] == str(user.id)
    assert refresh_payload["type"] == "refresh"


@pytest.mark.asyncio
async def test_get_current_user_profile(client: AsyncClient, db_session: AsyncSession):
    # Setup test user
    mock_google_user = GoogleUserInfo(
        id="google-999888",
        email="test.user@example.com",
        name="Test User",
        picture="https://example.com/avatar.png",
    )
    user = await get_or_create_user(db_session, mock_google_user)
    await db_session.commit()

    token_bundle = generate_tokens_for_user(user)
    headers = {"Authorization": f"Bearer {token_bundle.access_token}"}

    # Fetch profile
    response = await client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    user_data = response.json()
    assert user_data["email"] == "test.user@example.com"
    assert user_data["full_name"] == "Test User"
    assert user_data["is_active"] is True


@pytest.mark.asyncio
async def test_unauthorized_access(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_refresh_endpoint(client: AsyncClient, db_session: AsyncSession):
    mock_google_user = GoogleUserInfo(
        id="google-refresh-123",
        email="refresh.tester@example.com",
        name="Refresh Tester",
    )
    user = await get_or_create_user(db_session, mock_google_user)
    await db_session.commit()

    token_bundle = generate_tokens_for_user(user)

    # Valid refresh token
    refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": token_bundle.refresh_token},
    )
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert "access_token" in new_tokens
    assert "refresh_token" in new_tokens

    # Invalid refresh token
    bad_refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "invalid.jwt.token"},
    )
    assert bad_refresh_response.status_code == 401


@pytest.mark.asyncio
async def test_logout_endpoint(client: AsyncClient, db_session: AsyncSession):
    mock_google_user = GoogleUserInfo(
        id="google-logout-123",
        email="logout.user@example.com",
        name="Logout User",
    )
    user = await get_or_create_user(db_session, mock_google_user)
    await db_session.commit()

    token_bundle = generate_tokens_for_user(user)
    headers = {"Authorization": f"Bearer {token_bundle.access_token}"}

    response = await client.post("/api/v1/auth/logout", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"message": "Successfully logged out."}
