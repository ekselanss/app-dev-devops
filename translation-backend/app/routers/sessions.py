"""
GET    /api/sessions          → list of recent sessions (last 20)
POST   /api/sessions          → create session record
DELETE /api/sessions/{id}     → delete session
GET    /api/sessions/stats    → { total_sessions, total_minutes, total_tokens_used }
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# In-memory session store — pre-seeded with demo data
_sessions: List[dict] = [
    {
        "id": "sess-001",
        "title": "Netflix Dizi - Stranger Things S4",
        "source_lang": "en",
        "target_lang": "tr",
        "duration_seconds": 2940,
        "tokens_used": 245,
        "created_at": "2026-03-24T10:00:00Z",
        "icon": "📺",
    },
    {
        "id": "sess-002",
        "title": "YouTube - Tokyo Vlog 2026",
        "source_lang": "ja",
        "target_lang": "tr",
        "duration_seconds": 2160,
        "tokens_used": 180,
        "created_at": "2026-03-23T18:30:00Z",
        "icon": "🎬",
    },
    {
        "id": "sess-003",
        "title": "TikTok - Cooking Recipe",
        "source_lang": "es",
        "target_lang": "tr",
        "duration_seconds": 1104,
        "tokens_used": 92,
        "created_at": "2026-03-22T14:15:00Z",
        "icon": "📱",
    },
]


class Session(BaseModel):
    id: str
    title: str
    source_lang: str
    target_lang: str
    duration_seconds: int
    tokens_used: int
    created_at: str
    icon: str


class CreateSessionRequest(BaseModel):
    title: str
    source_lang: str = "en"
    target_lang: str = "tr"
    duration_seconds: int = 0
    tokens_used: int = 0
    icon: str = "🎤"


class SessionStats(BaseModel):
    total_sessions: int
    total_minutes: float
    total_tokens_used: int


@router.get("/sessions", response_model=List[Session])
async def list_sessions():
    return [Session(**s) for s in _sessions[-20:]][::-1]


@router.post("/sessions", response_model=Session)
async def create_session(body: CreateSessionRequest):
    session = {
        "id": f"sess-{uuid.uuid4().hex[:8]}",
        "title": body.title,
        "source_lang": body.source_lang,
        "target_lang": body.target_lang,
        "duration_seconds": body.duration_seconds,
        "tokens_used": body.tokens_used,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "icon": body.icon,
    }
    _sessions.append(session)
    return Session(**session)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    global _sessions
    original_len = len(_sessions)
    _sessions = [s for s in _sessions if s["id"] != session_id]
    if len(_sessions) == original_len:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": session_id}


@router.get("/sessions/stats", response_model=SessionStats)
async def get_session_stats():
    total_seconds = sum(s["duration_seconds"] for s in _sessions)
    total_tokens = sum(s["tokens_used"] for s in _sessions)
    return SessionStats(
        total_sessions=len(_sessions),
        total_minutes=round(total_seconds / 60, 1),
        total_tokens_used=total_tokens,
    )
