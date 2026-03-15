#!/usr/bin/env python3
"""
Whisper Model Benchmark — Tüm modelleri sırayla test et.
Her model için: başlat → yükle → yük testi → GPU ölç → durdur → sonraki model
"""
import json
import os
import signal
import subprocess
import sys
import time

MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
USER_STEPS = "1,10,50,100"
DURATION = 20  # saniye per step
BACKEND_DIR = "/workspace/app-dev-devops/translation-backend"
LOAD_TEST = "/workspace/load_test.py"
AUDIO = "/workspace/bbc_test_16k.wav"
WS_URL = "ws://localhost:8000/ws/translate"
RESULTS_FILE = "/workspace/model_benchmark_results.json"


def gpu_snapshot():
    """nvidia-smi ile GPU durumunu al."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,temperature.gpu,power.draw",
             "--format=csv,noheader,nounits"],
            text=True, timeout=5
        ).strip()
        parts = [x.strip() for x in out.split(",")]
        return {
            "gpu_util": int(parts[0]),
            "memory_mb": int(parts[1]),
            "temp_c": int(parts[2]),
            "power_w": float(parts[3]),
        }
    except Exception as e:
        return {"error": str(e)}


def kill_backend():
    """Mevcut backend'i durdur."""
    subprocess.run("pkill -f 'uvicorn app.main:app' || true", shell=True, timeout=10)
    time.sleep(3)
    # Tekrar kontrol
    subprocess.run("pkill -9 -f 'uvicorn app.main:app' || true", shell=True, timeout=5)
    time.sleep(2)


def start_backend(model_name):
    """Backend'i belirtilen model ile başlat."""
    env = os.environ.copy()
    env["WHISPER_MODEL"] = model_name
    log_file = f"/tmp/backend_{model_name}.log"

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
        env=env,
        stdout=open(log_file, "w"),
        stderr=subprocess.STDOUT,
    )
    return proc, log_file


def wait_for_health(timeout=120):
    """Health endpoint'in hazır olmasını bekle."""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.urlopen("http://localhost:8000/api/health", timeout=3)
            data = json.loads(req.read())
            if data.get("whisper_loaded"):
                return data
        except Exception:
            pass
        time.sleep(2)
    return None


def run_load_test(model_name):
    """Yük testini çalıştır ve çıktıyı parse et."""
    cmd = [
        sys.executable, LOAD_TEST,
        "--url", WS_URL,
        "--users", USER_STEPS,
        "--duration", str(DURATION),
        "--audio", AUDIO,
        "--skip-edge-cases",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        return result.stdout
    except subprocess.TimeoutExpired:
        return "TIMEOUT"
    except Exception as e:
        return f"ERROR: {e}"


def parse_load_output(output):
    """Load test çıktısından metrikleri parse et."""
    results = []
    for line in output.split("\n"):
        line = line.strip()
        # "     1 |    3.03s |    5.88s |    5.88s |      0 |    0.25/s |      9"
        if "|" in line and "Users" not in line and "---" not in line and "Running" not in line:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 7:
                try:
                    users = int(parts[0])
                    avg_lat = float(parts[1].replace("s", ""))
                    max_lat = float(parts[2].replace("s", ""))
                    p95_lat = float(parts[3].replace("s", ""))
                    errors = int(parts[4])
                    trans_s = float(parts[5].replace("/s", ""))
                    total = int(parts[6])
                    results.append({
                        "users": users,
                        "avg_latency": avg_lat,
                        "max_latency": max_lat,
                        "p95_latency": p95_lat,
                        "errors": errors,
                        "trans_per_sec": trans_s,
                        "total_translations": total,
                    })
                except (ValueError, IndexError):
                    continue
    return results


def main():
    print("=" * 80)
    print("  WHISPER MODEL BENCHMARK — TÜM MODELLER")
    print("=" * 80)
    print(f"  Modeller: {MODELS}")
    print(f"  Kullanıcılar: {USER_STEPS}")
    print(f"  Süre: {DURATION}s per step")
    print()

    all_results = {}

    for model in MODELS:
        print(f"\n{'='*80}")
        print(f"  MODEL: {model}")
        print(f"{'='*80}")

        # 1. Eski backend'i kapat
        print(f"  [{model}] Backend durduruluyor...")
        kill_backend()

        # 2. Yeni backend başlat
        print(f"  [{model}] Backend başlatılıyor (WHISPER_MODEL={model})...")
        proc, log_file = start_backend(model)

        # 3. Health check bekle
        print(f"  [{model}] Model yükleniyor (bu biraz sürebilir)...")
        health = wait_for_health(timeout=180)
        if not health:
            print(f"  [{model}] ❌ TIMEOUT — model yüklenemedi, atlanıyor")
            kill_backend()
            all_results[model] = {"error": "model_load_timeout"}
            continue

        print(f"  [{model}] ✅ Hazır — device={health.get('device')}, model={health.get('whisper_model')}")

        # 4. GPU baseline
        gpu_before = gpu_snapshot()
        print(f"  [{model}] GPU baseline: {gpu_before}")

        # 5. Yük testi
        print(f"  [{model}] Yük testi başlıyor ({USER_STEPS} users, {DURATION}s each)...")
        test_start = time.time()

        # GPU'yu test sırasında örnekle
        gpu_samples = []

        # Load testi ayrı thread'de çalıştır, GPU örneklemeyi burada yap
        import threading
        load_output = [None]

        def run_test():
            load_output[0] = run_load_test(model)

        test_thread = threading.Thread(target=run_test)
        test_thread.start()

        # Test sürerken GPU örnekle
        while test_thread.is_alive():
            gpu_samples.append(gpu_snapshot())
            time.sleep(3)

        test_thread.join()
        test_duration = time.time() - test_start

        # 6. Sonuçları parse et
        output = load_output[0]
        load_results = parse_load_output(output)

        # GPU istatistikleri
        gpu_utils = [s["gpu_util"] for s in gpu_samples if "gpu_util" in s]
        gpu_mems = [s["memory_mb"] for s in gpu_samples if "memory_mb" in s]
        gpu_temps = [s["temp_c"] for s in gpu_samples if "temp_c" in s]
        gpu_powers = [s["power_w"] for s in gpu_samples if "power_w" in s]

        model_result = {
            "health": health,
            "load_results": load_results,
            "test_duration_s": round(test_duration, 1),
            "gpu_stats": {
                "avg_util": round(sum(gpu_utils) / len(gpu_utils), 1) if gpu_utils else 0,
                "max_util": max(gpu_utils) if gpu_utils else 0,
                "avg_memory_mb": round(sum(gpu_mems) / len(gpu_mems), 1) if gpu_mems else 0,
                "max_memory_mb": max(gpu_mems) if gpu_mems else 0,
                "avg_temp_c": round(sum(gpu_temps) / len(gpu_temps), 1) if gpu_temps else 0,
                "max_temp_c": max(gpu_temps) if gpu_temps else 0,
                "avg_power_w": round(sum(gpu_powers) / len(gpu_powers), 1) if gpu_powers else 0,
                "max_power_w": max(gpu_powers) if gpu_powers else 0,
                "samples": len(gpu_samples),
            },
            "raw_output": output,
        }

        all_results[model] = model_result

        # Özet yazdır
        print(f"\n  [{model}] SONUÇLAR:")
        print(f"  {'Users':>5} | {'Avg Lat':>8} | {'P95 Lat':>8} | {'Errors':>6} | {'Trans/s':>8}")
        print(f"  {'-'*50}")
        for r in load_results:
            print(f"  {r['users']:>5} | {r['avg_latency']:>7.2f}s | {r['p95_latency']:>7.2f}s | {r['errors']:>6} | {r['trans_per_sec']:>7.2f}/s")
        print(f"  GPU avg: {model_result['gpu_stats']['avg_util']}%, max: {model_result['gpu_stats']['max_util']}%")
        print(f"  VRAM: {model_result['gpu_stats']['avg_memory_mb']}MB, Temp: {model_result['gpu_stats']['max_temp_c']}°C")

        # 7. Backend durdur
        print(f"  [{model}] Backend durduruluyor...")
        kill_backend()
        time.sleep(5)

    # === FINAL RAPOR ===
    print("\n\n")
    print("=" * 100)
    print("  FINAL RAPOR — TÜM MODELLER")
    print("=" * 100)

    # Başlık
    print(f"\n  {'Model':<10} | {'Users':>5} | {'Avg Lat':>8} | {'Max Lat':>8} | {'P95 Lat':>8} | {'Err':>4} | {'Trans/s':>8} | {'GPU%':>5} | {'VRAM':>6}")
    print(f"  {'-'*90}")

    for model in MODELS:
        res = all_results.get(model, {})
        if "error" in res:
            print(f"  {model:<10} | {'SKIPPED — ' + res['error']}")
            continue
        for r in res.get("load_results", []):
            gpu_avg = res["gpu_stats"]["avg_util"]
            vram = res["gpu_stats"]["avg_memory_mb"]
            print(f"  {model:<10} | {r['users']:>5} | {r['avg_latency']:>7.2f}s | {r['max_latency']:>7.2f}s | {r['p95_latency']:>7.2f}s | {r['errors']:>4} | {r['trans_per_sec']:>7.2f}/s | {gpu_avg:>4.0f}% | {vram:>5.0f}MB")

    # Özet karşılaştırma
    print(f"\n  MODEL ÖZET:")
    print(f"  {'Model':<10} | {'GPU Avg%':>8} | {'GPU Max%':>8} | {'VRAM MB':>8} | {'Max Temp':>8} | {'Max Power':>9}")
    print(f"  {'-'*65}")
    for model in MODELS:
        res = all_results.get(model, {})
        if "error" in res:
            continue
        gs = res["gpu_stats"]
        print(f"  {model:<10} | {gs['avg_util']:>7.1f}% | {gs['max_util']:>7.0f}% | {gs['avg_memory_mb']:>7.0f} | {gs['max_temp_c']:>6}°C | {gs['max_power_w']:>7.1f}W")

    # JSON kaydet
    with open(RESULTS_FILE, "w") as f:
        # raw_output çok büyük, çıkar
        clean = {}
        for model, res in all_results.items():
            clean[model] = {k: v for k, v in res.items() if k != "raw_output"}
        json.dump(clean, f, indent=2)
    print(f"\n  Detaylı rapor: {RESULTS_FILE}")
    print("=" * 100)


if __name__ == "__main__":
    main()
