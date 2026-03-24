#!/usr/bin/env bash
# Anlık durum özeti — istediğinde çalıştır
# Kullanım: ./status.sh

# Renkler
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}    Subtitle App — Durum Raporu${NC}"
echo -e "${BOLD}    $(date '+%d %b %Y %H:%M')${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Versiyon
VERSION=$(cat VERSION 2>/dev/null || echo "bilinmiyor")
echo -e "${YELLOW}📦 MEVCUT VERSİYON: $VERSION${NC}"
echo ""

# Son commitler
echo -e "${CYAN}🔖 SON 5 COMMİT:${NC}"
git log --oneline -5 2>/dev/null | while read -r line; do
  echo -e "   ${GRAY}$line${NC}"
done
echo ""

# Bekleyen görevler
echo -e "${CYAN}📋 BEKLEYEN GÖREVLER:${NC}"
grep '^\- \[ \]' TODO.md 2>/dev/null | head -5 | while read -r line; do
  echo -e "   ${YELLOW}$line${NC}"
done
DONE_COUNT=$(grep -c '^\- \[x\]' TODO.md 2>/dev/null || echo 0)
TOTAL_COUNT=$(grep -c '^\- \[' TODO.md 2>/dev/null || echo 0)
echo -e "   ${GRAY}Tamamlanan: $DONE_COUNT / $TOTAL_COUNT${NC}"
echo ""

# Release notes
echo -e "${CYAN}📄 RELEASE NOTES:${NC}"
ls RELEASE_NOTES/*.md 2>/dev/null | sort -V | tail -5 | while read -r f; do
  echo -e "   ${GREEN}$(basename $f)${NC}"
done
echo ""

# Son aktivite
echo -e "${CYAN}⚡ SON 10 AKTİVİTE:${NC}"
if [ -f ".claude/logs/activity.log" ]; then
  tail -10 ".claude/logs/activity.log" | while read -r line; do
    echo -e "   ${GRAY}$line${NC}"
  done
else
  echo -e "   ${GRAY}Henüz aktivite yok${NC}"
fi
echo ""

# Test durumu
echo -e "${CYAN}🧪 SON TEST SONUCU:${NC}"
if [ -f ".claude/logs/tests.log" ]; then
  LAST_TEST=$(grep -E "passed|failed|error" ".claude/logs/tests.log" 2>/dev/null | tail -3)
  if [ -n "$LAST_TEST" ]; then
    echo "$LAST_TEST" | while read -r line; do
      if echo "$line" | grep -qiE "failed|error"; then
        echo -e "   ${RED}$line${NC}"
      else
        echo -e "   ${GREEN}$line${NC}"
      fi
    done
  else
    echo -e "   ${GRAY}Test logu var ama sonuç yok${NC}"
  fi
else
  echo -e "   ${GRAY}Henüz test çalışmadı${NC}"
fi
echo ""

# Claude çalışıyor mu?
echo -e "${CYAN}🤖 CLAUDE DURUMU:${NC}"
if tmux has-session -t subtitle-claude 2>/dev/null; then
  echo -e "   ${GREEN}✓ Çalışıyor (tmux: subtitle-claude)${NC}"
  echo -e "   ${GRAY}İzlemek için: tmux attach -t subtitle-claude${NC}"
else
  echo -e "   ${RED}✗ Çalışmıyor${NC}"
  echo -e "   ${GRAY}Başlatmak için: ./start.sh${NC}"
fi

# Tıkandı mı?
if [ -f "BLOCKED.md" ] && [ -s "BLOCKED.md" ]; then
  echo ""
  echo -e "${RED}⚠️  CLAUDE TIKANMIŞ — BLOCKED.md'ye bak!${NC}"
  cat BLOCKED.md
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
