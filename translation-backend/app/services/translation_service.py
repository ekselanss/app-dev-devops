import os
import logging
import httpx
from typing import Optional
from collections import deque

logger = logging.getLogger(__name__)

# Türkçeye çevrilmesine gerek olmayan diller
SKIP_LANGUAGES = {"tr", "turkish"}

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

    async def translate(self, text: str, source_language: str) -> dict:
        """
        Metni Türkçeye çevir.
        
        Args:
            text: Çevrilecek metin
            source_language: Kaynak dil kodu (Whisper formatında, örn: "en")
            
        Returns:
            {
                "translated": "Türkçe metin...",
                "source_language": "en",
                "provider": "deepl"
            }
        """
        if not text or not text.strip():
            return {"translated": "", "source_language": source_language, "provider": "none"}

        # Zaten Türkçeyse çevirme
        if source_language.lower() in SKIP_LANGUAGES:
            return {"translated": text, "source_language": "tr", "provider": "none"}

        try:
            if self.deepl_api_key:
                result = await self._translate_deepl(text, source_language)
            else:
                result = await self._translate_google(text, source_language)

            # Bağlam tamponuna ekle
            self.context_buffer.append({
                "original": text,
                "translated": result["translated"]
            })

            return result

        except Exception as e:
            logger.error(f"Çeviri hatası: {e}")
            return {
                "translated": f"[Çeviri hatası: {str(e)}]",
                "source_language": source_language,
                "provider": "error"
            }

    async def _translate_deepl(self, text: str, source_language: str) -> dict:
        """DeepL API ile çeviri"""
        source_lang_deepl = LANGUAGE_MAP.get(source_language.lower(), source_language.upper())

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
                    "target_lang": "TR",
                    "formality": "default",
                    "tag_handling": "off"
                }
            )
            response.raise_for_status()
            data = response.json()
            translated = data["translations"][0]["text"]

            logger.info(f"🌐 DeepL [{source_language}→TR]: {translated[:60]}...")
            return {
                "translated": translated,
                "source_language": source_language,
                "provider": "deepl"
            }

    async def _translate_google(self, text: str, source_language: str) -> dict:
        """
        Google Translate (ücretsiz, resmi olmayan endpoint).
        Production'da Google Cloud Translation API kullan.
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://translate.googleapis.com/translate_a/single",
                params={
                    "client": "gtx",
                    "sl": source_language,
                    "tl": "tr",
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

            logger.info(f"🌐 Google [{source_language}→TR]: {translated[:60]}...")
            return {
                "translated": translated,
                "source_language": source_language,
                "provider": "google"
            }
