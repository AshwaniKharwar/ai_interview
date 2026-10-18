import asyncio
from typing import Optional
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from core.config import settings


class R2StorageService:
    def __init__(self):
        self._client = None

    @property
    def is_configured(self) -> bool:
        return bool(
            settings.R2_ACCESS_KEY_ID
            and settings.R2_SECRET_ACCESS_KEY
            and settings.r2_endpoint
            and settings.R2_BUCKET_NAME
        )

    def _get_client(self):
        if self._client is None:
            if not self.is_configured:
                raise ValueError("Cloudflare R2 is not configured in settings.")
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.r2_endpoint,
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                config=Config(signature_version="s3v4"),
                region_name="auto",
            )
        return self._client

    async def upload_file_bytes(
        self,
        file_bytes: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Uploads raw bytes to the configured Cloudflare R2 bucket.
        Returns the object key upon success.
        """
        def _upload():
            client = self._get_client()
            client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=key,
                Body=file_bytes,
                ContentType=content_type,
            )
            return key

        return await asyncio.to_thread(_upload)

    async def get_file_bytes(self, key: str) -> bytes:
        """Downloads file content bytes from the R2 bucket."""
        def _get():
            client = self._get_client()
            response = client.get_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
            return response["Body"].read()

        return await asyncio.to_thread(_get)

    async def generate_presigned_download_url(
        self, key: str, expires_in: int = 900
    ) -> str:
        """Generates a secure temporary presigned GET URL for an object (default 15 mins)."""
        def _generate():
            client = self._get_client()
            return client.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": settings.R2_BUCKET_NAME, "Key": key},
                ExpiresIn=expires_in,
            )

        return await asyncio.to_thread(_generate)

    async def delete_file(self, key: str) -> bool:
        """Deletes an object from the R2 bucket."""
        def _delete():
            client = self._get_client()
            try:
                client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
                return True
            except ClientError:
                return False

        return await asyncio.to_thread(_delete)


# Global storage service singleton
storage_service = R2StorageService()
