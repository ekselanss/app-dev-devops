# VideoÇeviri — Görev Listesi

Her oturumda en üstteki `[ ]` görevden başla. Bitince `[x]` yap ve CHANGELOG'a ekle.

---

## 🔥 Yüksek Öncelik

- [ ] **fix/google-translate-fallback** — DeepL başarısız olunca Google Translate'e otomatik geç (şu an hata fırlatıyor) → `fix/google-translate-fallback` branch
- [ ] **test/latency-benchmark** — chunk boyutu 1s vs 3s karşılaştırması, sonucu kaydet → `test/latency-benchmark` branch
- [ ] **feature/silero-vad-threshold** — VAD eşiğini 0.5'ten 0.4'e düşür, sessizlik tespiti iyileştir, test yaz → `feature/silero-vad-threshold` branch
- [ ] **feature/structured-logging** — Hata loglarını structured JSON formatına çevir (şu an düz string) → `feature/structured-logging` branch

## 🔵 Orta Öncelik

- [ ] **feature/yt-dlp-pipeline** — yt-dlp ile URL destekli video indirme pipeline'ını tamamla → `feature/yt-dlp-pipeline` branch
- [ ] **feature/font-size-settings** — Altyazı font boyutunu kullanıcı ayarlayabilsin (SharedPreferences) → `feature/font-size-settings` branch
- [ ] **feature/mediaprojection-fallback** — MediaProjection API hata durumunda graceful fallback ekle → `feature/mediaprojection-fallback` branch

## 🟡 Düşük Öncelik

- [ ] **feature/token-monetization** — Token tabanlı monetizasyon için backend endpoint'leri → `feature/token-monetization` branch
- [ ] **feature/iyzico-stub** — İyzico ödeme entegrasyonu stub → `feature/iyzico-stub` branch
- [ ] **docs/readme-screenshots** — README'ye ekran görüntüleri ekle (placeholder ile) → `docs/readme-screenshots` branch

---

## ✅ Tamamlananlar

- [x] **infra/setup** — Proje altyapısı kuruldu (CLAUDE.md, TODO.md, VERSION, CHANGELOG, branch stratejisi) — v2.1.0

---

## 📝 İsmail'in Notları

> Buraya istediğin özellikleri veya sorunları yaz, bir sonraki oturumda alırım.

<!-- Notlarını buraya ekle -->
