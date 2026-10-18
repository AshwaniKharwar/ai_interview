import urllib.parse
import uuid
import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.auth.models import User
from apps.auth.schemas import GoogleUserInfo, TokenResponse
from core.config import settings
from core.security import create_access_token, create_refresh_token, decode_token

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def get_google_authorization_url(state: str) -> str:
    """Build the Google OAuth 2.0 consent URL with CSRF state protection."""
    if not state:
        raise ValueError("state parameter is required for CSRF protection.")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"



async def exchange_code_for_google_user(code: str) -> GoogleUserInfo:
    """Exchange authorization code with Google for tokens, then fetch user profile."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth credentials are not properly configured.",
        )

    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data=data)
        if token_resp.status_code != 200:
            error_data = token_resp.json() if token_resp.headers.get("content-type", "").startswith("application/json") else token_resp.text
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to exchange authorization code with Google: {error_data}",
            )

        token_json = token_resp.json()
        google_access_token = token_json.get("access_token")

        headers = {"Authorization": f"Bearer {google_access_token}"}
        userinfo_resp = await client.get(GOOGLE_USERINFO_URL, headers=headers)
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to retrieve user profile from Google.",
            )

        user_data = userinfo_resp.json()

    return GoogleUserInfo(
        id=user_data["id"],
        email=user_data["email"],
        verified_email=user_data.get("verified_email", True),
        name=user_data.get("name"),
        picture=user_data.get("picture"),
    )


async def get_or_create_user(db: AsyncSession, user_info: GoogleUserInfo) -> User:
    """Find existing user by google_id or email, or create a new user record."""
    # Check by google_id first
    stmt = select(User).where(User.google_id == user_info.id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Check if user with same email exists
        email_stmt = select(User).where(User.email == user_info.email)
        email_result = await db.execute(email_stmt)
        user = email_result.scalar_one_or_none()

        if user:
            # Link existing account to Google ID
            user.google_id = user_info.id
            if user_info.name and not user.full_name:
                user.full_name = user_info.name
            if user_info.picture and not user.picture_url:
                user.picture_url = user_info.picture
            await db.flush()
        else:
            # Create brand new user
            user = User(
                email=user_info.email,
                google_id=user_info.id,
                full_name=user_info.name,
                picture_url=user_info.picture,
                is_active=True,
                role="user",
            )
            db.add(user)
            await db.flush()
    else:
        # Update user profile info if provided
        updated = False
        if user_info.name and user.full_name != user_info.name:
            user.full_name = user_info.name
            updated = True
        if user_info.picture and user.picture_url != user_info.picture:
            user.picture_url = user_info.picture
            updated = True
        if updated:
            await db.flush()

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive or disabled.",
        )

    return user


def generate_tokens_for_user(user: User) -> TokenResponse:
    """Generate JWT access and refresh tokens for user."""
    token_payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def refresh_user_tokens(db: AsyncSession, refresh_token: str) -> TokenResponse:
    """Verify refresh token and issue new token pair."""
    try:
        payload = decode_token(refresh_token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not a valid refresh token",
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
        )

    stmt = select(User).where(User.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return generate_tokens_for_user(user)
