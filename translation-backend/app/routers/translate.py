"""
POST /api/translate  — sadece metin çevirisi (Accessibility Service / iOS Speech modu)
Whisper yok, düşük gecikme: ~200-500ms
"""
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TranslateRequest(BaseModel):
    text: str
    source_language: str = "auto"   # "en", "de", "fr", "auto" ...
    session_id: str = ""


class TranslateResponse(BaseModel):
    translated: str
    source_language: str
    provider: str


@router.post("/translate", response_model=TranslateResponse)
async def translate_text(body: TranslateRequest, request: Request):
    """
    Accessibility Service veya iOS SFSpeechRecognizer'dan gelen metni çevirir.
    WebSocket + Whisper pipeline'ına gerek yok, gecikme <500ms.
    """
    if not body.text.strip():
        raise HTTPException(400, "Metin boş olamaz")

    translator = request.app.state.translator
    result = await translator.translate(body.text, body.source_language)

    return TranslateResponse(
        translated=result["translated"],
        source_language=result["source_language"],
        provider=result["provider"],
    )
