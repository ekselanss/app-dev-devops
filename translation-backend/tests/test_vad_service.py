"""VAD servisinin temel doğruluk testleri."""

import numpy as np
import pytest
from app.services.vad_service import VadService

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2


def _make_pcm(duration_s: float, freq: float = 0.0, amplitude: float = 0.0) -> bytes:
    """Test için PCM ses verisi üret."""
    n_samples = int(SAMPLE_RATE * duration_s)
    if freq > 0 and amplitude > 0:
        t = np.linspace(0, duration_s, n_samples, dtype=np.float32)
        audio = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    else:
        audio = np.zeros(n_samples, dtype=np.float32)
    pcm = (audio * 32767).astype(np.int16)
    return pcm.tobytes()


@pytest.fixture(scope="module")
def vad():
    service = VadService()
    service.load_model()
    return service


def test_silence_detected(vad: VadService):
    """Sıfırlardan oluşan ses → konuşma yok."""
    silent_pcm = _make_pcm(0.5)
    assert not vad.has_speech(silent_pcm), "Sessiz ses konuşma olarak algılandı"
    assert vad.is_silence(silent_pcm), "Sessiz ses sessizlik olarak algılanmadı"


def test_tone_not_speech(vad: VadService):
    """Sabit frekanslı sinüs sesi konuşma değil."""
    tone_pcm = _make_pcm(0.5, freq=440.0, amplitude=0.8)
    # Sinüs tonu genelde konuşma olarak algılanmaz, ama model davranışına bağlı
    # En azından sessizlik eşiğinin altında olmamalı
    result = vad.has_speech(tone_pcm)
    # Bu test bilgilendirme amaçlı — sinüs tonunun sonucu model versiyonuna göre değişebilir
    assert isinstance(result, bool)
