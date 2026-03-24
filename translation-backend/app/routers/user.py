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


class TokenBalance(BaseModel):
    balance: int
    lifetime_used: int
    lifetime_purchased: int


@router.get("/user/profile", response_model=UserProfile)
async def get_user_profile():
    return UserProfile(**_demo_user)


@router.put("/user/profile", response_model=UserProfile)
async def update_user_profile(body: UpdateProfileRequest):
    _demo_user["name"] = body.name.strip()
    return UserProfile(**_demo_user)


@router.get("/user/tokens", response_model=TokenBalance)
async def get_user_tokens():
    return TokenBalance(**_token_data)
