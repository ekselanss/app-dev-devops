import logging
import numpy as np

logger = logging.getLogger(__name__)

# 16kHz mono 16-bit PCM sabitleri
SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
# Silero VAD pencere boyutu (sample)
VAD_WINDOW = 512


class VadService:
    """
    Silero VAD modeli ile konuşma tespiti.
    faster-whisper'ın içindeki Silero ONNX modelini kullanır — ek bağımlılık yok.
    """

    def __init__(self, speech_threshold: float = 0.45, silence_threshold: float = 0.25):
        self.speech_threshold = speech_threshold
        self.silence_threshold = silence_threshold
        self.model = None

    def load_model(self):
        from faster_whisper.vad import get_vad_model

        self.model = get_vad_model()
        logger.info(
            f"Silero VAD modeli yüklendi "
            f"(speech={self.speech_threshold}, silence={self.silence_threshold})"
        )

    def _pcm_to_float(self, pcm_bytes: bytes) -> np.ndarray:
        """16-bit PCM bytes → float32 numpy array."""
        audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
        return audio / 32768.0

    def _get_speech_prob(self, pcm_bytes: bytes) -> float:
        """PCM bytes için ortalama konuşma olasılığını döndür."""
        if self.model is None:
            raise RuntimeError("VAD modeli henüz yüklenmedi!")

        audio = self._pcm_to_float(pcm_bytes)

        # Silero VAD 512 sample'lık pencerelere böler, uzunluk 512'nin katı olmalı
        remainder = len(audio) % VAD_WINDOW
        if remainder != 0:
            pad = VAD_WINDOW - remainder
            audio = np.pad(audio, (0, pad), mode='constant')

        # Model her pencere için bir olasılık döndürür → max'ını al
        probs = self.model(audio, num_samples=VAD_WINDOW)
        return float(probs.max())

    def has_speech(self, pcm_bytes: bytes) -> bool:
        """Chunk'ta konuşma var mı? (eşik: speech_threshold)"""
        prob = self._get_speech_prob(pcm_bytes)
        return prob >= self.speech_threshold

    def is_silence(self, pcm_bytes: bytes) -> bool:
        """Chunk sessiz mi? (eşik: silence_threshold altı)"""
        prob = self._get_speech_prob(pcm_bytes)
        return prob < self.silence_threshold
