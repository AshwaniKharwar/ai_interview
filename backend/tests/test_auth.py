import urllib.parse
from unittest.mock import AsyncMock, patch

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
    assert "oauth_state" in response.cookies
    cookie_state = response.cookies["oauth_state"]
    assert cookie_state is not None and len(cookie_state) > 0
    parsed_url = urllib.parse.urlparse(json_data["authorization_url"])
    query_params = urllib.parse.parse_qs(parsed_url.query)
    assert query_params.get("state") == [cookie_state]

    # Test HTTP redirect when redirect=true
    redirect_response = await client.get("/api/v1/auth/google/login?redirect=true", follow_redirects=False)
    assert redirect_response.status_code == 307
    assert "accounts.google.com" in redirect_response.headers["location"]
    assert "oauth_state" in redirect_response.cookies
    redirect_cookie_state = redirect_response.cookies["oauth_state"]
    assert redirect_cookie_state is not None and len(redirect_cookie_state) > 0
    parsed_redirect = urllib.parse.urlparse(redirect_response.headers["location"])
    redirect_query_params = urllib.parse.parse_qs(parsed_redirect.query)
    assert redirect_query_params.get("state") == [redirect_cookie_state]


def test_google_authorization_url_state_parameter():
    url = get_google_authorization_url(state="secure_test_nonce_123")
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    assert qs["state"] == ["secure_test_nonce_123"]

    with pytest.raises(ValueError, match="state parameter is required"):
        get_google_authorization_url(state="")


@pytest.mark.asyncio
async def test_google_callback_csrf_validation(client: AsyncClient):
    # Case 1: Missing state parameter and missing cookie
    r1 = await client.get("/api/v1/auth/google/callback?code=mock_code")
    assert r1.status_code == 400
    assert r1.json()["detail"] == "Invalid OAuth state parameter."

    # Case 2: State query provided, but no cookie
    r2 = await client.get("/api/v1/auth/google/callback?code=mock_code&state=attack_state")
    assert r2.status_code == 400
    assert r2.json()["detail"] == "Invalid OAuth state parameter."

    # Case 3: Cookie provided, but no state query param
    client.cookies.set("oauth_state", "valid_secret_state")
    r3 = await client.get("/api/v1/auth/google/callback?code=mock_code")
    assert r3.status_code == 400
    assert r3.json()["detail"] == "Invalid OAuth state parameter."

    # Case 4: Cookie and state query param do not match (tampered / CSRF attempt)
    client.cookies.set("oauth_state", "legitimate_state")
    r4 = await client.get("/api/v1/auth/google/callback?code=mock_code&state=forged_state")
    assert r4.status_code == 400
    assert r4.json()["detail"] == "Invalid OAuth state parameter."

    # Case 5: Google error parameter
    client.cookies.set("oauth_state", "legitimate_state")
    r5 = await client.get("/api/v1/auth/google/callback?error=access_denied&state=legitimate_state")
    assert r5.status_code == 400
    assert "access_denied" in r5.json()["detail"]

    # Case 6: Matching state but missing code
    client.cookies.set("oauth_state", "legitimate_state")
    r6 = await client.get("/api/v1/auth/google/callback?state=legitimate_state")
    assert r6.status_code == 400
    assert r6.json()["detail"] == "Missing authorization code from Google callback."

    # Case 7: Valid state, matching cookie, and code - successful login
    client.cookies.set("oauth_state", "legitimate_state")
    mock_user_info = GoogleUserInfo(
        id="google-callback-user-123",
        email="callback.user@example.com",
        name="Callback User",
        picture="https://example.com/callback.jpg",
    )
    with patch("apps.auth.router.exchange_code_for_google_user", new_callable=AsyncMock) as mock_exchange:
        mock_exchange.return_value = mock_user_info
        r7 = await client.get("/api/v1/auth/google/callback?code=valid_code&state=legitimate_state")
        assert r7.status_code == 200
        tokens = r7.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens


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
