#!/bin/bash
# ============================================================================
# VideoCheviri - macOS Native Backend Runner
# Apple Silicon'da Whisper small modelini dogrudan calistirir
# ============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/translation-backend"
VENV_DIR="$BACKEND_DIR/.venv"

# Setup yapildi mi?
if [ ! -d "$VENV_DIR" ]; then
    echo "Hata: Once setup-macos.sh calistir!"
    echo "  ./setup-macos.sh"
    exit 1
fi

source "$VENV_DIR/bin/activate"

# .env dosyasini yukle
if [ -f "$BACKEND_DIR/.env" ]; then
    set -a
    source "$BACKEND_DIR/.env"
    set +a
fi

# Varsayilan degerler
export WHISPER_MODEL="${WHISPER_MODEL:-small}"
export CPU_THREADS="${CPU_THREADS:-0}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# CPU thread sayisini otomatik ayarla (0 = auto)
if [ "$CPU_THREADS" = "0" ]; then
    CPU_THREADS=$(sysctl -n hw.ncpu 2>/dev/null || echo 8)
    export CPU_THREADS
fi

echo "============================================"
echo "  VideoCheviri Backend"
echo "  Model: $WHISPER_MODEL"
echo "  CPU Threads: $CPU_THREADS"
echo "  Port: 8000"
echo "============================================"
echo ""
echo "Endpoints:"
echo "  Health:    http://localhost:8000/api/health"
echo "  WebSocket: ws://localhost:8000/ws/translate/{session_id}"
echo "  Fast WS:   ws://localhost:8000/ws/fast/{session_id}"
echo "  Translate: POST http://localhost:8000/api/translate"
echo ""
echo "Durdurmak icin: Ctrl+C"
echo "============================================"

cd "$BACKEND_DIR"
python -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level "$LOG_LEVEL"
