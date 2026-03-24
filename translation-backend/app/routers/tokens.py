"""
GET  /api/tokens/packages  → list of packages
POST /api/tokens/purchase  → { package_id } → mock payment, always succeeds
POST /api/tokens/deduct    → { amount, reason } → deduct tokens from balance
"""
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Import shared token balance from user module to keep a single source of truth
from app.routers.user import _token_data

router = APIRouter()

_packages = [
    {
        "id": "starter",
        "name": "Başlangıç",
        "icon": "⚡",
        "tokens": 500,
        "price_tl": 50,
        "price_per_token": 0.10,
        "popular": False,
        "discount_label": None,
    },
    {
        "id": "popular",
        "name": "Popüler",
        "icon": "🚀",
        "tokens": 1200,
        "price_tl": 100,
        "price_per_token": 0.083,
        "popular": True,
        "discount_label": "%17 İndirim",
    },
    {
        "id": "pro",
        "name": "Pro",
        "icon": "💎",
        "tokens": 3000,
        "price_tl": 200,
        "price_per_token": 0.067,
        "popular": False,
        "discount_label": "%33 İndirim",
    },
]


class TokenPackage(BaseModel):
    id: str
    name: str
    icon: str
    tokens: int
    price_tl: int
    price_per_token: float
    popular: bool
    discount_label: str | None


class PurchaseRequest(BaseModel):
    package_id: str


class PurchaseResponse(BaseModel):
    success: bool
    tokens_added: int
    new_balance: int
    package_id: str


class DeductRequest(BaseModel):
    amount: int
    reason: str = ""


class DeductResponse(BaseModel):
    success: bool
    deducted: int
    new_balance: int


@router.get("/tokens/packages", response_model=List[TokenPackage])
async def list_packages():
    return [TokenPackage(**p) for p in _packages]


@router.post("/tokens/purchase", response_model=PurchaseResponse)
async def purchase_tokens(body: PurchaseRequest):
    pkg = next((p for p in _packages if p["id"] == body.package_id), None)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    _token_data["balance"] += pkg["tokens"]
    _token_data["lifetime_purchased"] += pkg["tokens"]
    return PurchaseResponse(
        success=True,
        tokens_added=pkg["tokens"],
        new_balance=_token_data["balance"],
        package_id=pkg["id"],
    )


@router.post("/tokens/deduct", response_model=DeductResponse)
async def deduct_tokens(body: DeductRequest):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    actual_deduct = min(body.amount, _token_data["balance"])
    _token_data["balance"] -= actual_deduct
    _token_data["lifetime_used"] += actual_deduct
    return DeductResponse(
        success=True,
        deducted=actual_deduct,
        new_balance=_token_data["balance"],
    )
