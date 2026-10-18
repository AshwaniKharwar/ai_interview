import pytest
from unittest.mock import MagicMock, patch
from core.storage import R2StorageService


@pytest.fixture
def storage():
    return R2StorageService()


def test_storage_is_configured_true(monkeypatch):
    monkeypatch.setattr("core.config.settings.R2_ACCESS_KEY_ID", "test_key")
    monkeypatch.setattr("core.config.settings.R2_SECRET_ACCESS_KEY", "test_secret")
    monkeypatch.setattr("core.config.settings.R2_ENDPOINT_URL", "https://account.r2.cloudflarestorage.com")
    monkeypatch.setattr("core.config.settings.R2_BUCKET_NAME", "test-bucket")
    
    svc = R2StorageService()
    assert svc.is_configured is True


def test_storage_is_configured_false(monkeypatch):
    monkeypatch.setattr("core.config.settings.R2_ACCESS_KEY_ID", "")
    svc = R2StorageService()
    assert svc.is_configured is False


@pytest.mark.asyncio
async def test_upload_file_bytes(storage, monkeypatch):
    monkeypatch.setattr("core.config.settings.R2_ACCESS_KEY_ID", "key")
    monkeypatch.setattr("core.config.settings.R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr("core.config.settings.R2_ENDPOINT_URL", "https://endpoint.com")
    monkeypatch.setattr("core.config.settings.R2_BUCKET_NAME", "my-bucket")

    mock_client = MagicMock()
    storage._client = mock_client

    result = await storage.upload_file_bytes(b"hello world", "resumes/user1/test.pdf", "application/pdf")

    assert result == "resumes/user1/test.pdf"
    mock_client.put_object.assert_called_once_with(
        Bucket="my-bucket",
        Key="resumes/user1/test.pdf",
        Body=b"hello world",
        ContentType="application/pdf",
    )


@pytest.mark.asyncio
async def test_get_file_bytes(storage, monkeypatch):
    monkeypatch.setattr("core.config.settings.R2_ACCESS_KEY_ID", "key")
    monkeypatch.setattr("core.config.settings.R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr("core.config.settings.R2_ENDPOINT_URL", "https://endpoint.com")
    monkeypatch.setattr("core.config.settings.R2_BUCKET_NAME", "my-bucket")

    mock_body = MagicMock()
    mock_body.read.return_value = b"pdf content"
    mock_client = MagicMock()
    mock_client.get_object.return_value = {"Body": mock_body}
    storage._client = mock_client

    content = await storage.get_file_bytes("resumes/user1/test.pdf")
    assert content == b"pdf content"
    mock_client.get_object.assert_called_once_with(
        Bucket="my-bucket",
        Key="resumes/user1/test.pdf",
    )


@pytest.mark.asyncio
async def test_generate_presigned_download_url(storage, monkeypatch):
    monkeypatch.setattr("core.config.settings.R2_ACCESS_KEY_ID", "key")
    monkeypatch.setattr("core.config.settings.R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr("core.config.settings.R2_ENDPOINT_URL", "https://endpoint.com")
    monkeypatch.setattr("core.config.settings.R2_BUCKET_NAME", "my-bucket")

    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://presigned.url/test.pdf"
    storage._client = mock_client

    url = await storage.generate_presigned_download_url("resumes/user1/test.pdf", expires_in=600)
    assert url == "https://presigned.url/test.pdf"
    mock_client.generate_presigned_url.assert_called_once_with(
        ClientMethod="get_object",
        Params={"Bucket": "my-bucket", "Key": "resumes/user1/test.pdf"},
        ExpiresIn=600,
    )


@pytest.mark.asyncio
async def test_delete_file(storage, monkeypatch):
    monkeypatch.setattr("core.config.settings.R2_ACCESS_KEY_ID", "key")
    monkeypatch.setattr("core.config.settings.R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr("core.config.settings.R2_ENDPOINT_URL", "https://endpoint.com")
    monkeypatch.setattr("core.config.settings.R2_BUCKET_NAME", "my-bucket")

    mock_client = MagicMock()
    storage._client = mock_client

    res = await storage.delete_file("resumes/user1/test.pdf")
    assert res is True
    mock_client.delete_object.assert_called_once_with(
        Bucket="my-bucket",
        Key="resumes/user1/test.pdf",
    )
