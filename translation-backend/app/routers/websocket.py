import json
import base64
import asyncio
import logging
import struct
import time
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService

# Transkriptleri dosyaya kaydet (karşılaştırma testi için)
TRANSCRIPT_LOG = Path(__file__).parent.parent.parent / "transcripts.jsonl"

logger = logging.getLogger(__name__)
router = APIRouter()

# 3 saniye @ 16kHz 16-bit mono = 96000 byte
PROCESS_BYTES = 16000 * 2 * 3

# Overlap: cümle kesilmemesi için son 0.5 saniyelik veri sonraki chunk'a aktarılır
OVERLAP_BYTES = int(16000 * 2 * 1.0)  # 1 sn overlap: chunk sinirindaki kelime kayiplarini azaltir

class SessionManager:
    def __init__(self):
        self.active_sessions: dict[str, WebSocket] = {}
        self.audio_buffers: dict[str, bytes] = {}   # ham PCM biriktiricisi
        self.is_processing: dict[str, bool] = {}    # işlem kilidi (CPU'yu korur)

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_sessions[session_id] = websocket
        self.audio_buffers[session_id] = b""
        self.is_processing[session_id] = False
        logger.info(f"Yeni baglanti: {session_id}")

    def disconnect(self, session_id: str):
        self.active_sessions.pop(session_id, None)
        self.audio_buffers.pop(session_id, None)
        self.is_processing.pop(session_id, None)
        logger.info(f"Baglanti kesildi: {session_id}")

    async def send(self, session_id: str, message: dict):
        ws = self.active_sessions.get(session_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"Mesaj gonderilemedi: {e}")

session_manager = SessionManager()

def pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1, bits: int = 16) -> bytes:
    data_size = len(pcm_bytes)
    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16, 1, channels, sample_rate,
        sample_rate * channels * bits // 8,
        channels * bits // 8, bits,
        b'data', data_size)
    return header + pcm_bytes

@router.websocket("/translate/{session_id}")
async def translation_websocket(websocket: WebSocket, session_id: str):
    whisper: WhisperService = websocket.app.state.whisper
    translator: TranslationService = websocket.app.state.translator

    await session_manager.connect(session_id, websocket)

    try:
        await session_manager.send(session_id, {
            "type": "connected",
            "message": "Ceviri servisi hazir!",
            "session_id": session_id
        })

        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive(), timeout=30.0)
            except asyncio.TimeoutError:
                await session_manager.send(session_id, {"type": "ping"})
                continue

            if raw.get("type") == "websocket.disconnect":
                break

            if "text" in raw:
                try:
                    message = json.loads(raw["text"])
                    msg_type = message.get("type")
                    logger.info(f"Text mesaj alindi: {msg_type}")

                    if msg_type == "audio_chunk":
                        raw_data = message.get("data", "")
                        try:
                            pcm = base64.b64decode(raw_data)
                        except Exception as e:
                            logger.warning(f"Base64 decode hatasi: {e}")
                            continue

                        # PCM'i biriktir
                        session_manager.audio_buffers[session_id] += pcm
                        buf_len = len(session_manager.audio_buffers[session_id])

                        # 3 saniye dolunca VE önceki işlem bitmişse işle
                        if buf_len >= PROCESS_BYTES and not session_manager.is_processing[session_id]:
                            audio_to_process = session_manager.audio_buffers[session_id][:PROCESS_BYTES]
                            # Son 0.5 sn'yi sonraki chunk'a overlap olarak bırak
                            session_manager.audio_buffers[session_id] = \
                                session_manager.audio_buffers[session_id][PROCESS_BYTES - OVERLAP_BYTES:]
                            session_manager.is_processing[session_id] = True
                            wav = pcm_to_wav(audio_to_process)
                            # create_task: döngüyü bloklamaz, yeni ses almaya devam eder
                            asyncio.create_task(
                                _process_audio(wav, session_id, whisper, translator)
                            )

                    elif msg_type == "ping":
                        await session_manager.send(session_id, {"type": "pong"})

                except Exception as e:
                    logger.error(f"Text isleme hatasi: {e}")

            elif "bytes" in raw:
                logger.info(f"Binary mesaj alindi: {len(raw['bytes'])} bytes (beklenmiyordu)")

    except WebSocketDisconnect:
        logger.info(f"Disconnect: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket hatasi: {e}")
    finally:
        session_manager.disconnect(session_id)

async def _process_audio(audio_bytes, session_id, whisper, translator):
    try:
        await session_manager.send(session_id, {"type": "processing"})
        logger.info(f"Ses isleniyor: {len(audio_bytes)} bytes")

        transcript = await asyncio.to_thread(whisper.transcribe, audio_bytes)
        text = transcript.get("text", "").strip()
        language = transcript.get("language", "unknown")
        confidence = transcript.get("confidence", 0.0)

        logger.info(f"Transkript: {repr(text)} dil={language} confidence={confidence}")

        if not text:
            await session_manager.send(session_id, {"type": "empty"})
            return

        translation = await translator.translate(text, language)

        result = {
            "type": "translation",
            "original": text,
            "translated": translation["translated"],
            "detected_language": language,
            "confidence": confidence,
            "provider": translation["provider"]
        }
        await session_manager.send(session_id, result)

        # Test logu: her transkripti dosyaya yaz
        try:
            with open(TRANSCRIPT_LOG, "a", encoding="utf-8") as f:
                f.write(json.dumps({
                    "t": round(time.time(), 2),
                    "text": text,
                    "lang": language,
                    "conf": confidence,
                }, ensure_ascii=False) + "\n")
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Ses isleme hatasi: {e}")
    finally:
        # Kilidi her zaman serbest bırak — bir sonraki 3 sn işlenebilsin
        if session_id in session_manager.is_processing:
            session_manager.is_processing[session_id] = False




