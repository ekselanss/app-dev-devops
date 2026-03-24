# VideoÇeviri — Otonom Geliştirici Talimatları

## Proje
Gerçek zamanlı video çeviri uygulaması (hobi projesi, İsmail için).
- React Native (Android) + FastAPI backend
- faster-whisper base/int8 + DeepL/Google Translate
- WebSocket audio pipeline (~2.9s latency, %90+ accuracy)

## Her Oturumun Başında Çalıştır
```bash
echo "=== DURUM ===" && cat VERSION && \
echo "=== SON 5 COMMIT ===" && git log --oneline -5 && \
echo "=== AKTİF BRANCH ===" && git branch --show-current && \
echo "=== BEKLEYEN GÖREVLER ===" && grep '^\- \[ \]' TODO.md | head -5
```

## Branch Stratejisi (ZORUNLU)

```
main          ← sadece stabil, test edilmiş kod (İsmail push eder)
  └── develop ← integration branch (feature'lar buraya merge olur)
        ├── feature/xxx     ← yeni özellik
        ├── fix/xxx         ← bug düzeltme
        ├── test/xxx        ← deneysel / developer test
        └── release/vX.Y.Z  ← release hazırlık
```

### Her geliştirme döngüsü:
```bash
# 1. develop'tan branch aç
git checkout develop
git checkout -b feature/ozellik-adi

# 2. Geliştir, test et, commit et
git add <dosyalar>
git commit -m "feat: açıklama"

# 3. Testler geçince develop'a merge et
git checkout develop
git merge feature/ozellik-adi --no-ff
git branch -d feature/ozellik-adi

# 4. VERSION + CHANGELOG güncelle
# 5. develop'ı push et (main'e İsmail push eder)
git push origin develop
```

### Branch İsimlendirme
- `feature/google-translate-fallback`
- `feature/silero-vad-threshold`
- `fix/websocket-timeout`
- `fix/audio-chunk-size`
- `test/latency-benchmark`
- `test/vad-accuracy`
- `release/v2.1.0`

## Semantic Versioning
- PATCH (2.1.X): bug fix, küçük iyileştirme → `fix/*` branch
- MINOR (2.X.0): yeni özellik → `feature/*` branch
- MAJOR (X.0.0): mimari değişim → `release/*` branch

## Her Versiyonda Zorunlu
1. `VERSION` dosyasını güncelle
2. `CHANGELOG.md`'ye en üste ekle
3. `RELEASE_NOTES/vX.Y.Z.md` oluştur
4. `git tag vX.Y.Z` at

## Test Pipeline
```bash
# Backend
cd translation-backend
python -m pytest tests/ -v

# Frontend lint
cd VideoTranslatorApp
npx eslint src/ --max-warnings 0

# E2E (Docker çalışıyorsa)
cd e2e-test && python e2e_latency_test.py
```

## Yasaklı
- `git push origin main` — İsmail manuel push eder
- `.env` dosyalarını değiştirme
- Test geçmeden develop'a merge etme
- Commit mesajı olmadan commit atmama

## Bilinen Kısıtlamalar (Öncelik Sırasıyla Çözülecek)
1. YouTube/TikTok sistem ses yakalama engelliyor (ALLOW_CAPTURE_BY_NONE)
2. Google Translate unofficial endpoint — rate-limit riski
3. DRM içerik erişilemiyor (Netflix, Spotify)
4. GPU yok, CPU-only
5. Uzun konuşmalarda (75-100s) latency 5-8s'e çıkıyor

## İletişim
- Türkçe düşün, commit mesajları İngilizce
- RELEASE_NOTES Türkçe yaz
- Teknik kararları `DECISIONS.md`'ye kaydet
- Tıkanırsan `BLOCKED.md`'ye yaz
