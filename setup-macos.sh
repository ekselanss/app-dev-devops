#!/bin/bash
# ============================================================================
# VideoCheviri - macOS Native Setup (Apple Silicon M1/M2/M3/M4)
# Docker kullanmadan dogrudan M4 CPU uzerinde calistir
# faster-whisper (CTranslate2) M4'un 10-core CPU'sunu tam kullanir
# ============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/translation-backend"
VENV_DIR="$BACKEND_DIR/.venv"
E2E_DIR="$SCRIPT_DIR/e2e-test"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  VideoCheviri - macOS Native Setup${NC}"
echo -e "${CYAN}  Apple Silicon optimized${NC}"
echo -e "${CYAN}============================================${NC}"

# ── 1. Python kontrolu ──
echo -e "\n${YELLOW}[1/6] Python kontrolu...${NC}"
if command -v python3 &>/dev/null; then
    PY=$(python3 --version)
    echo -e "${GREEN}  $PY${NC}"
else
    echo -e "${RED}  Python3 bulunamadi! Homebrew ile kur:${NC}"
    echo "  brew install python@3.11"
    exit 1
fi

# ── 2. ffmpeg kontrolu ──
echo -e "\n${YELLOW}[2/6] ffmpeg kontrolu...${NC}"
if command -v ffmpeg &>/dev/null; then
    echo -e "${GREEN}  ffmpeg mevcut${NC}"
else
    echo -e "${YELLOW}  ffmpeg kuruluyor...${NC}"
    brew install ffmpeg
fi

# ── 3. Virtual environment ──
echo -e "\n${YELLOW}[3/6] Python sanal ortami hazirlaniyor...${NC}"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    echo -e "${GREEN}  .venv olusturuldu${NC}"
else
    echo -e "${GREEN}  .venv zaten mevcut${NC}"
fi
source "$VENV_DIR/bin/activate"

# ── 4. Bagimliliklar ──
echo -e "\n${YELLOW}[4/6] Python paketleri kuruluyor...${NC}"
pip install --upgrade pip -q
pip install -r "$BACKEND_DIR/requirements.txt" -q
# Benchmark icin ek paketler
pip install websocket-client yt-dlp -q
echo -e "${GREEN}  Tum paketler kuruldu${NC}"

# ── 5. CPU bilgisi ──
echo -e "\n${YELLOW}[5/6] Sistem bilgisi...${NC}"
CPU_NAME=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")
CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo "?")
RAM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 ))
echo -e "${GREEN}  CPU: $CPU_NAME${NC}"
echo -e "${GREEN}  Cores: $CPU_CORES${NC}"
echo -e "${GREEN}  RAM: ${RAM_GB}GB${NC}"

# ── 6. .env dosyasi ──
echo -e "\n${YELLOW}[6/6] Ortam degiskenleri...${NC}"
ENV_FILE="$BACKEND_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'ENVEOF'
DEEPL_API_KEY=
LOG_LEVEL=info
WHISPER_MODEL=small
CPU_THREADS=0
WORKERS=1
TZ=Europe/Istanbul
ENVEOF
    echo -e "${GREEN}  .env olusturuldu (CPU_THREADS=0 = otomatik)${NC}"
else
    echo -e "${GREEN}  .env mevcut${NC}"
fi

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup tamamlandi!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "Kullanim:"
echo -e "  ${CYAN}# Backend'i baslat:${NC}"
echo -e "  ./run-macos.sh"
echo ""
echo -e "  ${CYAN}# Benchmark testi:${NC}"
echo -e "  ./run-benchmark.sh"
echo ""
echo -e "  ${CYAN}# Manuel baslat:${NC}"
echo -e "  cd translation-backend"
echo -e "  source .venv/bin/activate"
echo -e "  WHISPER_MODEL=small python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
