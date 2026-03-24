"""
UI Backend testleri — user, sessions, tokens router'ları
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Sadece yeni UI router'larını test et (ağır ML bağımlılıkları olmadan)
from app.routers import user as user_module, sessions as sessions_module, tokens as tokens_module

test_app = FastAPI()
test_app.include_router(user_module.router, prefix="/api")
test_app.include_router(sessions_module.router, prefix="/api")
test_app.include_router(tokens_module.router, prefix="/api")


@pytest.fixture(autouse=True)
def reset_state():
    """Her testten önce state'i sıfırla."""
    user_module._demo_user.update({
        "id": "demo-user-001",
        "name": "İsmail Özçelik",
        "email": "ismail@subvoice.app",
        "tier": "pro",
        "avatar_emoji": "😎",
        "created_at": "2026-03-01T00:00:00Z",
    })
    user_module._token_data.update({
        "balance": 2450,
        "lifetime_used": 8550,
        "lifetime_purchased": 11000,
    })
    user_module._user_settings.update({
        "default_model": "base",
        "target_language": "tr",
        "subtitle_size": "medium",
        "token_alert_enabled": True,
        "dark_mode": True,
    })
    sessions_module._sessions.clear()
    sessions_module._sessions.extend([
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
    ])
    yield


client = TestClient(test_app)


# ──────────────────────────────────────────────
# USER ROUTER
# ──────────────────────────────────────────────

class TestUserProfile:
    def test_get_profile_returns_200(self):
        res = client.get("/api/user/profile")
        assert res.status_code == 200

    def test_get_profile_fields(self):
        data = client.get("/api/user/profile").json()
        assert data["id"] == "demo-user-001"
        assert data["name"] == "İsmail Özçelik"
        assert data["email"] == "ismail@subvoice.app"
        assert data["tier"] == "pro"
        assert data["avatar_emoji"] == "😎"
        assert "created_at" in data

    def test_update_profile_name(self):
        res = client.put("/api/user/profile", json={"name": "İsmail Test"})
        assert res.status_code == 200
        assert res.json()["name"] == "İsmail Test"

    def test_update_profile_persists(self):
        client.put("/api/user/profile", json={"name": "Yeni İsim"})
        data = client.get("/api/user/profile").json()
        assert data["name"] == "Yeni İsim"

    def test_update_profile_strips_whitespace(self):
        res = client.put("/api/user/profile", json={"name": "  Boşluk  "})
        assert res.json()["name"] == "Boşluk"

    def test_update_profile_missing_name_returns_422(self):
        res = client.put("/api/user/profile", json={})
        assert res.status_code == 422


class TestUserTokens:
    def test_get_tokens_returns_200(self):
        res = client.get("/api/user/tokens")
        assert res.status_code == 200

    def test_get_tokens_fields(self):
        data = client.get("/api/user/tokens").json()
        assert data["balance"] == 2450
        assert data["lifetime_used"] == 8550
        assert data["lifetime_purchased"] == 11000

    def test_tokens_balance_non_negative(self):
        data = client.get("/api/user/tokens").json()
        assert data["balance"] >= 0


# ──────────────────────────────────────────────
# SESSIONS ROUTER
# ──────────────────────────────────────────────

class TestSessions:
    def test_list_sessions_returns_200(self):
        res = client.get("/api/sessions")
        assert res.status_code == 200

    def test_list_sessions_returns_list(self):
        data = client.get("/api/sessions").json()
        assert isinstance(data, list)
        assert len(data) == 3

    def test_list_sessions_newest_first(self):
        data = client.get("/api/sessions").json()
        assert data[0]["id"] == "sess-003"
        assert data[-1]["id"] == "sess-001"

    def test_create_session_returns_201_or_200(self):
        res = client.post("/api/sessions", json={
            "title": "Test Video",
            "source_lang": "en",
            "target_lang": "tr",
            "duration_seconds": 120,
            "tokens_used": 30,
            "icon": "🎤",
        })
        assert res.status_code == 200

    def test_create_session_fields(self):
        res = client.post("/api/sessions", json={
            "title": "Yeni Oturum",
            "source_lang": "ja",
            "target_lang": "tr",
            "duration_seconds": 300,
            "tokens_used": 50,
            "icon": "📺",
        })
        data = res.json()
        assert data["title"] == "Yeni Oturum"
        assert data["source_lang"] == "ja"
        assert data["duration_seconds"] == 300
        assert data["tokens_used"] == 50
        assert "id" in data
        assert "created_at" in data

    def test_create_session_appears_in_list(self):
        client.post("/api/sessions", json={
            "title": "Liste Testi",
            "source_lang": "en",
            "target_lang": "tr",
            "duration_seconds": 60,
            "tokens_used": 10,
            "icon": "🎤",
        })
        data = client.get("/api/sessions").json()
        titles = [s["title"] for s in data]
        assert "Liste Testi" in titles

    def test_create_session_defaults(self):
        res = client.post("/api/sessions", json={"title": "Minimal"})
        data = res.json()
        assert data["source_lang"] == "en"
        assert data["target_lang"] == "tr"
        assert data["duration_seconds"] == 0
        assert data["tokens_used"] == 0

    def test_delete_session_success(self):
        res = client.delete("/api/sessions/sess-001")
        assert res.status_code == 200
        assert res.json()["deleted"] == "sess-001"

    def test_delete_session_removes_from_list(self):
        client.delete("/api/sessions/sess-001")
        data = client.get("/api/sessions").json()
        ids = [s["id"] for s in data]
        assert "sess-001" not in ids

    def test_delete_nonexistent_session_returns_404(self):
        res = client.delete("/api/sessions/nonexistent")
        assert res.status_code == 404

    def test_list_sessions_max_20(self):
        # 20'den fazla oturum ekle
        for i in range(25):
            client.post("/api/sessions", json={
                "title": f"Oturum {i}",
                "source_lang": "en",
                "target_lang": "tr",
                "duration_seconds": 60,
                "tokens_used": 5,
                "icon": "🎤",
            })
        data = client.get("/api/sessions").json()
        assert len(data) <= 20


class TestSessionStats:
    def test_stats_returns_200(self):
        res = client.get("/api/sessions/stats")
        assert res.status_code == 200

    def test_stats_fields(self):
        data = client.get("/api/sessions/stats").json()
        assert "total_sessions" in data
        assert "total_minutes" in data
        assert "total_tokens_used" in data

    def test_stats_correct_values(self):
        data = client.get("/api/sessions/stats").json()
        # 3 demo oturum: 2940+2160+1104=6204sn = 103.4dk, tokens=245+180+92=517
        assert data["total_sessions"] == 3
        assert data["total_minutes"] == pytest.approx(103.4, abs=0.1)
        assert data["total_tokens_used"] == 517

    def test_stats_update_after_create(self):
        before = client.get("/api/sessions/stats").json()
        client.post("/api/sessions", json={
            "title": "İstatistik Testi",
            "source_lang": "en",
            "target_lang": "tr",
            "duration_seconds": 600,
            "tokens_used": 100,
            "icon": "🎤",
        })
        after = client.get("/api/sessions/stats").json()
        assert after["total_sessions"] == before["total_sessions"] + 1
        assert after["total_tokens_used"] == before["total_tokens_used"] + 100


# ──────────────────────────────────────────────
# TOKENS ROUTER
# ──────────────────────────────────────────────

class TestTokenPackages:
    def test_list_packages_returns_200(self):
        res = client.get("/api/tokens/packages")
        assert res.status_code == 200

    def test_list_packages_returns_3(self):
        data = client.get("/api/tokens/packages").json()
        assert len(data) == 3

    def test_package_fields(self):
        data = client.get("/api/tokens/packages").json()
        for pkg in data:
            assert "id" in pkg
            assert "name" in pkg
            assert "tokens" in pkg
            assert "price_tl" in pkg
            assert "popular" in pkg

    def test_popular_package_flagged(self):
        data = client.get("/api/tokens/packages").json()
        popular = [p for p in data if p["popular"]]
        assert len(popular) == 1
        assert popular[0]["id"] == "popular"

    def test_package_prices(self):
        data = client.get("/api/tokens/packages").json()
        starter = next(p for p in data if p["id"] == "starter")
        assert starter["tokens"] == 500
        assert starter["price_tl"] == 50


class TestTokenPurchase:
    def test_purchase_starter_success(self):
        res = client.post("/api/tokens/purchase", json={"package_id": "starter"})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["tokens_added"] == 500

    def test_purchase_updates_balance(self):
        before = client.get("/api/user/tokens").json()["balance"]
        client.post("/api/tokens/purchase", json={"package_id": "starter"})
        after = client.get("/api/user/tokens").json()["balance"]
        assert after == before + 500

    def test_purchase_popular_package(self):
        res = client.post("/api/tokens/purchase", json={"package_id": "popular"})
        assert res.json()["tokens_added"] == 1200

    def test_purchase_pro_package(self):
        res = client.post("/api/tokens/purchase", json={"package_id": "pro"})
        assert res.json()["tokens_added"] == 3000

    def test_purchase_invalid_package_returns_404(self):
        res = client.post("/api/tokens/purchase", json={"package_id": "invalid"})
        assert res.status_code == 404

    def test_purchase_updates_lifetime_purchased(self):
        before = client.get("/api/user/tokens").json()["lifetime_purchased"]
        client.post("/api/tokens/purchase", json={"package_id": "starter"})
        after = client.get("/api/user/tokens").json()["lifetime_purchased"]
        assert after == before + 500


class TestTokenDeduct:
    def test_deduct_success(self):
        res = client.post("/api/tokens/deduct", json={"amount": 100, "reason": "test"})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["deducted"] == 100

    def test_deduct_updates_balance(self):
        before = client.get("/api/user/tokens").json()["balance"]
        client.post("/api/tokens/deduct", json={"amount": 200, "reason": "session"})
        after = client.get("/api/user/tokens").json()["balance"]
        assert after == before - 200

    def test_deduct_never_goes_below_zero(self):
        # Bakiyeden fazlasını çekmeye çalış
        client.post("/api/tokens/deduct", json={"amount": 999999, "reason": "test"})
        balance = client.get("/api/user/tokens").json()["balance"]
        assert balance == 0

    def test_deduct_zero_amount_returns_400(self):
        res = client.post("/api/tokens/deduct", json={"amount": 0, "reason": "test"})
        assert res.status_code == 400

    def test_deduct_negative_amount_returns_400(self):
        res = client.post("/api/tokens/deduct", json={"amount": -50, "reason": "test"})
        assert res.status_code == 400

    def test_deduct_updates_lifetime_used(self):
        before = client.get("/api/user/tokens").json()["lifetime_used"]
        client.post("/api/tokens/deduct", json={"amount": 100, "reason": "test"})
        after = client.get("/api/user/tokens").json()["lifetime_used"]
        assert after == before + 100


class TestUserSettings:
    def test_get_settings_returns_200(self):
        res = client.get("/api/user/settings")
        assert res.status_code == 200

    def test_get_settings_fields(self):
        data = client.get("/api/user/settings").json()
        assert "default_model" in data
        assert "target_language" in data
        assert "subtitle_size" in data
        assert "token_alert_enabled" in data
        assert "dark_mode" in data

    def test_get_settings_defaults(self):
        data = client.get("/api/user/settings").json()
        assert data["default_model"] == "base"
        assert data["target_language"] == "tr"
        assert data["subtitle_size"] == "medium"
        assert data["token_alert_enabled"] is True
        assert data["dark_mode"] is True

    def test_update_default_model(self):
        res = client.put("/api/user/settings", json={"default_model": "small"})
        assert res.status_code == 200
        assert res.json()["default_model"] == "small"

    def test_update_target_language(self):
        res = client.put("/api/user/settings", json={"target_language": "en"})
        assert res.status_code == 200
        assert res.json()["target_language"] == "en"

    def test_update_subtitle_size(self):
        res = client.put("/api/user/settings", json={"subtitle_size": "large"})
        assert res.status_code == 200
        assert res.json()["subtitle_size"] == "large"

    def test_update_token_alert(self):
        res = client.put("/api/user/settings", json={"token_alert_enabled": False})
        assert res.status_code == 200
        assert res.json()["token_alert_enabled"] is False

    def test_update_dark_mode(self):
        res = client.put("/api/user/settings", json={"dark_mode": False})
        assert res.status_code == 200
        assert res.json()["dark_mode"] is False

    def test_partial_update_preserves_other_fields(self):
        client.put("/api/user/settings", json={"target_language": "de"})
        data = client.get("/api/user/settings").json()
        assert data["target_language"] == "de"
        assert data["subtitle_size"] == "medium"  # unchanged
        assert data["dark_mode"] is True  # unchanged

    def test_update_multiple_fields(self):
        res = client.put("/api/user/settings", json={
            "default_model": "pro",
            "target_language": "fr",
            "subtitle_size": "small",
        })
        assert res.status_code == 200
        data = res.json()
        assert data["default_model"] == "pro"
        assert data["target_language"] == "fr"
        assert data["subtitle_size"] == "small"
