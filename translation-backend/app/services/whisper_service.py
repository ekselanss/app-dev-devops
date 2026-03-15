import io
import os
import logging
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


class WhisperService:
    """
    faster-whisper ile ses -> metin donusumu.
    openai-whisper'dan 4-8x daha hizli, ayni kalite.
    """

    def __init__(self, model_name: str = "base"):
        self.model_name = model_name
        self.model = None
        self.device = "cpu"
        # Dil kilidi: session bazlı (her kullanıcının kendi dil kilidi)
        self._session_locks: dict[str, dict] = {}

    def _get_session_state(self, session_id: str) -> dict:
        """Session bazlı dil kilidi state'i döndür."""
        if session_id not in self._session_locks:
            self._session_locks[session_id] = {
                "locked_language": None,
                "lock_votes": 0,
                "chunk_counter": 0,
            }
        return self._session_locks[session_id]

    def clear_session(self, session_id: str):
        """Session kapandığında dil kilidini temizle."""
        self._session_locks.pop(session_id, None)

    async def load_model(self):
        from faster_whisper import WhisperModel
        import platform

        cpu_threads = int(os.environ.get("CPU_THREADS", "0"))
        if cpu_threads <= 0:
            cpu_threads = min(os.cpu_count() or 4, 16)

        # GPU auto-detect: CUDA varsa float16, yoksa CPU int8
        device = "cpu"
        compute = "int8"
        try:
            import ctranslate2
            cuda_types = ctranslate2.get_supported_compute_types("cuda")
            if cuda_types:
                device = "cuda"
                compute = "float16"
                logger.info(f"CUDA GPU algilandi — GPU modunda calisilacak (types: {cuda_types})")
        except Exception:
            pass

        self.device = device

        logger.info(
            f"faster-whisper '{self.model_name}' yukleniyor "
            f"({device} {compute}, {cpu_threads} thread, {platform.machine()})..."
        )
        self.model = WhisperModel(
            self.model_name,
            device=device,
            compute_type=compute,
            cpu_threads=cpu_threads if device == "cpu" else 1,
            num_workers=2,
        )
        logger.info(
            f"faster-whisper hazir — model={self.model_name} "
            f"device={device} compute={compute}"
        )

    def transcribe(self, audio_bytes: bytes, session_id: str = "default") -> dict:
        if self.model is None:
            raise RuntimeError("Whisper modeli henuz yuklenmedi!")

        try:
            audio_array = self._bytes_to_numpy(audio_bytes)

            if len(audio_array) < 16000 * 0.3:
                return {"text": "", "language": "unknown", "confidence": 0.0}

            # Ses normalizasyonu: hoparlör→mikrofon yolu tutarsız seviye üretir
            audio_array = self._normalize(audio_array)

            # Ses enerjisi log: sessizlik mi yoksa gerçek ses mi?
            rms = float(np.sqrt(np.mean(audio_array ** 2)))
            logger.info(f"Ses RMS: {rms:.4f}")
            if rms < 0.03:
                logger.info("Ses çok sessiz, atlandı")
                return {"text": "", "language": "unknown", "confidence": 0.0}

            # Session bazlı dil kilidi
            state = self._get_session_state(session_id)

            # Her 3 chunk'ta bir dil tespiti yap (kilitli olsa bile)
            state["chunk_counter"] += 1
            is_detection_chunk = (state["chunk_counter"] % 3 == 0)
            use_language = None if is_detection_chunk else state["locked_language"]

            # beam_size: model boyutuna göre ayarla
            # small → beam=1 (hızlı, 50 user taşır)
            # large-v3 → beam=3 (doğru, max 10-15 user)
            use_beam = 3 if "large" in self.model_name else 1

            segments, info = self.model.transcribe(
                audio_array,
                task="transcribe",
                language=use_language,
                temperature=0.0,
                best_of=1,
                beam_size=use_beam,
                condition_on_previous_text=False,
                initial_prompt=None,
                compression_ratio_threshold=2.4,
                no_speech_threshold=0.50,
                log_prob_threshold=-1.0,
                vad_filter=False,
            )

            segments = list(segments)
            text = " ".join(s.text for s in segments).strip()

            # Dil tespiti chunk'ında farklı dil gelirse anında geç
            if is_detection_chunk and info.language != state["locked_language"] and info.language_probability > 0.70:
                logger.info(f"[{session_id}] Dil tespiti: {info.language} ({info.language_probability:.0%}) — kilitli: {state['locked_language']}")
                state["locked_language"] = info.language
                state["lock_votes"] = 2
                logger.info(f"[{session_id}] Dil anında değişti → {info.language}")
                # Yanlış dilde çözülen metni at, bir sonraki chunk doğru dilde gelecek
                if text and state["locked_language"] != use_language:
                    return {"text": "", "language": info.language, "confidence": round(info.language_probability, 2)}
            language = info.language
            confidence = round(max(0.0, min(1.0, info.language_probability)), 2)

            # Dil kilidi güncelle (session bazlı)
            self._update_language_lock(language, confidence, state)

            # Halüsinasyon tespiti
            if text and self._is_hallucination(text):
                logger.warning(f"Halüsinasyon tespit edildi, atlandı: {text[:60]}")
                return {"text": "", "language": language, "confidence": confidence}

            logger.info(f"[{session_id}] [{language} {confidence:.0%}] lock={state['locked_language']}: {text[:80]}")
            return {"text": text, "language": language, "confidence": confidence}

        except Exception as e:
            logger.error(f"Transkript hatasi: {e}")
            return {"text": "", "language": "unknown", "confidence": 0.0, "error": str(e)}

    def _normalize(self, audio: np.ndarray) -> np.ndarray:
        """Ses seviyesini -1..1 aralığına normalize et."""
        peak = np.max(np.abs(audio))
        if peak > 0.01:          # sessizliği normalize etme
            audio = audio / peak * 0.95
        return audio

    def _update_language_lock(self, language: str, confidence: float, state: dict):
        """Aynı dil gelince vote artır, farklı dil gelince yavaşça düşür.
        Daha stabil: düşük confidence dil değişimlerini engeller."""
        if confidence < 0.75:
            # Düşük güven — hiçbir şey yapma, mevcut kilidi koru
            return
        if language == state["locked_language"]:
            state["lock_votes"] = min(state["lock_votes"] + 1, 7)
        else:
            # Farklı dil — yüksek güvenle bile yavaş düşür
            if confidence >= 0.90:
                state["lock_votes"] -= 2  # çok yüksek güven: hızlı geçiş
            else:
                state["lock_votes"] -= 1  # orta güven: yavaş geçiş
            if state["lock_votes"] <= 0:
                state["locked_language"] = language
                state["lock_votes"] = 2
                logger.info(f"Dil değişti → {language} (confidence={confidence:.0%})")

    # Whisper'ın bilinen halüsinasyon kalıpları (tüm dillerde)
    HALLUCINATION_PATTERNS = {
        # Arapça YouTube halüsinasyonları
        "اشتركوا في القناة",  # "Kanala abone olun"
        "شكرا لمشاهدتكم",    # "İzlediğiniz için teşekkürler"
        "ترجمة",              # "Çeviri"
        # İngilizce
        "thank you",
        "thanks for watching",
        "subscribe",
        "please subscribe",
        "like and subscribe",
        # Türkçe
        "altyazı m.k.",
        "altyazı",
        "abone olun",
        # Urduca/Farsça karışımları
        "موسیقی",             # "Müzik"
    }

    def _is_hallucination(self, text: str) -> bool:
        """Gelişmiş halüsinasyon tespiti: kalıp + tekrar + kısa saçmalık."""
        text_lower = text.strip().lower()

        # 1. Bilinen halüsinasyon kalıpları
        for pattern in self.HALLUCINATION_PATTERNS:
            if text_lower == pattern.lower() or text_lower == pattern:
                return True

        # 2. Çok kısa + düşük bilgi içeriği (1-2 karakter/kelime saçmalıklar)
        words = text.split()
        if len(words) == 1 and len(text) <= 3:
            return True  # "شكرا", "it.", "ok" gibi

        # 3. Tekrar eden kelime/ifade döngüsü
        if len(words) >= 6:
            third = len(words) // 3
            p1 = " ".join(words[:third])
            p2 = " ".join(words[third:2 * third])
            if p1.strip() and p1.strip() == p2.strip():
                return True

        # 4. N-gram tekrarı
        n = 4
        if len(words) >= n * 3:
            for i in range(len(words) - n):
                ngram = tuple(words[i:i + n])
                count = sum(
                    1 for j in range(len(words) - n)
                    if tuple(words[j:j + n]) == ngram
                )
                if count >= 3:
                    return True

        return False

    def _bytes_to_numpy(self, audio_bytes: bytes) -> np.ndarray:
        try:
            with io.BytesIO(audio_bytes) as buf:
                audio, sample_rate = sf.read(buf, dtype='float32')
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            if sample_rate != 16000:
                ratio = 16000 / sample_rate
                new_len = int(len(audio) * ratio)
                indices = np.linspace(0, len(audio) - 1, new_len)
                audio = np.interp(indices, np.arange(len(audio)), audio)
            return audio
        except Exception:
            audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
            return audio / 32768.0
