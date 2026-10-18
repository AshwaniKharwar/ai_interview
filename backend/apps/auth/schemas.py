import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr


class GoogleAuthUrlResponse(BaseModel):
    authorization_url: str


class GoogleUserInfo(BaseModel):
    id: str  # Google sub / id
    email: EmailStr
    verified_email: bool = True
    name: str | None = None
    picture: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenRefreshRequest(BaseModel):
    refresh_token: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None
    picture_url: str | None = None
    is_active: bool
    role: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str
