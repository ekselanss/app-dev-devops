# 🎬 VideoÇeviri — Gerçek Zamanlı Video Alt Yazı Çevirisi

YouTube, TikTok, Instagram, X gibi uygulamalarda oynayan videoları **Türkçeye gerçek zamanlı** çeviren Android uygulaması.

## Mimari

```
Telefon Hoparlörü
       ↓
  Mikrofon (AudioRecord)
       ↓
  React Native App
       ↓ WebSocket (PCM base64)
  FastAPI Backend (PC)
       ↓
  Whisper small (CPU int8)
       ↓
  Google Translate
       ↓
  Türkçe Altyazı Overlay
```

## Klasör Yapısı

```
app-deneme/
├── VideoTranslatorApp/          # React Native (Android)
│   ├── src/
│   │   ├── screens/             # TranslatorScreen.tsx
│   │   ├── hooks/               # useAudioRecorder.ts
│   │   ├── services/            # WebSocketService.ts
│   │   └── components/          # TranslationOverlay, ConnectionStatusBar
│   └── android/
│       └── app/src/main/java/com/videotranslatorapp/
│           ├── SystemAudioModule.java     # AudioPlaybackCapture
│           ├── OverlayModule.java         # Floating subtitle overlay
│           ├── ForegroundServiceModule.java
│           └── AudioForegroundService.java
│
├── translation-backend/         # Python FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/websocket.py
│   │   └── services/
│   │       ├── whisper_service.py
│   │       └── translation_service.py
│   └── requirements.txt
│
└── baslat.ps1                   # Tek tıkla başlatma scripti
```

## Gereksinimler

### Backend (PC)
- Python 3.11+
- faster-whisper
- FastAPI + uvicorn

### Mobil (Android)
- Android 10+ (API 29+)
- React Native 0.76+
- USB Debug açık

## Kurulum

### 1. Backend

```bash
cd translation-backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. ADB Reverse

```bash
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

### 3. React Native

```bash
cd VideoTranslatorApp
npm install
npx react-native start
# Ayrı terminalde:
npx react-native run-android
```

### 4. Tek Komutla Başlatma (Windows)

```powershell
.\baslat.ps1
```

## Kullanım

1. Uygulamayı telefonda aç
2. **Başlat** butonuna bas
3. YouTube / TikTok / Instagram'da video aç, sesi aç
4. **Kulaklık takma** — hoparlörden çal
5. Türkçe altyazı ekranda görünür

## Whisper Model Kalitesi

| Model | Parametre | Türkçe WER | CPU Süresi |
|-------|-----------|-----------|-----------|
| tiny  | 39M       | ~%45      | ~1s       |
| base  | 74M       | ~%22      | ~2.5s     |
| small | 244M      | ~%12      | ~4s       |

Varsayılan: **small** (en iyi Türkçe doğruluğu)

## Bilinen Kısıtlamalar

- YouTube, TikTok, Instagram, Brave `ALLOW_CAPTURE_BY_NONE` ile sistem ses yakalamayı bloke eder → mikrofon modu kullanılır
- DRM'li içerikler (Spotify, Netflix) yakalanamaz
- iOS desteği yok (Mac + Xcode gerektirir)

## Lisans

MIT
