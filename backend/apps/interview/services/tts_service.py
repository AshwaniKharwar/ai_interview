import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator, Optional
import websockets
from websockets.asyncio.client import ClientConnection

from core.config import settings

logger = logging.getLogger(__name__)

CARTESIA_WS_URL_TEMPLATE = (
    "wss://api.cartesia.ai/tts/websocket?api_key={api_key}&cartesia_version=2024-06-10"
)


class CartesiaTTSService:
    """Streams synthesized speech from Cartesia Sonic over persistent WebSocket
    with sub-120ms time-to-first-audio and instant context cancellation.
    Strictly adheres to zero mock fallback policy.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        voice_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ):
        self.api_key = api_key or settings.CARTESIA_API_KEY
        if not self.api_key:
            raise ValueError(
                "CARTESIA_API_KEY is not configured. Live TTS synthesis requires a valid Cartesia API key."
            )
        self.voice_id = voice_id or settings.CARTESIA_VOICE_ID
        self.model_id = model_id or settings.CARTESIA_MODEL_ID
        self.ws: Optional[ClientConnection] = None
        self._is_closed = False

    async def connect(self) -> None:
        """Connects to Cartesia Sonic WebSocket API."""
        url = CARTESIA_WS_URL_TEMPLATE.format(api_key=self.api_key)
        try:
            self.ws = await websockets.connect(
                url,
                ping_interval=15,
                ping_timeout=10,
            )
            self._is_closed = False
            logger.info("Successfully connected to Cartesia Sonic TTS WebSocket.")
        except Exception as e:
            logger.error("Failed to connect to Cartesia TTS: %s", e)
            raise

    async def stream_synthesize(
        self, text: str, context_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Sends transcript to Cartesia and yields base64-encoded PCM audio chunks.
        Yields base64 audio string for each chunk.
        """
        if not text or not text.strip():
            return

        if not self.ws or self._is_closed:
            await self.connect()

        ctx_id = context_id or str(uuid.uuid4())
        payload = {
            "context_id": ctx_id,
            "model_id": self.model_id,
            "transcript": text,
            "voice": {
                "mode": "id",
                "id": self.voice_id,
            },
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": 24000,
            },
            "continue": False,
        }

        try:
            await self.ws.send(json.dumps(payload))
            async for raw_message in self.ws:
                if self._is_closed:
                    break
                try:
                    data = json.loads(raw_message)
                    msg_ctx = data.get("context_id")
                    if data.get("type") == "error" or data.get("error"):
                        if not msg_ctx or msg_ctx == ctx_id:
                            err_msg = data.get("error") or "Unknown Cartesia error"
                            logger.error("Cartesia synthesis error: %s (status_code %s)", err_msg, data.get("status_code"))
                            raise RuntimeError(f"Cartesia TTS error: {err_msg}")
                    if msg_ctx != ctx_id:
                        continue
                    if data.get("data"):
                        yield data["data"]
                    if data.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
        except websockets.exceptions.ConnectionClosed as e:
            logger.info("Cartesia WebSocket closed: %s", e)
            self._is_closed = True
        except Exception as e:
            logger.error("Error during Cartesia speech synthesis: %s", e)
            raise

    async def cancel_context(self, context_id: str) -> None:
        """Sends instant cancel message for the active context to stop audio generation."""
        if self.ws and not self._is_closed:
            try:
                await self.ws.send(json.dumps({"context_id": context_id, "cancel": True}))
                logger.info("Sent cancellation for Cartesia context: %s", context_id)
            except Exception as e:
                logger.warning("Failed to cancel Cartesia context: %s", e)

    async def close(self) -> None:
        """Closes the WebSocket connection."""
        self._is_closed = True
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
