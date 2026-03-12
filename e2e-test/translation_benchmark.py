"""
Translation Benchmark — VideoCheviri
BBC News (İngilizce) → Türkçe çeviri testi.

1. BBC haberinden ses indirir (yt-dlp + ffmpeg)
2. WebSocket ile backend'e 16kHz PCM chunk gönderir
3. Orijinal transkript + Türkçe çeviriyi toplar
4. Referans İngilizce metinle karşılaştırır (WER benzeri)
5. Zamanlama kaymasını ölçer

Kullanım:
  python translation_benchmark.py
  python translation_benchmark.py --url ws://localhost:8000/ws/fast
  python translation_benchmark.py --audio existing_file.wav
"""
import argparse
import base64
import json
import os
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path
from difflib import SequenceMatcher

try:
    import websocket
except ImportError:
    print("pip install websocket-client")
    sys.exit(1)

# ─── BBC News referans transkripti (İngilizce) ───
# Video: "2025 third hottest year on record" - BBC News
BBC_REFERENCE = {
    "video_id": "TlU6rNFFO6s",
    "title": "2025 third hottest year on record - BBC News",
    "language": "en",
    "segments": [
        (0.0,   5.0,  "Global temperatures in 2025 were slightly lower than 2024"),
        (5.0,  10.0,  "which makes it the third hottest year on record across the globe"),
        (10.0, 15.0,  "Met Office and European climate scientists also found"),
        (15.0, 20.0,  "it was the third year in a row in which temperatures reached more than 1.4 degrees"),
        (20.0, 25.0,  "above pre-industrial levels"),
        (25.0, 30.0,  "Dr Samantha Burgess deputy director of the Copernicus Climate Change Service"),
        (30.0, 35.0,  "told me what this all means the key findings from this year's report"),
        (35.0, 42.0,  "2025 is the third warmest year on record after 2024 and 2023"),
        (42.0, 50.0,  "the global temperature anomaly is 1.47 degrees above the pre-industrial average"),
        (50.0, 58.0,  "the human impact on the climate from burning fossil fuels"),
        (58.0, 67.0,  "three years above 1.5 degrees ten years on from the Paris agreement every nation committed"),
        (67.0, 75.0,  "to lower global warming below two degrees ideally below 1.5 degrees"),
        (75.0, 85.0,  "tackling climate change has it slowed down on trying to mitigate political rhetoric"),
        (85.0, 95.0,  "the science is unequivocal the evidence is incredibly clear eight independent datasets"),
        (95.0, 105.0, "all come out and said the same thing we know what to do"),
        (105.0,115.0, "there are success stories in the transition to renewable energy"),
        (115.0,130.0, "we just need to do more forest fire floods we know the extremes"),
        (130.0,145.0, "extreme events get worse more frequent and more intense"),
        (145.0,160.0, "no part of the world impacts people and natural ecosystems"),
        (160.0,175.0, "we need to limit global warming turn off the tap fossil fuel emissions"),
        (175.0,192.0, "and stabilized our climate"),
    ],
    # Referans Türkçe çeviri (beklenen çeviri)
    "expected_turkish": [
        "2025'te küresel sıcaklıklar 2024'ten biraz daha düşüktü",
        "bu onu dünya genelinde kaydedilen en sıcak üçüncü yıl yapıyor",
        "Met Ofisi ve Avrupalı iklim bilimciler de buldular",
        "sıcaklıkların üst üste üçüncü yılda 1.4 derecenin üzerine çıktığını",
        "sanayi öncesi seviyelerin üzerine",
        "Dr Samantha Burgess Copernicus İklim Değişikliği Servisi müdür yardımcısı",
        "bana bu yılki raporun temel bulgularının ne anlama geldiğini anlattı",
        "2025, 2024 ve 2023'ten sonra kaydedilen en sıcak üçüncü yıl",
        "küresel sıcaklık anomalisi sanayi öncesi ortalamanın 1.47 derece üzerinde",
        "fosil yakıt yakımından kaynaklanan iklim üzerindeki insan etkisi",
        "Paris anlaşmasından on yıl sonra 1.5 derecenin üzerinde üç yıl her ulus taahhüt etti",
        "küresel ısınmayı iki derecenin altına ideal olarak 1.5 derecenin altına düşürmek",
        "iklim değişikliğiyle mücadele azaltmaya çalışmayı yavaşlattı mı siyasi söylem",
        "bilim tartışılmaz kanıt inanılmaz derecede net sekiz bağımsız veri seti",
        "hepsi aynı şeyi söyledi ne yapmamız gerektiğini biliyoruz",
        "yenilenebilir enerjiye geçişte başarı hikayeleri var",
        "sadece daha fazlasını yapmamız gerekiyor orman yangını seller aşırılıkları biliyoruz",
        "aşırı olaylar daha kötü daha sık ve daha yoğun hale geliyor",
        "dünyanın hiçbir yerinde insanları ve doğal ekosistemleri etkilemiyor",
        "küresel ısınmayı sınırlamamız gerekiyor musluğu kapatın fosil yakıt emisyonları",
        "ve iklimimizi stabilize ettik",
    ],
}

# ─── Sonuç toplama ───
results = []       # [{time_sent, time_recv, original, translated, detected_lang, confidence, provider}]
ws_connected = threading.Event()
ws_done = threading.Event()
test_start_time = 0.0


def on_message(ws, message):
    recv_time = time.time()
    try:
        msg = json.loads(message)
    except json.JSONDecodeError:
        return

    msg_type = msg.get("type")

    if msg_type == "connected":
        ws_connected.set()
        print(f"  [WS] Bağlantı kuruldu: {msg.get('session_id')}")

    elif msg_type == "translation":
        elapsed = recv_time - test_start_time
        results.append({
            "time_recv": round(elapsed, 2),
            "original": msg.get("original", ""),
            "translated": msg.get("translated", ""),
            "detected_language": msg.get("detected_language", ""),
            "confidence": msg.get("confidence", 0),
            "provider": msg.get("provider", ""),
        })
        orig_short = msg.get("original", "")[:50]
        trans_short = msg.get("translated", "")[:50]
        print(f"  [{elapsed:6.1f}s] EN: {orig_short}")
        print(f"           TR: {trans_short}")

    elif msg_type == "processing":
        elapsed = recv_time - test_start_time
        print(f"  [{elapsed:6.1f}s] ⏳ İşleniyor...")

    elif msg_type == "empty":
        elapsed = recv_time - test_start_time
        print(f"  [{elapsed:6.1f}s] (boş segment)")

    elif msg_type == "ping":
        ws.send(json.dumps({"type": "pong"}))


def on_error(ws, error):
    print(f"  [WS HATA] {error}")


def on_close(ws, close_status_code, close_msg):
    print(f"  [WS] Bağlantı kapandı")
    ws_done.set()


def on_open(ws):
    pass


def download_bbc_audio(output_path: str, video_id: str = "TlU6rNFFO6s") -> str:
    """yt-dlp ile BBC videosunun sesini indir, 16kHz mono WAV'a çevir."""
    raw_path = output_path.replace(".wav", "_raw.wav")

    if os.path.exists(output_path):
        print(f"  Ses dosyası zaten var: {output_path}")
        return output_path

    print(f"  BBC videosu indiriliyor: {video_id}")
    subprocess.run([
        "yt-dlp",
        "-x", "--audio-format", "wav",
        "-o", raw_path,
        f"https://www.youtube.com/watch?v={video_id}",
    ], check=True)

    # 16kHz mono'ya dönüştür
    print("  16kHz mono PCM'e dönüştürülüyor...")
    subprocess.run([
        "ffmpeg", "-y", "-i", raw_path,
        "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
        output_path,
    ], check=True, capture_output=True)

    # Temizle
    if os.path.exists(raw_path):
        os.remove(raw_path)

    print(f"  Ses dosyası hazır: {output_path}")
    return output_path


def read_pcm_from_wav(wav_path: str) -> bytes:
    """WAV dosyasından ham PCM verisini oku."""
    with open(wav_path, "rb") as f:
        data = f.read()

    # WAV header'ı atla (44 byte standard, ama data chunk'ı bulalım)
    idx = data.find(b"data")
    if idx < 0:
        raise ValueError("WAV dosyasında 'data' chunk bulunamadı")
    data_size = struct.unpack_from("<I", data, idx + 4)[0]
    pcm_start = idx + 8
    return data[pcm_start:pcm_start + data_size]


def send_audio_chunks(ws, pcm_data: bytes, chunk_seconds: float = 1.0,
                      target_language: str = "tr"):
    """PCM verisini gerçek zamanlı olarak chunk'lar halinde gönder."""
    global test_start_time

    bytes_per_second = 16000 * 2  # 16kHz, 16-bit
    chunk_size = int(bytes_per_second * chunk_seconds)
    total_chunks = len(pcm_data) // chunk_size
    total_seconds = len(pcm_data) / bytes_per_second

    print(f"\n  Toplam ses: {total_seconds:.1f}s, {total_chunks} chunk ({chunk_seconds}s/chunk)")
    print(f"  Hedef dil: {target_language}")

    # Hedef dili ayarla
    ws.send(json.dumps({
        "type": "set_target_language",
        "language": target_language,
    }))

    test_start_time = time.time()
    offset = 0
    chunk_num = 0

    while offset < len(pcm_data):
        chunk = pcm_data[offset:offset + chunk_size]
        b64 = base64.b64encode(chunk).decode("ascii")

        ws.send(json.dumps({
            "type": "audio_chunk",
            "data": b64,
            "sample_rate": 16000,
            "target_language": target_language,
        }))

        offset += chunk_size
        chunk_num += 1
        elapsed = time.time() - test_start_time
        progress = min(100, offset * 100 // len(pcm_data))
        print(f"  📤 Chunk {chunk_num}/{total_chunks} gönderildi ({progress}%) [{elapsed:.1f}s]",
              end="\r")

        # Gerçek zamanlı simülasyon — chunk_seconds kadar bekle
        time.sleep(chunk_seconds)

    print(f"\n  Tüm ses gönderildi. Son chunk'ların işlenmesi bekleniyor...")
    # Son chunk'ların işlenmesi için bekle
    time.sleep(8)


def similarity(a: str, b: str) -> float:
    """İki metin arasındaki benzerlik oranı (0-1)."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def analyze_results():
    """Sonuçları analiz et: transkript doğruluğu, çeviri kalitesi, zamanlama."""
    ref = BBC_REFERENCE
    ref_segments = ref["segments"]
    ref_turkish = ref["expected_turkish"]

    print("\n" + "=" * 80)
    print("  📊 BENCHMARK SONUÇLARI")
    print("=" * 80)

    if not results:
        print("  ❌ Hiç çeviri sonucu alınamadı!")
        return

    # ─── 1. Transkript Doğruluğu ───
    print(f"\n  📝 TRANSKRIPT DOĞRULUĞU (Whisper → İngilizce)")
    print("-" * 80)

    all_original = " ".join(r["original"] for r in results)
    all_ref_english = " ".join(seg[2] for seg in ref_segments)
    overall_en_sim = similarity(all_original, all_ref_english)

    # Segment bazlı eşleştirme
    matched_segments = 0
    segment_scores = []

    for i, (start, end, ref_text) in enumerate(ref_segments):
        best_sim = 0
        best_match = ""
        for r in results:
            sim = similarity(ref_text, r["original"])
            if sim > best_sim:
                best_sim = sim
                best_match = r["original"]

        if best_sim > 0.3:
            matched_segments += 1
            segment_scores.append(best_sim)
            status = "✅" if best_sim > 0.6 else "⚠️" if best_sim > 0.4 else "❌"
            print(f"  {status} [{start:5.0f}-{end:5.0f}s] sim={best_sim:.0%}")
            print(f"     REF: {ref_text[:70]}")
            print(f"     GOT: {best_match[:70]}")

    print(f"\n  Eşleşen segment: {matched_segments}/{len(ref_segments)}")
    print(f"  Genel transkript benzerliği: {overall_en_sim:.0%}")
    if segment_scores:
        print(f"  Ortalama segment benzerliği: {sum(segment_scores)/len(segment_scores):.0%}")

    # ─── 2. Çeviri Kalitesi ───
    print(f"\n  🌐 ÇEVİRİ KALİTESİ (İngilizce → Türkçe)")
    print("-" * 80)

    all_translated = " ".join(r["translated"] for r in results)
    all_ref_turkish = " ".join(ref_turkish)
    overall_tr_sim = similarity(all_translated, all_ref_turkish)

    # Her çeviri sonucunu referans Türkçe ile karşılaştır
    translation_scores = []
    for r in results:
        best_sim = 0
        best_ref = ""
        for ref_tr in ref_turkish:
            sim = similarity(r["translated"], ref_tr)
            if sim > best_sim:
                best_sim = sim
                best_ref = ref_tr

        translation_scores.append(best_sim)
        if best_sim > 0.25:
            status = "✅" if best_sim > 0.5 else "⚠️" if best_sim > 0.3 else "❌"
            print(f"  {status} sim={best_sim:.0%} provider={r['provider']}")
            print(f"     EN:  {r['original'][:70]}")
            print(f"     TR:  {r['translated'][:70]}")
            print(f"     REF: {best_ref[:70]}")

    print(f"\n  Genel çeviri benzerliği: {overall_tr_sim:.0%}")
    if translation_scores:
        avg_tr = sum(translation_scores) / len(translation_scores)
        print(f"  Ortalama çeviri skoru: {avg_tr:.0%}")

    # ─── 3. Zamanlama Analizi ───
    print(f"\n  ⏱️  ZAMANLAMA ANALİZİ")
    print("-" * 80)

    if len(results) >= 2:
        # İlk ve son çeviri zamanı
        first_recv = results[0]["time_recv"]
        last_recv = results[-1]["time_recv"]

        # Chunk arası ortalama süre
        intervals = []
        for i in range(1, len(results)):
            intervals.append(results[i]["time_recv"] - results[i-1]["time_recv"])

        avg_interval = sum(intervals) / len(intervals) if intervals else 0

        print(f"  İlk çeviri: {first_recv:.1f}s'de geldi")
        print(f"  Son çeviri:  {last_recv:.1f}s'de geldi")
        print(f"  Toplam çeviri sayısı: {len(results)}")
        print(f"  Çeviri aralığı (ort): {avg_interval:.1f}s")

        # Zamanlama kayması: her segment'in beklenen zamanı vs gerçek zamanı
        print(f"\n  Zamanlama Kayması (beklenen vs gerçek):")
        timing_drifts = []
        for r in results:
            recv_t = r["time_recv"]
            # En yakın referans segmentini bul
            best_match_seg = None
            best_sim = 0
            for start, end, ref_text in ref_segments:
                sim = similarity(ref_text, r["original"])
                if sim > best_sim:
                    best_sim = sim
                    best_match_seg = (start, end, ref_text)

            if best_match_seg and best_sim > 0.3:
                expected_time = best_match_seg[0]
                drift = recv_t - expected_time
                timing_drifts.append(drift)
                drift_bar = "→" * min(20, max(0, int(abs(drift))))
                direction = "geç" if drift > 0 else "erken"
                print(f"    T+{expected_time:5.0f}s → alındı T+{recv_t:5.1f}s  "
                      f"kayma: {drift:+.1f}s ({direction}) {drift_bar}")

        if timing_drifts:
            avg_drift = sum(timing_drifts) / len(timing_drifts)
            min_drift = min(timing_drifts)
            max_drift = max(timing_drifts)
            print(f"\n  Ortalama kayma: {avg_drift:+.1f}s")
            print(f"  Min kayma:      {min_drift:+.1f}s")
            print(f"  Max kayma:      {max_drift:+.1f}s")

    # ─── 4. Dil Tespiti ───
    print(f"\n  🔤 DİL TESPİTİ")
    print("-" * 80)

    lang_counts = {}
    conf_values = []
    for r in results:
        lang = r["detected_language"]
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
        conf_values.append(r["confidence"])

    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        pct = count * 100 // len(results)
        print(f"  {lang}: {count} kez ({pct}%)")

    if conf_values:
        avg_conf = sum(conf_values) / len(conf_values)
        print(f"  Ortalama güven: {avg_conf:.0%}")

    # ─── 5. Özet ───
    print(f"\n  📋 ÖZET")
    print("=" * 80)
    print(f"  Toplam çeviri: {len(results)}")
    print(f"  Transkript doğruluğu: {overall_en_sim:.0%}")
    print(f"  Çeviri kalitesi: {overall_tr_sim:.0%}")
    if len(results) >= 2:
        print(f"  İlk çeviri gecikmesi: {results[0]['time_recv']:.1f}s")
        if timing_drifts:
            print(f"  Ortalama zamanlama kayması: {avg_drift:+.1f}s")
    print(f"  Provider: {results[0]['provider'] if results else 'N/A'}")

    # Genel not
    if overall_en_sim > 0.6 and overall_tr_sim > 0.4:
        print(f"\n  ✅ SONUÇ: İyi performans")
    elif overall_en_sim > 0.4 or overall_tr_sim > 0.25:
        print(f"\n  ⚠️  SONUÇ: Kabul edilebilir, iyileştirme gerekli")
    else:
        print(f"\n  ❌ SONUÇ: Düşük performans")

    # JSON rapor kaydet
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_translations": len(results),
        "transcript_similarity": round(overall_en_sim, 3),
        "translation_similarity": round(overall_tr_sim, 3),
        "first_translation_delay": round(results[0]["time_recv"], 2) if results else None,
        "avg_timing_drift": round(sum(timing_drifts) / len(timing_drifts), 2) if timing_drifts else None,
        "language_distribution": lang_counts,
        "results": results,
    }

    report_path = Path(__file__).parent / "benchmark_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n  Detaylı rapor: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="VideoCheviri Translation Benchmark")
    parser.add_argument("--url", default="ws://localhost:8000/ws/fast",
                        help="WebSocket URL (default: ws://localhost:8000/ws/fast)")
    parser.add_argument("--audio", default=None,
                        help="WAV dosyası yolu (yoksa BBC'den indirir)")
    parser.add_argument("--target-lang", default="tr",
                        help="Hedef dil kodu (default: tr)")
    parser.add_argument("--chunk-seconds", type=float, default=1.0,
                        help="Chunk süresi (saniye, default: 1.0)")
    parser.add_argument("--max-seconds", type=float, default=120.0,
                        help="Maksimum ses süresi (default: 120s)")
    parser.add_argument("--video-id", default="TlU6rNFFO6s",
                        help="YouTube video ID")
    args = parser.parse_args()

    print("=" * 80)
    print("  🎬 VideoCheviri Translation Benchmark")
    print("  BBC News (EN) → Türkçe çeviri testi")
    print("=" * 80)

    # 1. Ses dosyasını hazırla
    test_dir = Path(__file__).parent
    if args.audio:
        wav_path = args.audio
    else:
        wav_path = str(test_dir / "bbc_test_16k.wav")
        download_bbc_audio(wav_path, args.video_id)

    # 2. PCM verisini oku
    print("\n  PCM verisi okunuyor...")
    pcm_data = read_pcm_from_wav(wav_path)
    total_seconds = len(pcm_data) / (16000 * 2)
    print(f"  Toplam: {total_seconds:.1f}s ({len(pcm_data):,} bytes)")

    # Maksimum süreye kırp
    max_bytes = int(args.max_seconds * 16000 * 2)
    if len(pcm_data) > max_bytes:
        pcm_data = pcm_data[:max_bytes]
        print(f"  {args.max_seconds}s'ye kırpıldı ({len(pcm_data):,} bytes)")

    # 3. WebSocket bağlantısı
    session_id = f"benchmark_{int(time.time())}"
    ws_url = f"{args.url}/{session_id}"
    print(f"\n  WebSocket: {ws_url}")

    ws = websocket.WebSocketApp(
        ws_url,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
        on_open=on_open,
    )

    # WS thread'i başlat
    ws_thread = threading.Thread(target=ws.run_forever, daemon=True)
    ws_thread.start()

    # Bağlantıyı bekle
    print("  Bağlantı bekleniyor...")
    if not ws_connected.wait(timeout=10):
        print("  ❌ WebSocket bağlantısı kurulamadı!")
        sys.exit(1)

    # 4. Ses gönder
    print("\n  🎤 Ses gönderimi başlıyor...")
    send_audio_chunks(ws, pcm_data, args.chunk_seconds, args.target_lang)

    # 5. Analiz
    analyze_results()

    # Temizle
    ws.close()
    print("\n  Benchmark tamamlandı.")


if __name__ == "__main__":
    main()
