# Changelog

Tüm önemli değişiklikler bu dosyada takip edilir.
Format: [Semantic Versioning](https://semver.org) | Branch: her geliştirme kendi branch'inde yapılır.

---

## [Unreleased]

---

## [2.2.0] - 2026-03-24

### Added
- React Native UI: 5 tam ekran (Onboarding, Home, LiveTranslation, TokenShop, Profile)
- FastAPI backend: `/api/user`, `/api/sessions`, `/api/tokens` router'ları
- ApiService.ts: tüm endpoint'ler için typed singleton istemci
- UserStore.ts: AsyncStorage'a dayalı kalıcı kullanıcı ayarları
- GitHub Actions APK build pipeline (CI/CD)
- Cloudflare tunnel URL APK içine gömülü (DEFAULT_URL)
- GitHub Release otomasyonu (v0.1.1-debug APK)

### Tests
- `test_ui_backends.py` — 41 test, 41/41 geçti
- TestUserProfile (6), TestUserTokens (3), TestSessions (8), TestSessionStats (4), TestTokenPackages (5), TestTokenPurchase (6), TestTokenDeduct (6)

### Branch
- `feature/ui-screens` → `develop`

---

## [2.1.1] - 2026-03-24

### Fixed
- DeepL API başarısız olunca Google Translate'e otomatik geçiş yapılıyor
- Kullanıcı artık çeviri hatası görmüyor, fallback şeffaf çalışıyor
- Response'a `fallback: true` flag'i eklendi (debugging için)

### Branch
- `fix/google-translate-fallback` → `develop`

### Tests
- `test_translation_fallback.py` — 6 test, 6/6 geçti

---

## [2.1.0] - 2026-03-24

### Added
- Otonom geliştirici altyapısı kuruldu (CLAUDE.md, TODO.md, VERSION, CHANGELOG)
- Branch stratejisi tanımlandı: main / develop / feature/* / fix/* / test/* / release/*
- Global WebFetch izni ayarlandı (onay gerektirmez)
- Canlı log sistemi kuruldu (.claude/hooks/)
- status.sh: anlık proje durumu gösterici

### Infrastructure
- `develop` branch oluşturuldu (integration branch)
- `feature/infra-setup` branch üzerinde yapıldı

---

## [2.0.0] - 2026-03-15 (v2.0-current branch)

### Added
- Tier sistemi (ücretsiz/premium)
- Hallüsinasyon filtresi
- Admin panel
- Overlay'de dil bayrağı gösterimi
- GPU auto-detect (cuda_types kontrolü)
- Silero VAD pre-filter + dinamik chunk boyutu

### Changed
- Whisper small model'dan base model'e geçildi
- CPU thread sayısı 2→6, beam_size=1

### Fixed
- GPU auto-detect: cuda_types set kontrolü düzeltildi

---

## [1.8.0] - 2026-03-14 (v1.8-cloudflare branch)

### Added
- Cloudflare Tunnel entegrasyonu
- Dinamik sunucu URL desteği
- Release APK desteği

---

## [1.7.0] - 2026-03-10 (v1.7-docs branch)

### Added
- DevOps dokümantasyonu (README-devops.md)
- Kubernetes deployment manifests
- Docker Compose ile 6 CPU / 4GB RAM limitleri
- GitHub Actions CI/CD pipeline

---

## [1.6.0] - 2026-03-09 (v1.6-e2e-testing branch)

### Added
- E2E latency test otomasyonu (ADB üzerinden)
- E2E test sonuçları: ~2.87s ortalama, %90+ doğruluk, 0 phantom output

---

## [1.5.0] - 2026-03-08 (v1.5-performance branch)

### Changed
- Whisper small→base model (74M, int8 quantization)
- CPU 2→6 core, cpu_threads=6, beam_size=1
- Hallüsinasyon düzeltmesi

---

## [1.1.0] - 2026-03-01 (v1.1-devops branch, tag: v1.1.0)

### Added
- DevOps altyapısı başlatıldı

---

## [1.0.0] - 2026-02-28 (v1.0-initial branch)

### Added
- İlk sürüm: React Native + FastAPI + Whisper + WebSocket pipeline
