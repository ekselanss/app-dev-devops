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
        # Dil kilidi: otomatik tespitle başla, 3 ardışık aynı dil tespitinde kilitlenir
        self._locked_language: str | None = None
        self._lock_votes: int = 0
        self._chunk_counter: int = 0  # Her N chunk'ta dil tespiti zorla

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

    def transcribe(self, audio_bytes: bytes) -> dict:
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
            if rms < 0.02:
                logger.info("Ses çok sessiz, atlandı")
                return {"text": "", "language": "unknown", "confidence": 0.0}

            # Her 3 chunk'ta bir dil tespiti yap (kilitli olsa bile)
            self._chunk_counter += 1
            is_detection_chunk = (self._chunk_counter % 3 == 0)
            use_language = None if is_detection_chunk else self._locked_language

            segments, info = self.model.transcribe(
                audio_array,
                task="transcribe",
                language=use_language,
                temperature=0.0,
                best_of=1,
                beam_size=1,
                condition_on_previous_text=False,
                initial_prompt=None,
                compression_ratio_threshold=2.4,
                no_speech_threshold=0.45,
                log_prob_threshold=-1.0,
                vad_filter=False,
            )

            segments = list(segments)
            text = " ".join(s.text for s in segments).strip()

            # Dil tespiti chunk'ında farklı dil gelirse anında geç
            if is_detection_chunk and info.language != self._locked_language and info.language_probability > 0.70:
                logger.info(f"Dil tespiti: {info.language} ({info.language_probability:.0%}) — kilitli: {self._locked_language}")
                self._locked_language = info.language
                self._lock_votes = 2
                logger.info(f"Dil anında değişti → {info.language}")
                # Yanlış dilde çözülen metni at, bir sonraki chunk doğru dilde gelecek
                if text and self._locked_language != use_language:
                    return {"text": "", "language": info.language, "confidence": round(info.language_probability, 2)}
            language = info.language
            confidence = round(max(0.0, min(1.0, info.language_probability)), 2)

            # Dil kilidi güncelle
            self._update_language_lock(language, confidence)

            # Halüsinasyon tespiti
            if text and self._is_hallucination(text):
                logger.warning(f"Halüsinasyon tespit edildi, atlandı: {text[:60]}")
                return {"text": "", "language": language, "confidence": confidence}

            logger.info(f"[{language} {confidence:.0%}] lock={self._locked_language}: {text[:80]}")
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

    def _update_language_lock(self, language: str, confidence: float):
        """Aynı dil gelince vote artır, farklı dil gelince hızla düşür."""
        if confidence < 0.70:
            return
        if language == self._locked_language:
            self._lock_votes = min(self._lock_votes + 1, 5)
        else:
            # Farklı dil — vote'u hızla düşür
            self._lock_votes -= 1
            if self._lock_votes <= 0:
                self._locked_language = language
                self._lock_votes = 1
                logger.info(f"Dil değişti → {language} (confidence={confidence:.0%})")

    def _is_hallucination(self, text: str) -> bool:
        """Tekrar eden kelime/ifade döngüsü tespiti."""
        words = text.split()
        if len(words) < 6:
            return False
        third = len(words) // 3
        p1 = " ".join(words[:third])
        p2 = " ".join(words[third:2 * third])
        if p1.strip() and p1.strip() == p2.strip():
            return True
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
