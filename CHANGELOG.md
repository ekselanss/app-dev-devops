# Changelog

Tüm önemli değişiklikler bu dosyada takip edilir.
Format: [Semantic Versioning](https://semver.org) | Branch: her geliştirme kendi branch'inde yapılır.

---

## [Unreleased]

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
