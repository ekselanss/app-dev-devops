#!/usr/bin/env bash
# Claude'u canlı izle — ayrı terminal'de çalıştır
# Kullanım: ./watch.sh

LOG_DIR=".claude/logs"
mkdir -p "$LOG_DIR"
touch "$LOG_DIR/live.log"

# Renkler
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m'

clear
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Subtitle App — Claude Canlı İzleme   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo -e "${GRAY}Çıkmak için: Ctrl+C${NC}"
echo ""

# Mevcut durum
VERSION=$(cat VERSION 2>/dev/null || echo "?")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "henüz commit yok")
echo -e "${YELLOW}📦 Versiyon: $VERSION${NC}"
echo -e "${YELLOW}🔖 Son commit: $LAST_COMMIT${NC}"
echo ""
echo -e "${GRAY}─────────────────────────────────────────${NC}"
echo -e "${CYAN}🔴 CANLI AKTİVİTE:${NC}"
echo ""

# Canlı log'u renkli göster
tail -f "$LOG_DIR/live.log" | while IFS= read -r line; do
  if echo "$line" | grep -q "pytest\|TEST"; then
    echo -e "${CYAN}$line${NC}"
  elif echo "$line" | grep -q "FAILED\|ERROR\|✗"; then
    echo -e "${RED}$line${NC}"
  elif echo "$line" | grep -q "passed\|✓\|commit"; then
    echo -e "${GREEN}$line${NC}"
  elif echo "$line" | grep -q "Write\|Edit"; then
    echo -e "${YELLOW}$line${NC}"
  elif echo "$line" | grep -q "WebFetch\|🌐"; then
    echo -e "${BLUE}$line${NC}"
  else
    echo -e "${GRAY}$line${NC}"
  fi
done
