import secrets
import urllib.parse

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Query, Request, Response, status
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
from core.config import settings
from core.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get(
    "/google/login",
    summary="Initiate Google OAuth Login",
    description="Generates a secure state parameter, sets it in an HttpOnly cookie, and redirects user to Google OAuth consent page or returns the authorization URL.",
    responses={
        307: {"description": "Redirect to Google authorization URL"},
        200: {"model": GoogleAuthUrlResponse, "description": "Returns JSON with authorization URL"},
    },
)
async def google_login(
    response: Response,
    redirect: bool = Query(
        True,
        description="If True, performs HTTP 307 redirect to Google. If False, returns the URL as JSON.",
    ),
):
    state = secrets.token_urlsafe(32)
    url = get_google_authorization_url(state=state)

    if redirect:
        redirect_response = RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        redirect_response.set_cookie(
            key="oauth_state",
            value=state,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="lax",
            max_age=300,
        )
        return redirect_response

    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=300,
    )
    return GoogleAuthUrlResponse(authorization_url=url)


@router.get(
    "/google/callback",
    response_model=TokenResponse,
    summary="Google OAuth Callback",
    description="Handles redirect back from Google OAuth, exchanges authorization code for user info, upserts user, and returns JWT tokens or redirects to the frontend.",
    responses={
        307: {"description": "Redirects to frontend dashboard with auth cookies set, or to login with error parameter"},
        200: {"model": TokenResponse, "description": "Returns JSON with tokens when requested"},
    },
)
async def google_callback(
    request: Request,
    response: Response,
    code: str | None = Query(None, description="Authorization code returned by Google."),
    state: str | None = Query(None, description="OAuth state parameter returned by Google."),
    error: str | None = Query(None, description="Error returned by Google if user cancelled."),
    redirect: bool | None = Query(None, description="Force redirect behavior (True to redirect to frontend, False for JSON)."),
    format: str | None = Query(None, description="Force response format, e.g. 'json'."),
    oauth_state: str | None = Cookie(None, description="OAuth state cookie for CSRF validation."),
    db: AsyncSession = Depends(get_db),
):
    accept_header = request.headers.get("accept", "")
    if redirect is True:
        wants_redirect = True
    elif redirect is False or format == "json":
        wants_redirect = False
    else:
        wants_redirect = "text/html" in accept_header

    def handle_error(detail: str):
        if not wants_redirect:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        err_url = f"{settings.FRONTEND_URL}{settings.FRONTEND_LOGIN_PATH}?error={urllib.parse.quote(detail)}"
        err_resp = RedirectResponse(url=err_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
        err_resp.delete_cookie(
            key="oauth_state",
            httponly=True,
            secure=not settings.DEBUG,
            samesite="lax",
        )
        return err_resp

    if error:
        return handle_error(f"Google OAuth error: {error}")
    if not state or not oauth_state or not secrets.compare_digest(state, oauth_state):
        return handle_error("Invalid OAuth state parameter.")
    if not code:
        return handle_error("Missing authorization code from Google callback.")

    try:
        user_info = await exchange_code_for_google_user(code)
        user = await get_or_create_user(db, user_info)
        tokens = generate_tokens_for_user(user)
    except HTTPException as exc:
        if not wants_redirect:
            raise exc
        return handle_error(str(exc.detail))

    if not wants_redirect:
        response.delete_cookie(
            key="oauth_state",
            httponly=True,
            secure=not settings.DEBUG,
            samesite="lax",
        )
        response.set_cookie(
            key="access_token",
            value=tokens.access_token,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="lax",
            max_age=tokens.expires_in,
        )
        response.set_cookie(
            key="refresh_token",
            value=tokens.refresh_token,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="lax",
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        )
        return tokens

    redirect_url = f"{settings.FRONTEND_URL}{settings.FRONTEND_DASHBOARD_PATH}"
    redirect_response = RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    redirect_response.delete_cookie(
        key="oauth_state",
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
    )
    redirect_response.set_cookie(
        key="access_token",
        value=tokens.access_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=tokens.expires_in,
    )
    redirect_response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )
    return redirect_response


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh JWT Token",
    description="Provides a new access token using a valid refresh token from request body or HttpOnly cookie.",
)
async def refresh_token_endpoint(
    response: Response,
    body: TokenRefreshRequest | None = Body(default=None),
    refresh_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    token_to_refresh = (body.refresh_token if body and body.refresh_token else None) or refresh_token
    if not token_to_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )
    tokens = await refresh_user_tokens(db, token_to_refresh)
    response.set_cookie(
        key="access_token",
        value=tokens.access_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=tokens.expires_in,
    )
    response.set_cookie(
        key="refresh_token",
        value=tokens.refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )
    return tokens


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
    description="Stateless logout endpoint informing the client to discard tokens and clearing auth cookies.",
)
async def logout(
    response: Response,
    current_user: User = Depends(get_current_active_user),
):
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
    )
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
    )
    return MessageResponse(message="Successfully logged out.")
