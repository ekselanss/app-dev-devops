"""
GET /api/user/profile  → { id, name, email, tier, avatar_emoji, created_at }
PUT /api/user/profile  → update name
GET /api/user/tokens   → { balance, lifetime_used, lifetime_purchased }
"""
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# In-memory demo user
_demo_user = {
    "id": "demo-user-001",
    "name": "İsmail Özçelik",
    "email": "ismail@subvoice.app",
    "tier": "pro",
    "avatar_emoji": "😎",
    "created_at": "2026-03-01T00:00:00Z",
}

_token_data = {
    "balance": 2450,
    "lifetime_used": 8550,
    "lifetime_purchased": 11000,
}


class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    tier: str
    avatar_emoji: str
    created_at: str


class UpdateProfileRequest(BaseModel):
    name: str
    email: str | None = None
    avatar_emoji: str | None = None


class TokenBalance(BaseModel):
    balance: int
    lifetime_used: int
    lifetime_purchased: int


# User settings (model, target language, subtitle size)
_user_settings = {
    "default_model": "base",      # base | small | pro
    "target_language": "tr",      # ISO 639-1
    "subtitle_size": "medium",    # small | medium | large
    "token_alert_enabled": True,
    "dark_mode": True,
}


class UserSettings(BaseModel):
    default_model: str
    target_language: str
    subtitle_size: str
    token_alert_enabled: bool
    dark_mode: bool


class UpdateSettingsRequest(BaseModel):
    default_model: str | None = None
    target_language: str | None = None
    subtitle_size: str | None = None
    token_alert_enabled: bool | None = None
    dark_mode: bool | None = None


@router.get("/user/profile", response_model=UserProfile)
async def get_user_profile():
    return UserProfile(**_demo_user)


@router.put("/user/profile", response_model=UserProfile)
async def update_user_profile(body: UpdateProfileRequest):
    _demo_user["name"] = body.name.strip()
    if body.email is not None:
        _demo_user["email"] = body.email.strip()
    if body.avatar_emoji is not None:
        _demo_user["avatar_emoji"] = body.avatar_emoji
    return UserProfile(**_demo_user)


@router.get("/user/tokens", response_model=TokenBalance)
async def get_user_tokens():
    return TokenBalance(**_token_data)


@router.get("/user/settings", response_model=UserSettings)
async def get_user_settings():
    return UserSettings(**_user_settings)


@router.put("/user/settings", response_model=UserSettings)
async def update_user_settings(body: UpdateSettingsRequest):
    if body.default_model is not None:
        _user_settings["default_model"] = body.default_model
    if body.target_language is not None:
        _user_settings["target_language"] = body.target_language
    if body.subtitle_size is not None:
        _user_settings["subtitle_size"] = body.subtitle_size
    if body.token_alert_enabled is not None:
        _user_settings["token_alert_enabled"] = body.token_alert_enabled
    if body.dark_mode is not None:
        _user_settings["dark_mode"] = body.dark_mode
    return UserSettings(**_user_settings)
