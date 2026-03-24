import os
import logging
import httpx
from typing import Optional
from collections import deque

logger = logging.getLogger(__name__)

# Hedef dil kodları (client'tan gelen kısa kod → DeepL/Google kodu)
TARGET_LANGUAGE_MAP = {
    "tr": {"deepl": "TR", "google": "tr", "name": "Türkçe"},
    "en": {"deepl": "EN", "google": "en", "name": "English"},
    "de": {"deepl": "DE", "google": "de", "name": "Deutsch"},
    "fr": {"deepl": "FR", "google": "fr", "name": "Français"},
    "es": {"deepl": "ES", "google": "es", "name": "Español"},
    "it": {"deepl": "IT", "google": "it", "name": "Italiano"},
    "pt": {"deepl": "PT-PT", "google": "pt", "name": "Português"},
    "ru": {"deepl": "RU", "google": "ru", "name": "Русский"},
    "ja": {"deepl": "JA", "google": "ja", "name": "日本語"},
    "ko": {"deepl": "KO", "google": "ko", "name": "한국어"},
    "zh": {"deepl": "ZH", "google": "zh", "name": "中文"},
    "ar": {"deepl": "AR", "google": "ar", "name": "العربية"},
    "nl": {"deepl": "NL", "google": "nl", "name": "Nederlands"},
}

# DeepL dil kodları eşlemesi (Whisper → DeepL)
LANGUAGE_MAP = {
    "en": "EN",
    "de": "DE",
    "fr": "FR",
    "es": "ES",
    "it": "IT",
    "pt": "PT",
    "ru": "RU",
    "ja": "JA",
    "ko": "KO",
    "zh": "ZH",
    "ar": "AR",
    "nl": "NL",
    "pl": "PL",
    "sv": "SV",
    "da": "DA",
    "fi": "FI",
    "nb": "NB",
    "cs": "CS",
    "sk": "SK",
    "hu": "HU",
    "ro": "RO",
    "bg": "BG",
    "uk": "UK",
    "id": "ID",
    "tr": "TR",
}


class TranslationService:
    """
    DeepL API ile metin çevirisi.
    DeepL key yoksa Google Translate fallback'i kullanır.
    """

    def __init__(self):
        self.deepl_api_key = os.getenv("DEEPL_API_KEY", "")
        self.deepl_base_url = "https://api-free.deepl.com/v2"  # Ücretsiz plan
        # Pro plan için: "https://api.deepl.com/v2"

        # Bağlam tamponu: önceki çevirileri sakla (daha tutarlı çeviri için)
        self.context_buffer: deque = deque(maxlen=3)

        if self.deepl_api_key:
            logger.info("✅ DeepL API anahtarı bulundu")
        else:
            logger.warning("⚠️ DeepL API anahtarı yok, Google Translate kullanılacak")

    async def translate(self, text: str, source_language: str, target_language: str = "tr") -> dict:
        """
        Metni hedef dile çevir.

        Args:
            text: Çevrilecek metin
            source_language: Kaynak dil kodu (Whisper formatında, örn: "en")
            target_language: Hedef dil kodu (örn: "tr", "en", "de")

        Returns:
            {
                "translated": "Çevrilmiş metin...",
                "source_language": "en",
                "provider": "deepl"
            }
        """
        if not text or not text.strip():
            return {"translated": "", "source_language": source_language, "provider": "none"}

        # Kaynak ve hedef aynı dil ise çevirme
        if source_language.lower() == target_language.lower():
            return {"translated": text, "source_language": source_language, "provider": "none"}

        # Google Translate ücretsiz API ~5000 karakter limiti var
        # Çok uzun metni son cümleyi bulmaya çalışarak kes
        MAX_CHARS = 3000
        if len(text) > MAX_CHARS:
            truncated = text[:MAX_CHARS]
            last_punct = max(
                truncated.rfind(". "),
                truncated.rfind("? "),
                truncated.rfind("! "),
                truncated.rfind("\n"),
            )
            text = truncated[:last_punct + 1].strip() if last_punct > MAX_CHARS // 2 else truncated.strip()
            logger.info(f"Metin kısaltıldı: {len(text)} karakter")

        try:
            if self.deepl_api_key:
                try:
                    result = await self._translate_deepl(text, source_language, target_language)
                except Exception as deepl_err:
                    logger.warning(f"⚠️ DeepL başarısız, Google'a geçiliyor: {deepl_err}")
                    result = await self._translate_google(text, source_language, target_language)
                    result["fallback"] = True
            else:
                result = await self._translate_google(text, source_language, target_language)

            # Bağlam tamponuna ekle
            self.context_buffer.append({
                "original": text,
                "translated": result["translated"]
            })

            return result

        except Exception as e:
            logger.error(f"Çeviri hatası (tüm sağlayıcılar başarısız): {e}")
            return {
                "translated": f"[Çeviri hatası: {str(e)}]",
                "source_language": source_language,
                "provider": "error"
            }

    async def _translate_deepl(self, text: str, source_language: str, target_language: str = "tr") -> dict:
        """DeepL API ile çeviri"""
        source_lang_deepl = LANGUAGE_MAP.get(source_language.lower(), source_language.upper())
        target_info = TARGET_LANGUAGE_MAP.get(target_language, {"deepl": target_language.upper()})
        target_lang_deepl = target_info["deepl"]

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{self.deepl_base_url}/translate",
                headers={
                    "Authorization": f"DeepL-Auth-Key {self.deepl_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "text": [text],
                    "source_lang": source_lang_deepl,
                    "target_lang": target_lang_deepl,
                    "formality": "default",
                    "tag_handling": "off"
                }
            )
            response.raise_for_status()
            data = response.json()
            translated = data["translations"][0]["text"]

            logger.info(f"🌐 DeepL [{source_language}→{target_language.upper()}]: {translated[:60]}...")
            return {
                "translated": translated,
                "source_language": source_language,
                "provider": "deepl"
            }

    async def _translate_google(self, text: str, source_language: str, target_language: str = "tr") -> dict:
        """
        Google Translate (ücretsiz, resmi olmayan endpoint).
        Production'da Google Cloud Translation API kullan.
        """
        target_info = TARGET_LANGUAGE_MAP.get(target_language, {"google": target_language})
        tl = target_info["google"]

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://translate.googleapis.com/translate_a/single",
                params={
                    "client": "gtx",
                    "sl": source_language,
                    "tl": tl,
                    "dt": "t",
                    "q": text
                }
            )
            response.raise_for_status()
            data = response.json()

            # Google'ın cevap formatı: [[[çeviri, orijinal, ...], ...], ...]
            translated_parts = []
            for item in data[0]:
                if item[0]:
                    translated_parts.append(item[0])
            translated = "".join(translated_parts)

            logger.info(f"🌐 Google [{source_language}→{target_language.upper()}]: {translated[:60]}...")
            return {
                "translated": translated,
                "source_language": source_language,
                "provider": "google"
            }
