import asyncio
import json
import logging
from typing import AsyncGenerator, Optional
import websockets
from websockets.asyncio.client import ClientConnection

from core.config import settings

logger = logging.getLogger(__name__)

DEEPGRAM_WS_URL = (
    "wss://api.deepgram.com/v1/listen?"
    "encoding=linear16&sample_rate=16000&channels=1&model=nova-2&smart_format=true&interim_results=true&endpointing=300"
)


class DeepgramSTTService:
    """Streams linear16 16kHz PCM audio to Deepgram Nova-2 via persistent WebSocket
    and yields interim and final transcripts.
    Strictly enforces zero mock fallback policy.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.DEEPGRAM_API_KEY
        if not self.api_key:
            raise ValueError(
                "DEEPGRAM_API_KEY is not configured. Live STT transcription requires a valid Deepgram API key."
            )
        self.ws: Optional[ClientConnection] = None
        self._is_closed = False

    async def connect(self) -> None:
        """Establishes WebSocket connection to Deepgram Nova-2."""
        headers = {"Authorization": f"Token {self.api_key}"}
        try:
            self.ws = await websockets.connect(
                DEEPGRAM_WS_URL,
                additional_headers=headers,
                ping_interval=15,
                ping_timeout=10,
            )
            self._is_closed = False
            logger.info("Successfully connected to Deepgram Nova-2 streaming STT.")
        except Exception as e:
            logger.error("Failed to connect to Deepgram STT: %s", e)
            raise

    async def send_audio(self, pcm_bytes: bytes) -> None:
        """Sends raw 16kHz PCM audio chunk to Deepgram."""
        if self.ws and not self._is_closed:
            try:
                await self.ws.send(pcm_bytes)
            except Exception as e:
                logger.warning("Error sending audio chunk to Deepgram: %s", e)
                raise

    async def receive_transcripts(self) -> AsyncGenerator[dict, None]:
        """Yields transcript events from Deepgram:
        {"transcript": str, "is_final": bool, "speech_final": bool}
        """
        if not self.ws:
            raise RuntimeError("Deepgram STT WebSocket is not connected.")

        try:
            async for raw_message in self.ws:
                if self._is_closed:
                    break
                try:
                    data = json.loads(raw_message)
                    msg_type = data.get("type")
                    if msg_type == "Results":
                        channel = data.get("channel", {})
                        alternatives = channel.get("alternatives", [])
                        if alternatives:
                            alt = alternatives[0]
                            transcript = alt.get("transcript", "")
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)
                            if transcript:
                                yield {
                                    "transcript": transcript,
                                    "is_final": is_final,
                                    "speech_final": speech_final,
                                }
                    elif msg_type == "UtteranceEnd":
                        yield {
                            "transcript": "",
                            "is_final": True,
                            "speech_final": True,
                            "utterance_end": True,
                        }
                except json.JSONDecodeError:
                    continue
        except websockets.exceptions.ConnectionClosed as e:
            logger.info("Deepgram WebSocket closed: code=%s, reason=%s", e.code, e.reason)
        except Exception as e:
            logger.error("Error receiving from Deepgram STT: %s", e)
            raise
        finally:
            self._is_closed = True

    async def finish_stream(self) -> None:
        """Sends finish stream signal to Deepgram."""
        if self.ws and not self._is_closed:
            try:
                # Deepgram recognizes an empty byte frame or CloseStream JSON
                await self.ws.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

    async def close(self) -> None:
        """Closes the Deepgram WebSocket connection."""
        self._is_closed = True
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
