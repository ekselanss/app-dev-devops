import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import websocket, health, benchmark, translate
from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService
from app.services.vad_service import VadService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: modelleri yükle
    logger.info("🚀 Sunucu başlatılıyor...")
    model_name = os.environ.get("WHISPER_MODEL", "base")
    app.state.whisper = WhisperService(model_name=model_name)
    app.state.translator = TranslationService()
    await app.state.whisper.load_model()
    # Hızlı mod da aynı modeli kullanır — 1sn chunk boyutu gecikmeyi 3x azaltır
    app.state.whisper_fast = app.state.whisper
    logger.info("✅ Whisper modeli yüklendi (normal + hızlı mod)")
    app.state.vad = VadService()
    app.state.vad.load_model()
    logger.info("✅ Silero VAD modeli yüklendi")
    logger.info("✅ Çeviri servisi hazır")
    yield
    # Shutdown
    logger.info("🛑 Sunucu kapatılıyor...")


app = FastAPI(
    title="Gerçek Zamanlı Video Çeviri API",
    description="Ses akışını alır, Türkçeye çevirir",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production'da değiştir
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])
app.include_router(benchmark.router, prefix="/api", tags=["benchmark"])
app.include_router(translate.router, prefix="/api", tags=["translate"])
