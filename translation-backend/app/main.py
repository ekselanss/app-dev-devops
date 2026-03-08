import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import websocket, health
from app.services.whisper_service import WhisperService
from app.services.translation_service import TranslationService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: modelleri yükle
    logger.info("🚀 Sunucu başlatılıyor...")
    app.state.whisper = WhisperService(model_name="small")
    app.state.translator = TranslationService()
    await app.state.whisper.load_model()
    logger.info("✅ Whisper modeli yüklendi")
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
