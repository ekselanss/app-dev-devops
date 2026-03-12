from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()

try:
    import torch
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False


class HealthResponse(BaseModel):
    status: str
    whisper_loaded: bool
    whisper_model: str
    device: str
    gpu_available: bool
    active_sessions: int


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request):
    """Sunucu durumunu kontrol et"""
    whisper = getattr(request.app.state, "whisper", None)
    from app.routers.websocket import session_manager

    return HealthResponse(
        status="ok",
        whisper_loaded=whisper is not None and whisper.model is not None,
        whisper_model=getattr(whisper, "model_name", "unknown") if whisper else "unknown",
        device=getattr(whisper, "device", "cpu") if whisper else "unknown",
        gpu_available=_TORCH_AVAILABLE and torch.cuda.is_available(),
        active_sessions=len(session_manager.active_sessions)
    )


@router.get("/")
async def root():
    return {"message": "Gerçek Zamanlı Video Çeviri API - /ws/translate/{session_id} adresine WebSocket bağlan"}
