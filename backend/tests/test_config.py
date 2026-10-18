import pytest
from pydantic import ValidationError
from core.config import Settings


def test_settings_requires_jwt_secret_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)
    assert "JWT_SECRET_KEY" in str(exc_info.value)


@pytest.mark.parametrize("debug", [True, False])
def test_settings_rejects_hardcoded_placeholder_in_all_modes(debug: bool):
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            DEBUG=debug,
            JWT_SECRET_KEY="change_this_to_a_super_secret_key_in_production_32chars",
        )
    assert "A secure, non-default JWT_SECRET_KEY of at least 32 characters must be configured" in str(
        exc_info.value
    )


@pytest.mark.parametrize("debug", [True, False])
def test_settings_rejects_short_key_in_all_modes(debug: bool):
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            DEBUG=debug,
            JWT_SECRET_KEY="too_short_key",
        )
    assert "A secure, non-default JWT_SECRET_KEY of at least 32 characters must be configured" in str(
        exc_info.value
    )


@pytest.mark.parametrize("insecure_key", [
    "secret",
    "secret_key",
    "jwt_secret",
    "password",
    "changeme",
    "admin",
    "change_this_custom_key_that_is_32chars_long",
])
def test_settings_rejects_insecure_defaults(insecure_key: str):
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            DEBUG=True,
            JWT_SECRET_KEY=insecure_key,
        )
    assert "A secure, non-default JWT_SECRET_KEY of at least 32 characters must be configured" in str(
        exc_info.value
    )


@pytest.mark.parametrize("debug", [True, False])
def test_settings_accepts_valid_secure_key_in_all_modes(debug: bool):
    secure_key = "a" * 32
    s = Settings(
        _env_file=None,
        DEBUG=debug,
        JWT_SECRET_KEY=secure_key,
    )
    assert s.DEBUG is debug
    assert s.JWT_SECRET_KEY == secure_key
