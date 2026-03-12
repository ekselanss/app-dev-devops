#!/bin/bash
# ============================================================================
# VideoCheviri - Translation Benchmark Runner
# BBC News (EN) -> TR ceviri testi
# Backend'in calisiyor olmasi gerekir (run-macos.sh veya docker)
# ============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/translation-backend"
VENV_DIR="$BACKEND_DIR/.venv"
E2E_DIR="$SCRIPT_DIR/e2e-test"

# venv varsa aktif et
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
fi

# Gerekli paketler
pip install websocket-client yt-dlp -q 2>/dev/null

# Backend canlimi kontrol et
echo "Backend kontrol ediliyor..."
if ! curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "HATA: Backend calismiyor!"
    echo "Once baslat:"
    echo "  ./run-macos.sh      (macOS native)"
    echo "  docker compose up -d backend  (Docker)"
    exit 1
fi

HEALTH=$(curl -s http://localhost:8000/api/health)
echo "Backend: $HEALTH"
echo ""

# Mod secimi
echo "============================================"
echo "  Benchmark Modlari"
echo "============================================"
echo "  1) Normal mod (5s chunk) - daha iyi kalite"
echo "  2) Fast mod (2s chunk) - daha dusuk gecikme"
echo "  3) Her ikisi"
echo ""
read -p "Secim [1/2/3, varsayilan=1]: " MODE
MODE=${MODE:-1}

run_benchmark() {
    local url=$1
    local label=$2
    echo ""
    echo "============================================"
    echo "  $label"
    echo "============================================"
    cd "$E2E_DIR"
    PYTHONIOENCODING=utf-8 python translation_benchmark.py \
        --url "$url" \
        --max-seconds 120 \
        --chunk-seconds 1.0

    # Raporu kaydet
    if [ -f benchmark_report.json ]; then
        cp benchmark_report.json "benchmark_${label// /_}_$(date +%Y%m%d_%H%M%S).json"
    fi
}

case $MODE in
    1)
        run_benchmark "ws://localhost:8000/ws/translate" "Normal Mod (5s chunk)"
        ;;
    2)
        run_benchmark "ws://localhost:8000/ws/fast" "Fast Mod (2s chunk)"
        ;;
    3)
        run_benchmark "ws://localhost:8000/ws/translate" "Normal Mod (5s chunk)"
        echo ""
        echo "30 saniye bekleniyor (buffer temizligi)..."
        sleep 30
        run_benchmark "ws://localhost:8000/ws/fast" "Fast Mod (2s chunk)"
        ;;
    *)
        echo "Gecersiz secim"
        exit 1
        ;;
esac

echo ""
echo "============================================"
echo "  Benchmark tamamlandi!"
echo "  Raporlar: $E2E_DIR/"
echo "============================================"
