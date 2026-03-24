#!/usr/bin/env bash
# VideoÇeviri — Anlık Durum Raporu
# Kullanım: ./status.sh

PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJ"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   VideoÇeviri — Proje Durumu         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"

echo -e "\n${YELLOW}📦 Versiyon:${NC}"
cat VERSION 2>/dev/null || echo "VERSION dosyası yok"

echo -e "\n${YELLOW}🌿 Aktif Branch:${NC}"
git branch --show-current

echo -e "\n${YELLOW}📋 Tüm Branch'ler:${NC}"
git branch -a | grep -v 'HEAD'

echo -e "\n${YELLOW}🕐 Son 5 Commit:${NC}"
git log --oneline -5

echo -e "\n${YELLOW}⏳ Bekleyen Görevler:${NC}"
grep '^\- \[ \]' TODO.md 2>/dev/null | head -5 || echo "TODO.md yok"

echo -e "\n${YELLOW}✅ Tamamlananlar:${NC}"
grep '^\- \[x\]' TODO.md 2>/dev/null | head -5 || echo "Henüz tamamlanan yok"

echo -e "\n${YELLOW}📜 Son Aktivite (.claude/live.log):${NC}"
tail -20 .claude/live.log 2>/dev/null || echo "Henüz log yok (Claude çalışmadı)"

echo -e "\n${YELLOW}🧪 Son Test Sonucu:${NC}"
cat e2e-test/last_result.txt 2>/dev/null | tail -10 || echo "E2E test sonucu yok"

echo -e "\n${BLUE}════════════════════════════════════════${NC}"
echo -e "Canlı log için: ${YELLOW}tail -f .claude/live.log${NC}"
