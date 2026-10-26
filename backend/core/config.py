import os
from typing import List
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_JWT_SECRETS = {
    "change_this_to_a_super_secret_key_in_production_32chars",
    "secret",
    "secret_key",
    "jwt_secret",
    "password",
    "changeme",
    "admin",
}


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Interview System"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/interview_db"

    # JWT Settings
    JWT_SECRET_KEY: str = Field(
        ...,
        description="Secret key for JWT generation; must be configured via environment and cannot be hardcoded.",
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth 2.0
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"

    # Frontend Configuration
    FRONTEND_URL: str = "http://localhost:3000"
    FRONTEND_AUTH_CALLBACK_PATH: str = "/auth/callback"
    FRONTEND_LOGIN_PATH: str = "/login"
    FRONTEND_DASHBOARD_PATH: str = "/dashboard"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # Cloudflare R2 Storage Settings
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "ai-interview-system"
    R2_ENDPOINT_URL: str = ""

    # LLM Settings
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # Voice Engine (STT & TTS) Settings
    DEEPGRAM_API_KEY: str = Field(
        default="", description="Deepgram Nova-2 API key for streaming STT"
    )
    CARTESIA_API_KEY: str = Field(
        default="", description="Cartesia Sonic API key for ultra-low latency TTS"
    )
    CARTESIA_VOICE_ID: str = Field(
        default="3a01612e-07da-4a85-bba8-ce10481df477",
        description="Cartesia Sonic Voice ID (default: Gareth - Conversational Specialist)",
    )
    CARTESIA_MODEL_ID: str = Field(
        default="sonic-2", description="Cartesia model ID"
    )

    @property
    def r2_endpoint(self) -> str:
        if self.R2_ENDPOINT_URL:
            return self.R2_ENDPOINT_URL
        if self.R2_ACCOUNT_ID:
            return f"https://{self.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        return ""

    model_config = SettingsConfigDict(
        env_file=(
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
            ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        key = (self.JWT_SECRET_KEY or "").strip()
        if (
            not key
            or key in INSECURE_JWT_SECRETS
            or "change_this" in key.lower()
            or len(key) < 32
        ):
            raise ValueError(
                "A secure, non-default JWT_SECRET_KEY of at least 32 characters must be configured in all environments."
            )
        return self


settings = Settings()


