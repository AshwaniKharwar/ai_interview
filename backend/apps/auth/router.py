from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from apps.auth.dependencies import get_current_active_user
from apps.auth.models import User
from apps.auth.schemas import (
    GoogleAuthUrlResponse,
    MessageResponse,
    TokenRefreshRequest,
    TokenResponse,
    UserResponse,
)
from apps.auth.service import (
    exchange_code_for_google_user,
    generate_tokens_for_user,
    get_google_authorization_url,
    get_or_create_user,
    refresh_user_tokens,
)
from core.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get(
    "/google/login",
    summary="Initiate Google OAuth Login",
    description="Redirects user to Google OAuth consent page or returns the authorization URL.",
    responses={
        307: {"description": "Redirect to Google authorization URL"},
        200: {"model": GoogleAuthUrlResponse, "description": "Returns JSON with authorization URL"},
    },
)
async def google_login(
    redirect: bool = Query(
        True,
        description="If True, performs HTTP 307 redirect to Google. If False, returns the URL as JSON.",
    ),
    state: str | None = Query(None, description="Optional OAuth state parameter for CSRF protection."),
):
    url = get_google_authorization_url(state=state)
    if redirect:
        return RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    return GoogleAuthUrlResponse(authorization_url=url)


@router.get(
    "/google/callback",
    response_model=TokenResponse,
    summary="Google OAuth Callback",
    description="Handles redirect back from Google OAuth, exchanges authorization code for user info, upserts user, and returns JWT tokens.",
)
async def google_callback(
    code: str | None = Query(None, description="Authorization code returned by Google."),
    error: str | None = Query(None, description="Error returned by Google if user cancelled."),
    db: AsyncSession = Depends(get_db),
):
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth error: {error}",
        )
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code from Google callback.",
        )

    user_info = await exchange_code_for_google_user(code)
    user = await get_or_create_user(db, user_info)
    return generate_tokens_for_user(user)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh JWT Token",
    description="Provides a new access token using a valid refresh token.",
)
async def refresh_token_endpoint(
    body: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    return await refresh_user_tokens(db, body.refresh_token)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get Current User Profile",
    description="Returns the profile information of the currently authenticated user.",
)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
):
    return current_user


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="User Logout",
    description="Stateless logout endpoint informing the client to discard tokens.",
)
async def logout(
    current_user: User = Depends(get_current_active_user),
):
    return MessageResponse(message="Successfully logged out.")
