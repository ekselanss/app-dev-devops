"""
DeepL → Google Translate fallback testleri.
DeepL başarısız olunca Google'a otomatik geçiş doğrulanır.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from app.services.translation_service import TranslationService


@pytest.fixture
def service_with_deepl(monkeypatch):
    """DeepL API key'i olan servis."""
    monkeypatch.setenv("DEEPL_API_KEY", "fake-deepl-key-123")
    return TranslationService()


@pytest.fixture
def service_no_deepl(monkeypatch):
    """DeepL API key'i olmayan servis (sadece Google)."""
    monkeypatch.delenv("DEEPL_API_KEY", raising=False)
    return TranslationService()


@pytest.mark.asyncio
async def test_deepl_success_no_fallback(service_with_deepl):
    """DeepL çalışınca Google'a gidilmemeli."""
    with patch.object(service_with_deepl, "_translate_deepl", new_callable=AsyncMock) as mock_deepl, \
         patch.object(service_with_deepl, "_translate_google", new_callable=AsyncMock) as mock_google:

        mock_deepl.return_value = {
            "translated": "Merhaba dünya",
            "source_language": "en",
            "provider": "deepl"
        }

        result = await service_with_deepl.translate("Hello world", "en", "tr")

        assert result["translated"] == "Merhaba dünya"
        assert result["provider"] == "deepl"
        mock_deepl.assert_called_once()
        mock_google.assert_not_called()


@pytest.mark.asyncio
async def test_deepl_fails_fallback_to_google(service_with_deepl):
    """DeepL hata verince Google'a geçmeli, kullanıcı çeviri almalı."""
    with patch.object(service_with_deepl, "_translate_deepl", new_callable=AsyncMock) as mock_deepl, \
         patch.object(service_with_deepl, "_translate_google", new_callable=AsyncMock) as mock_google:

        mock_deepl.side_effect = Exception("DeepL 429: Quota exceeded")
        mock_google.return_value = {
            "translated": "Merhaba dünya",
            "source_language": "en",
            "provider": "google"
        }

        result = await service_with_deepl.translate("Hello world", "en", "tr")

        assert result["translated"] == "Merhaba dünya"
        assert result["provider"] == "google"
        assert result.get("fallback") is True
        mock_deepl.assert_called_once()
        mock_google.assert_called_once()


@pytest.mark.asyncio
async def test_no_deepl_key_goes_directly_to_google(service_no_deepl):
    """DeepL key yoksa direkt Google'a gitmeli."""
    with patch.object(service_no_deepl, "_translate_google", new_callable=AsyncMock) as mock_google:
        mock_google.return_value = {
            "translated": "Merhaba",
            "source_language": "en",
            "provider": "google"
        }

        result = await service_no_deepl.translate("Hello", "en", "tr")

        assert result["provider"] == "google"
        mock_google.assert_called_once()


@pytest.mark.asyncio
async def test_both_providers_fail_returns_error(service_with_deepl):
    """Her iki sağlayıcı da başarısız olursa hata mesajı dönmeli."""
    with patch.object(service_with_deepl, "_translate_deepl", new_callable=AsyncMock) as mock_deepl, \
         patch.object(service_with_deepl, "_translate_google", new_callable=AsyncMock) as mock_google:

        mock_deepl.side_effect = Exception("DeepL down")
        mock_google.side_effect = Exception("Google down")

        result = await service_with_deepl.translate("Hello", "en", "tr")

        assert result["provider"] == "error"
        assert "Çeviri hatası" in result["translated"]


@pytest.mark.asyncio
async def test_empty_text_skips_translation(service_with_deepl):
    """Boş metin gelince API çağrısı yapılmamalı."""
    with patch.object(service_with_deepl, "_translate_deepl", new_callable=AsyncMock) as mock_deepl:
        result = await service_with_deepl.translate("", "en", "tr")
        assert result["provider"] == "none"
        mock_deepl.assert_not_called()


@pytest.mark.asyncio
async def test_same_language_skips_translation(service_with_deepl):
    """Kaynak ve hedef dil aynıysa çeviri yapılmamalı."""
    with patch.object(service_with_deepl, "_translate_deepl", new_callable=AsyncMock) as mock_deepl:
        result = await service_with_deepl.translate("Merhaba", "tr", "tr")
        assert result["provider"] == "none"
        assert result["translated"] == "Merhaba"
        mock_deepl.assert_not_called()
