import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import websocket, health, benchmark, translate, user, sessions, tokens
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

    # Tier sistemi: free=small, pro=large-v3
    free_model = os.environ.get("WHISPER_MODEL_FREE", "small")
    pro_model = os.environ.get("WHISPER_MODEL_PRO", "large-v3")

    # Free model (varsayılan)
    app.state.whisper = WhisperService(model_name=free_model)
    app.state.translator = TranslationService()
    await app.state.whisper.load_model()
    app.state.whisper_fast = app.state.whisper
    logger.info(f"✅ Free model yüklendi: {free_model}")

    # Pro model (ayrı instance)
    if pro_model != free_model:
        app.state.whisper_pro = WhisperService(model_name=pro_model)
        await app.state.whisper_pro.load_model()
        logger.info(f"✅ Pro model yüklendi: {pro_model}")
    else:
        app.state.whisper_pro = app.state.whisper
        logger.info("✅ Pro model = Free model (aynı)")

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
    allow_origins=["*"],
    allow_credentials=False,  # True + "*" WebSocket upgrade'i bloklar (Starlette 1.0)
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])
app.include_router(benchmark.router, prefix="/api", tags=["benchmark"])
app.include_router(translate.router, prefix="/api", tags=["translate"])
app.include_router(user.router, prefix="/api", tags=["user"])
app.include_router(sessions.router, prefix="/api", tags=["sessions"])
app.include_router(tokens.router, prefix="/api", tags=["tokens"])
