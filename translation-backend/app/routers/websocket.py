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

# 16kHz 16-bit mono PCM sabitleri
SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE

# VAD tabanlı dinamik chunking sabitleri
MIN_BUFFER_SECONDS = 1.0       # minimum 1sn ses biriktir
MAX_BUFFER_SECONDS = 3.0       # maksimum 3sn'de zorla işle
SILENCE_TRIGGER_SECONDS = 0.3  # 0.3sn sessizlik = cümle sonu
OVERLAP_SECONDS = 0.3          # bağlam için 0.3sn örtüşme

MIN_BUFFER_BYTES = int(BYTES_PER_SECOND * MIN_BUFFER_SECONDS)
MAX_BUFFER_BYTES = int(BYTES_PER_SECOND * MAX_BUFFER_SECONDS)
OVERLAP_BYTES = int(BYTES_PER_SECOND * OVERLAP_SECONDS)

# Client 0.5sn chunk gönderiyor → her chunk'ta sessizlik sayacı
# SILENCE_TRIGGER_SECONDS / 0.5 = 0.6 → 1 sessiz chunk yeterli (0.5sn >= 0.3sn)
CHUNK_DURATION = 0.5  # client chunk süresi (saniye)


class SessionManager:
    def __init__(self):
        self.active_sessions: dict[str, WebSocket] = {}
        self.audio_buffers: dict[str, bytes] = {}   # ham PCM biriktiricisi
        self.is_processing: dict[str, bool] = {}    # işlem kilidi (CPU'yu korur)
        self.target_languages: dict[str, str] = {}  # hedef dil (varsayılan: tr)
        self.silence_counters: dict[str, float] = {} # sessizlik süresi (saniye)

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_sessions[session_id] = websocket
        self.audio_buffers[session_id] = b""
        self.is_processing[session_id] = False
        self.target_languages[session_id] = "tr"
        self.silence_counters[session_id] = 0.0
        logger.info(f"Yeni baglanti: {session_id}")

    def disconnect(self, session_id: str):
        self.active_sessions.pop(session_id, None)
        self.audio_buffers.pop(session_id, None)
        self.is_processing.pop(session_id, None)
        self.target_languages.pop(session_id, None)
        self.silence_counters.pop(session_id, None)
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


@router.websocket("/fast/{session_id}")
async def fast_translation_websocket(websocket: WebSocket, session_id: str):
    """Hızlı mod: VAD tabanlı dinamik chunking"""
    whisper = websocket.app.state.whisper_fast
    translator: TranslationService = websocket.app.state.translator
    vad = websocket.app.state.vad
    await _handle_ws(websocket, session_id, whisper, translator, vad)


async def _handle_ws(websocket: WebSocket, session_id: str, whisper, translator, vad):
    await session_manager.connect(session_id, websocket)
    try:
        await session_manager.send(session_id, {
            "type": "connected", "message": "Ceviri servisi hazir!", "session_id": session_id
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

                    if msg_type == "audio_chunk":
                        # Client hedef dil gönderebilir
                        target = message.get("target_language")
                        if target:
                            session_manager.target_languages[session_id] = target

                        raw_data = message.get("data", "")
                        try:
                            pcm = base64.b64decode(raw_data)
                        except Exception as e:
                            logger.warning(f"Base64 decode hatasi: {e}")
                            continue

                        # VAD kontrolü: konuşma var mı?
                        speech_detected = vad.has_speech(pcm)
                        buf = session_manager.audio_buffers[session_id]

                        if not speech_detected and len(buf) == 0:
                            # Sessizlik + boş buffer → atla
                            continue

                        if speech_detected:
                            session_manager.silence_counters[session_id] = 0.0
                            session_manager.audio_buffers[session_id] += pcm
                        else:
                            # Sessizlik ama buffer dolu → sayacı artır, buffer'a ekle
                            session_manager.silence_counters[session_id] += CHUNK_DURATION
                            session_manager.audio_buffers[session_id] += pcm

                        buf_len = len(session_manager.audio_buffers[session_id])
                        silence = session_manager.silence_counters[session_id]

                        should_process = False
                        reason = ""

                        if buf_len >= MAX_BUFFER_BYTES:
                            should_process = True
                            reason = "max_buffer"
                        elif buf_len >= MIN_BUFFER_BYTES and silence >= SILENCE_TRIGGER_SECONDS:
                            should_process = True
                            reason = "sentence_end"

                        if should_process and not session_manager.is_processing[session_id]:
                            audio_to_process = session_manager.audio_buffers[session_id]
                            # Overlap: son 0.3sn'yi bir sonraki buffer'a taşı
                            if len(audio_to_process) > OVERLAP_BYTES:
                                session_manager.audio_buffers[session_id] = audio_to_process[-OVERLAP_BYTES:]
                            else:
                                session_manager.audio_buffers[session_id] = b""
                            session_manager.silence_counters[session_id] = 0.0
                            session_manager.is_processing[session_id] = True

                            wav = pcm_to_wav(audio_to_process)
                            tgt = session_manager.target_languages.get(session_id, "tr")
                            buf_secs = len(audio_to_process) / BYTES_PER_SECOND
                            logger.info(f"VAD tetikledi: {reason}, {buf_secs:.1f}sn ses")
                            asyncio.create_task(
                                _process_audio(wav, session_id, whisper, translator, tgt)
                            )

                    elif msg_type == "set_target_language":
                        tgt = message.get("language", "tr")
                        session_manager.target_languages[session_id] = tgt
                        logger.info(f"Hedef dil değişti: {tgt} (session={session_id})")
                        await session_manager.send(session_id, {
                            "type": "language_changed", "target_language": tgt
                        })

                    elif msg_type == "ping":
                        await session_manager.send(session_id, {"type": "pong"})

                except Exception as e:
                    logger.error(f"Text isleme hatasi: {e}")

    except WebSocketDisconnect:
        logger.info(f"Disconnect: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket hatasi: {e}")
    finally:
        session_manager.disconnect(session_id)


@router.websocket("/translate/{session_id}")
async def translation_websocket(websocket: WebSocket, session_id: str):
    whisper: WhisperService = websocket.app.state.whisper
    translator: TranslationService = websocket.app.state.translator
    vad = websocket.app.state.vad
    await _handle_ws(websocket, session_id, whisper, translator, vad)

async def _process_audio(audio_bytes, session_id, whisper, translator, target_language="tr"):
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

        translation = await translator.translate(text, language, target_language)

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
        # Kilidi her zaman serbest bırak — bir sonraki chunk işlenebilsin
        if session_id in session_manager.is_processing:
            session_manager.is_processing[session_id] = False
