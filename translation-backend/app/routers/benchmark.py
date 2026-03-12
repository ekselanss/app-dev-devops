"""
/api/benchmark  — base / small / medium model karşılaştırma testi
Aynı ses dosyasını 3 modelle işler, latency + transkript döner.
"""
import io
import time
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

# Model önbelleği — bir kez yükle, sonra yeniden kullan
_model_cache: dict = {}


def _load_model(name: str):
    if name not in _model_cache:
        from faster_whisper import WhisperModel
        logger.info(f"Benchmark: '{name}' modeli yükleniyor...")
        _model_cache[name] = WhisperModel(name, device="cpu", compute_type="int8")
        logger.info(f"Benchmark: '{name}' hazır")
    return _model_cache[name]


def _transcribe_with(model_name: str, audio_bytes: bytes) -> dict:
    import numpy as np
    import soundfile as sf

    model = _load_model(model_name)

    # bytes → numpy
    try:
        with io.BytesIO(audio_bytes) as buf:
            audio, sr = sf.read(buf, dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != 16000:
            new_len = int(len(audio) * 16000 / sr)
            indices = np.linspace(0, len(audio) - 1, new_len)
            audio = np.interp(indices, np.arange(len(audio)), audio)
    except Exception:
        audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    t0 = time.perf_counter()
    segments, info = model.transcribe(
        audio,
        task="transcribe",
        temperature=0.0,
        beam_size=3,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    text = " ".join(s.text for s in segments).strip()
    latency = round(time.perf_counter() - t0, 2)

    return {
        "model": model_name,
        "text": text,
        "language": info.language,
        "language_probability": round(info.language_probability, 2),
        "latency_sec": latency,
    }


@router.post("/benchmark")
async def benchmark_models(file: UploadFile = File(...)):
    """
    Aynı ses dosyasını base / small / medium ile işler.
    multipart/form-data: field adı = 'file', WAV/MP3/OGG formatları kabul edilir.
    """
    audio_bytes = await file.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(400, "Ses dosyası çok kısa")

    results = []
    for model_name in ["base", "small", "medium"]:
        try:
            result = await asyncio.to_thread(_transcribe_with, model_name, audio_bytes)
        except Exception as e:
            result = {"model": model_name, "error": str(e)}
        results.append(result)
        logger.info(f"Benchmark [{model_name}]: {result}")

    return {"results": results, "audio_bytes": len(audio_bytes)}


@router.get("/benchmark/models")
async def list_benchmark_models():
    """Yüklü model listesi ve bellek kullanımı."""
    loaded = list(_model_cache.keys())
    return {
        "available": ["base", "small", "medium"],
        "loaded_in_cache": loaded,
        "note": "POST /api/benchmark ile karşılaştırma testi yapabilirsiniz",
    }
