import json
import base64
import asyncio
import logging
import struct
import time
import numpy as np
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

# Client chunk süresi
CHUNK_DURATION = 0.5  # saniye

# Ses modu sabitleri
SPEECH_MODE = "speech"
MUSIC_MODE = "music"
MIXED_MODE = "mixed"

# Mod bazlı chunking parametreleri
MODE_PARAMS = {
    SPEECH_MODE: {
        "min_buffer_s": 1.0,
        "max_buffer_s": 3.0,
        "silence_trigger_s": 0.3,
        "min_words_for_translate": 1,  # konuşmada 1 kelime bile çevrilebilir
    },
    MIXED_MODE: {
        "min_buffer_s": 3.0,
        "max_buffer_s": 6.0,
        "silence_trigger_s": 1.0,
        "min_words_for_translate": 3,  # karma modda en az 3 kelime
    },
    MUSIC_MODE: {
        "min_buffer_s": 5.0,
        "max_buffer_s": 10.0,
        "silence_trigger_s": 2.0,
        "min_words_for_translate": 4,  # müzikte en az 4 kelime
    },
}

OVERLAP_SECONDS = 0.3
OVERLAP_BYTES = int(BYTES_PER_SECOND * OVERLAP_SECONDS)


def detect_audio_mode(pcm_bytes: bytes, rms_history: list) -> tuple[str, float]:
    """Spectral flatness + RMS varyansı ile müzik/konuşma/karma tespit et.
    Müzikte RMS sabit kalır, konuşmada dalgalanır.
    Returns: (mod, skor)
    """
    audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    if len(audio) < 256:
        return SPEECH_MODE, 1.0

    # 1. RMS hesapla
    rms = float(np.sqrt(np.mean(audio ** 2)))
    rms_history.append(rms)
    if len(rms_history) > 12:  # son 6 saniye (12 x 0.5sn)
        rms_history[:] = rms_history[-12:]

    # 2. Spectral flatness
    fft = np.abs(np.fft.rfft(audio))
    fft = fft[1:]
    fft = np.maximum(fft, 1e-10)
    geo_mean = np.exp(np.mean(np.log(fft)))
    arith_mean = np.mean(fft)
    flatness = geo_mean / arith_mean if arith_mean > 1e-10 else 1.0

    # 3. RMS varyansı (son 6sn)
    # Müzik: RMS sürekli yüksek ve sabit (varyans düşük)
    # Konuşma: RMS dalgalı (sessizlik-konuşma geçişleri)
    if len(rms_history) >= 4:
        rms_std = float(np.std(rms_history))
        rms_mean = float(np.mean(rms_history))
        # Normalize: coefficient of variation
        rms_cv = rms_std / rms_mean if rms_mean > 0.01 else 1.0
    else:
        rms_cv = 1.0  # yeterli veri yok, konuşma varsay

    # 4. Müzik skoru: düşük flatness + düşük RMS varyansı + yüksek RMS = müzik
    is_loud = rms > 0.05
    is_steady = rms_cv < 0.4  # müzikte varyasyon düşük
    is_harmonic = flatness < 0.25

    music_score = 0
    if is_loud:
        music_score += 1
    if is_steady:
        music_score += 1
    if is_harmonic:
        music_score += 1

    if music_score >= 3:
        return MUSIC_MODE, flatness
    elif music_score >= 2:
        return MIXED_MODE, flatness
    else:
        return SPEECH_MODE, flatness


# Pro tier limitleri
MAX_FREE_SESSIONS = 50      # Free tier max eş zamanlı kullanıcı
MAX_PRO_SESSIONS = 15       # Pro tier max eş zamanlı kullanıcı (GPU yoğun)


class SessionManager:
    def __init__(self):
        self.active_sessions: dict[str, WebSocket] = {}
        self.audio_buffers: dict[str, bytes] = {}   # ham PCM biriktiricisi
        self.is_processing: dict[str, bool] = {}    # işlem kilidi (CPU'yu korur)
        self.target_languages: dict[str, str] = {}  # hedef dil (varsayılan: tr)
        self.silence_counters: dict[str, float] = {} # sessizlik süresi (saniye)
        self.audio_modes: dict[str, str] = {}        # ses modu: speech/music/mixed
        self.mode_votes: dict[str, list] = {}         # son N chunk'ın mod oyları
        self.pending_texts: dict[str, list] = {}      # kısa transkript birleştirici
        self.rms_histories: dict[str, list] = {}      # RMS geçmişi (müzik tespiti)
        self.tiers: dict[str, str] = {}                # kullanıcı tier: "free" veya "pro"
        self.recent_texts: dict[str, list] = {}        # son N transkript (halüsinasyon filtresi)

    def count_by_tier(self, tier: str) -> int:
        """Belirli tier'daki aktif session sayısı."""
        return sum(1 for t in self.tiers.values() if t == tier)

    def can_accept(self, tier: str) -> bool:
        """Yeni session kabul edilebilir mi?"""
        if tier == "pro":
            return self.count_by_tier("pro") < MAX_PRO_SESSIONS
        else:
            return self.count_by_tier("free") < MAX_FREE_SESSIONS

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_sessions[session_id] = websocket
        self.audio_buffers[session_id] = b""
        self.is_processing[session_id] = False
        self.target_languages[session_id] = "tr"
        self.silence_counters[session_id] = 0.0
        self.audio_modes[session_id] = SPEECH_MODE
        self.mode_votes[session_id] = []
        self.pending_texts[session_id] = []
        self.rms_histories[session_id] = []
        self.tiers[session_id] = "free"
        self.recent_texts[session_id] = []
        logger.info(f"Yeni baglanti: {session_id}")

    def disconnect(self, session_id: str):
        self.active_sessions.pop(session_id, None)
        self.audio_buffers.pop(session_id, None)
        self.is_processing.pop(session_id, None)
        self.target_languages.pop(session_id, None)
        self.silence_counters.pop(session_id, None)
        self.audio_modes.pop(session_id, None)
        self.mode_votes.pop(session_id, None)
        self.pending_texts.pop(session_id, None)
        self.rms_histories.pop(session_id, None)
        self.tiers.pop(session_id, None)
        self.recent_texts.pop(session_id, None)
        logger.info(f"Baglanti kesildi: {session_id}")

    def is_repeated_hallucination(self, session_id: str, text: str) -> bool:
        """Son N transkripte bakarak tekrarlayan halüsinasyonları tespit et."""
        recent = self.recent_texts.get(session_id, [])
        # Son 5 transkriptte 3+ kez aynı metin geldiyse halüsinasyon
        count = sum(1 for t in recent[-8:] if t == text)
        # Geçmişe ekle
        recent.append(text)
        if len(recent) > 15:
            recent[:] = recent[-15:]
        self.recent_texts[session_id] = recent
        return count >= 2  # 3. tekrarda filtrele

    def update_audio_mode(self, session_id: str, pcm_bytes: bytes):
        """Son 6 chunk'ın spectral flatness + RMS varyansına bakarak mod belirle."""
        rms_hist = self.rms_histories.get(session_id, [])
        mode, flatness = detect_audio_mode(pcm_bytes, rms_hist)
        self.rms_histories[session_id] = rms_hist
        votes = self.mode_votes.get(session_id, [])
        votes.append(mode)
        if len(votes) > 6:
            votes = votes[-6:]
        self.mode_votes[session_id] = votes

        # Çoğunluk oyu
        from collections import Counter
        counts = Counter(votes)
        new_mode = counts.most_common(1)[0][0]

        old_mode = self.audio_modes.get(session_id, SPEECH_MODE)
        if new_mode != old_mode:
            logger.info(f"[{session_id}] Ses modu değişti: {old_mode} → {new_mode} (flatness={flatness:.3f})")
        self.audio_modes[session_id] = new_mode
        return new_mode

    def get_mode_params(self, session_id: str) -> dict:
        """Session'ın mevcut moduna göre chunking parametrelerini döndür."""
        mode = self.audio_modes.get(session_id, SPEECH_MODE)
        return MODE_PARAMS[mode]

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
    """Free tier: small model, VAD tabanlı dinamik chunking"""
    whisper = websocket.app.state.whisper_fast
    translator: TranslationService = websocket.app.state.translator
    vad = websocket.app.state.vad
    await _handle_ws(websocket, session_id, whisper, translator, vad, tier="free")


@router.websocket("/pro/{session_id}")
async def pro_translation_websocket(websocket: WebSocket, session_id: str):
    """Pro tier: large-v3 model, yüksek doğruluk"""
    whisper = websocket.app.state.whisper_pro
    translator: TranslationService = websocket.app.state.translator
    vad = websocket.app.state.vad
    await _handle_ws(websocket, session_id, whisper, translator, vad, tier="pro")


async def _handle_ws(websocket: WebSocket, session_id: str, whisper, translator, vad, tier: str = "free"):
    # Kapasite kontrolü: Pro kullanıcılar doluysa yeni sunucu öner
    if not session_manager.can_accept(tier):
        await websocket.accept()
        free_count = session_manager.count_by_tier("free")
        pro_count = session_manager.count_by_tier("pro")
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Sunucu kapasitesi dolu. Aktif: {free_count} free + {pro_count} pro. Lütfen daha sonra tekrar deneyin.",
            "code": "capacity_full",
            "tier": tier,
        }))
        await websocket.close()
        logger.warning(f"[{tier}] Kapasite dolu, {session_id} reddedildi (free={free_count}, pro={pro_count})")
        return

    await session_manager.connect(session_id, websocket)
    session_manager.tiers[session_id] = tier
    free_count = session_manager.count_by_tier("free")
    pro_count = session_manager.count_by_tier("pro")
    logger.info(f"[{tier}] Session kabul edildi: {session_id} (aktif: {free_count} free + {pro_count} pro)")
    try:
        await session_manager.send(session_id, {
            "type": "connected",
            "message": "Ceviri servisi hazir!",
            "session_id": session_id,
            "tier": tier,
            "model": whisper.model_name,
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

                        # Müzik/konuşma modu tespit et
                        current_mode = session_manager.update_audio_mode(session_id, pcm)
                        params = session_manager.get_mode_params(session_id)

                        min_buf_bytes = int(BYTES_PER_SECOND * params["min_buffer_s"])
                        max_buf_bytes = int(BYTES_PER_SECOND * params["max_buffer_s"])
                        silence_trigger = params["silence_trigger_s"]

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

                        if buf_len >= max_buf_bytes:
                            should_process = True
                            reason = f"max_buffer({params['max_buffer_s']}s)"
                        elif buf_len >= min_buf_bytes and silence >= silence_trigger:
                            should_process = True
                            reason = f"sentence_end(silence={silence:.1f}s)"

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
                            logger.info(f"[{current_mode}] VAD tetikledi: {reason}, {buf_secs:.1f}sn ses")
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

                    elif msg_type == "set_tier":
                        new_tier = message.get("tier", "free")
                        if new_tier in ("free", "pro"):
                            session_manager.tiers[session_id] = new_tier
                            # Pro ise model değiştir
                            if new_tier == "pro":
                                whisper = websocket.app.state.whisper_pro
                            else:
                                whisper = websocket.app.state.whisper
                            logger.info(f"[{session_id}] Tier değişti: {new_tier} → model={whisper.model_name}")
                            await session_manager.send(session_id, {
                                "type": "tier_changed", "tier": new_tier, "model": whisper.model_name
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
        whisper.clear_session(session_id)
        session_manager.disconnect(session_id)


@router.websocket("/translate/{session_id}")
async def translation_websocket(websocket: WebSocket, session_id: str):
    """Free tier (varsayılan): small model"""
    whisper: WhisperService = websocket.app.state.whisper
    translator: TranslationService = websocket.app.state.translator
    vad = websocket.app.state.vad
    await _handle_ws(websocket, session_id, whisper, translator, vad, tier="free")

async def _process_audio(audio_bytes, session_id, whisper, translator, target_language="tr"):
    try:
        await session_manager.send(session_id, {"type": "processing"})
        logger.info(f"Ses isleniyor: {len(audio_bytes)} bytes")

        transcript = await asyncio.to_thread(whisper.transcribe, audio_bytes, session_id)
        text = transcript.get("text", "").strip()
        language = transcript.get("language", "unknown")
        confidence = transcript.get("confidence", 0.0)

        logger.info(f"Transkript: {repr(text)} dil={language} confidence={confidence}")

        if not text:
            await session_manager.send(session_id, {"type": "empty"})
            return

        # Session bazlı tekrar halüsinasyon filtresi
        if session_manager.is_repeated_hallucination(session_id, text):
            logger.warning(f"[{session_id}] Tekrar halüsinasyon filtrelendi: {text[:40]}")
            await session_manager.send(session_id, {"type": "empty"})
            return

        # Düşük confidence + kısa metin → muhtemelen saçmalık
        if confidence < 0.5 and len(text.split()) <= 2:
            logger.info(f"[{session_id}] Düşük güven kısa metin atlandı: {text} ({confidence:.0%})")
            await session_manager.send(session_id, {"type": "empty"})
            return

        # Kısa transkript birleştirici: müzik/karma modda kısa metinleri biriktir
        mode = session_manager.audio_modes.get(session_id, SPEECH_MODE)
        params = MODE_PARAMS.get(mode, MODE_PARAMS[SPEECH_MODE])
        min_words = params["min_words_for_translate"]
        word_count = len(text.split())

        if word_count < min_words:
            # Kısa metin — biriktir, henüz çevirme
            pending = session_manager.pending_texts.get(session_id, [])
            pending.append({"text": text, "language": language, "confidence": confidence})
            session_manager.pending_texts[session_id] = pending
            logger.info(f"[{mode}] Kısa metin biriktirildi ({word_count} kelime, bekleyen: {len(pending)}): {text}")

            # Biriken metinlerin toplam kelime sayısı yeterliyse gönder
            all_texts = " ".join(p["text"] for p in pending)
            total_words = len(all_texts.split())
            if total_words < min_words:
                return
            # Yeterli birikti — birleşik metni çevir
            text = all_texts
            session_manager.pending_texts[session_id] = []
            logger.info(f"[{mode}] Birleşik metin çeviriye gönderiliyor ({total_words} kelime): {text[:80]}")

        else:
            # Yeterli uzunlukta — bekleyen varsa onları da ekle
            pending = session_manager.pending_texts.get(session_id, [])
            if pending:
                prev_texts = " ".join(p["text"] for p in pending)
                text = prev_texts + " " + text
                session_manager.pending_texts[session_id] = []
                logger.info(f"[{mode}] Bekleyen metinler eklendi, toplam: {text[:80]}")

        # Kaynak dil = hedef dil ise çeviriye gerek yok, direkt göster
        if language == target_language:
            logger.info(f"[{session_id}] Kaynak=Hedef dil ({language}), çeviri atlandı")
            result = {
                "type": "translation",
                "original": text,
                "translated": text,  # aynı metin
                "detected_language": language,
                "confidence": confidence,
                "provider": "passthrough",
                "audio_mode": mode,
            }
            await session_manager.send(session_id, result)
        else:
            translation = await translator.translate(text, language, target_language)
            result = {
                "type": "translation",
                "original": text,
                "translated": translation["translated"],
                "detected_language": language,
                "confidence": confidence,
                "provider": translation["provider"],
                "audio_mode": mode,
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
