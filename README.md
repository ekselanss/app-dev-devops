# VideoÇeviri — Gerçek Zamanlı Video Çeviri Sistemi

YouTube, TikTok, Instagram, TRT World gibi uygulamalarda oynayan videoları **Türkçeye gerçek zamanlı** çeviren mobil uygulama + backend sistemi.

**E2E Latency: ~2.9 saniye | Phantom: 0 | Doğruluk: %90+**

## Mimari

```
📱 Telefon Hoparlörü
       ↓
  🎤 Mikrofon (AudioRecord 16kHz mono)
       ↓
  📱 React Native App
       ↓ WebSocket (3s PCM chunk, base64)
  🐳 FastAPI Backend (Docker)
       ↓
  🤖 faster-whisper base (CPU int8, 6 thread)
       ↓
  🌍 DeepL / Google Translate
       ↓ WebSocket yanıt
  📱 Floating Overlay → Türkçe Altyazı
```

## Veri Akışı

```
Kullanıcı "BAŞLAT" → Mikrofon kaydı başlar
    ↓ 3s PCM chunk (~96KB, base64)
WebSocket /ws/translate/{session_id}
    ↓ buffer biriktirilir + 1s overlap
WhisperService.transcribe()  (~1s)
    ↓ dil kilidi + halüsinasyon filtresi + VAD
TranslationService.translate()  (~0.5s)
    ↓ DeepL (birincil) veya Google (yedek)
WebSocket yanıt → OverlayService günceller
    ↓
Kullanıcı Türkçe çeviriyi floating overlay'de görür
```

**Latency Dağılımı:** ~1s buffer avg + ~1s Whisper + ~0.5s translate + ~0.4s network = **~2.9s**

## Klasör Yapısı

```
app-dev-devops/
├── VideoTranslatorApp/              # React Native (Android + iOS)
│   ├── src/
│   │   ├── screens/
│   │   │   └── TranslatorScreen.tsx     # Ana ekran: mod seçimi, kayıt, çeviri
│   │   ├── services/
│   │   │   ├── WebSocketService.ts      # WS bağlantısı, auto-reconnect
│   │   │   └── CaptionBridgeService.ts  # Platform soyutlama (iOS speech)
│   │   ├── components/
│   │   │   └── ConnectionStatusBar.tsx  # Bağlantı durumu göstergesi
│   │   └── hooks/
│   │       └── useAudioRecorder.ts      # Mikrofon kayıt hook'u
│   ├── android/
│   │   └── app/src/main/java/com/videotranslatorapp/
│   │       ├── MainApplication.kt       # Native modül kayıtları
│   │       ├── OverlayService.java      # Floating çeviri penceresi
│   │       ├── ForegroundServiceModule.java
│   │       └── AudioForegroundService.java
│   └── ios/
│       └── VideoTranslatorApp/
│           ├── SpeechModule.swift        # iOS SFSpeechRecognizer
│           └── Info.plist
│
├── translation-backend/              # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py                      # Uygulama başlatma, Whisper yükleme
│   │   ├── routers/
│   │   │   ├── websocket.py             # WS session yönetimi, ses işleme
│   │   │   ├── health.py               # GET /api/health
│   │   │   ├── translate.py            # POST /api/translate (metin bazlı)
│   │   │   └── benchmark.py            # Model karşılaştırma
│   │   └── services/
│   │       ├── whisper_service.py       # faster-whisper: ses→metin
│   │       └── translation_service.py   # DeepL + Google Translate
│   ├── Dockerfile
│   └── requirements.txt
│
├── e2e-test/                         # E2E Latency Test Otomasyonu
│   ├── run_test.sh                      # 8 adımlı ADB+Docker otomasyon
│   └── e2e_latency_test.py             # VTT phrase eşleştirme analizi
│
├── docker-compose.yml                # Backend + Nginx servisleri
├── nginx.conf                        # Reverse proxy (WS upgrade)
├── .github/workflows/ci.yml         # GitHub Actions CI/CD
├── BASLAT.bat                        # Windows tek tıkla başlatma
└── README.md
```

## Gereksinimler

### Backend
- Docker 24+ ve Docker Compose v2
- Veya: Python 3.11+, ffmpeg, libsndfile

### Mobil (Android)
- Android 10+ (API 29+)
- React Native 0.84+
- USB Debug açık
- Brave Browser (reklamsız video için önerilir)

### Mobil (iOS)
- iOS 15+
- Xcode 15+ (build için)
- SFSpeechRecognizer destekli cihaz

## Kurulum

### 1. Backend (Docker — Önerilen)

```bash
# Ortam değişkenleri
cp translation-backend/.env.example translation-backend/.env
# .env dosyasına DEEPL_API_KEY yaz (opsiyonel, yoksa Google Translate kullanılır)

# Başlat
docker compose up -d backend

# Sağlık kontrolü
curl http://localhost:8000/api/health
```

### 2. Backend (Manuel)

```bash
cd translation-backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. ADB Bağlantısı

```bash
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

### 4. React Native

```bash
cd VideoTranslatorApp
npm install
npx react-native start
# Ayrı terminalde:
npx react-native run-android
```

### 5. Tek Komutla (Windows)

```
BASLAT.bat
```

## Kullanım

1. Uygulamayı telefonda aç
2. **BAŞLAT** butonuna bas
3. YouTube / TikTok / TRT World'de video aç, sesi aç
4. **Kulaklık takma** — hoparlörden çal, telefonu hoparlöre yakın tut
5. Türkçe altyazı ekranda floating overlay olarak görünür

## Çalışma Modları

| Mod | Platform | Yöntem | Latency |
|-----|----------|--------|---------|
| **Whisper** | Android (birincil) | Mikrofon → WebSocket → Whisper → Translate | ~2.9s |
| **Speech** | iOS (birincil) | SFSpeechRecognizer → HTTP POST → Translate | ~0.5-1s |

**Android'de neden Whisper?** Android SpeechRecognizer, video ses çalmayla AudioFocus çakışması yaratıyor. Bu yüzden mikrofon + sunucu taraflı Whisper kullanılıyor.

## Whisper Konfigürasyonu

| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| Model | `base` (74M) | Hız/kalite dengesi |
| Compute | `int8` | CPU-optimize quantization |
| CPU Threads | 6 | Paralel işlem |
| Beam Size | 1 | Hızlı decode |
| VAD Filter | Açık | Sessizlik tespiti (threshold=0.5) |
| RMS Threshold | 0.02 | Sessiz ses filtresi |
| no_speech_threshold | 0.45 | Phantom engelleme |
| Dil Kilidi | `en` (başlangıç) | 3 ardışık farklı tespit ile değişir |
| Halüsinasyon Tespiti | Açık | Tekrar eden n-gram filtresi |

## API Endpoints

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/health` | GET | Sistem durumu, model bilgisi, aktif session sayısı |
| `/api/translate` | POST | Metin bazlı çeviri (iOS speech mode) |
| `/api/benchmark` | POST | Whisper model karşılaştırma |
| `/ws/translate/{session_id}` | WS | Ses akışı → çeviri (3s chunk) |
| `/ws/fast/{session_id}` | WS | Hızlı mod (1s chunk) |

### WebSocket Protokolü

```json
// İstemci → Sunucu
{"type": "audio_chunk", "data": "<base64 PCM>", "sample_rate": 16000}

// Sunucu → İstemci
{"type": "translation", "original": "Hello", "translated": "Merhaba",
 "detected_language": "en", "confidence": 0.95, "provider": "deepl"}
```

## E2E Test

BBC News videosuyla tam otomatik E2E latency testi. ADB ile telefonu kontrol eder, Docker loglarını toplar ve VTT transcript'iyle eşleştirme yapar.

```bash
# Gereksinimler: Docker backend çalışıyor + ADB bağlı Android cihaz + Brave browser
bash e2e-test/run_test.sh
```

**Test Adımları:**
1. Pre-flight kontrol (Docker healthy, ADB connected)
2. İzin verme (RECORD_AUDIO, SYSTEM_ALERT_WINDOW)
3. Tüm uygulamaları durdur
4. VideoTranslatorApp başlat + BAŞLAT butonu tap
5. BBC videoyu Brave'de aç + play
6. Ses max yap
7. 120 saniye log toplama
8. VTT phrase eşleştirme analizi

**Son Test Sonuçları:**

| Metrik | Değer |
|--------|-------|
| Ortalama E2E | **2.87s** |
| Min E2E | 0.54s |
| Max E2E | 7.54s |
| Phrase Eşleşme | 46/51 (%90) |
| Phantom | **0** |

## DevOps

### Docker Compose

```bash
docker compose up -d backend              # Sadece backend
docker compose --profile with-nginx up     # Nginx ile
docker compose down                        # Durdur
```

**Kaynak Limitleri:** 6 CPU, 4GB RAM | **Timezone:** Europe/Istanbul

### CI/CD (GitHub Actions)

| Job | Tetikleyici | Açıklama |
|-----|------------|----------|
| `test-backend` | Her push/PR | Python import smoke test + pytest |
| `build-docker` | main push | Docker build → Docker Hub push |
| `lint-mobile` | Her push/PR | ESLint TypeScript kontrolü |

**Docker Hub:** `ekselanss/videocheviri-backend:latest`

### Kubernetes

```bash
kubectl apply -f kubernetes/              # Tüm kaynakları uygula
kubectl get all -n videocheviri           # Durum kontrolü
kubectl port-forward svc/videocheviri-backend 8000:8000 -n videocheviri
```

Detaylı Kubernetes ve DevOps kurulumu için: [README-devops.md](README-devops.md)

## Bilinen Kısıtlamalar

- YouTube, TikTok, Instagram `ALLOW_CAPTURE_BY_NONE` ile sistem ses yakalamayı bloke eder — mikrofon modu kullanılır
- DRM'li içerikler (Spotify, Netflix) yakalanamaz — Android kısıtlaması
- Android SpeechRecognizer devre dışı — AudioFocus çakışması nedeniyle
- GPU desteği yok (CPU-only deployment, GPU eklenmesi planlanıyor)
- Google Translate yedek endpoint'i unofficial (rate-limit riski)
- Whisper 75-100s sonrası yoğun konuşmada latency 5-8s'e çıkabiliyor

## Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| Mobil | React Native 0.84, TypeScript |
| Android Native | Java/Kotlin (Overlay, ForegroundService) |
| iOS Native | Swift (SFSpeechRecognizer) |
| Backend | FastAPI 0.135, Python 3.11 |
| STT | faster-whisper 1.2 (int8, CPU) |
| Çeviri | DeepL API + Google Translate |
| Container | Docker, docker-compose |
| Orchestration | Kubernetes |
| CI/CD | GitHub Actions |
| Proxy | Nginx 1.25 |
| Test | ADB otomasyon + VTT eşleştirme |

## Lisans

MIT
