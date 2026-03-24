#!/usr/bin/env bash
# VideoÇeviri — Otonom Claude Başlatıcı
# Kullanım: ./start.sh

set -euo pipefail

PROJ="/mnt/c/Users/Lenovo/OneDrive - MAGIS TEKNOLOJI ANONIM SIRKETI/Masaüstü/app-dev-devops"
SESSION="videocheviri-claude"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  VideoÇeviri — Otonom Mod      ${NC}"
echo -e "${BLUE}================================${NC}"

cd "$PROJ"

# .env yükle
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}✓ .env yüklendi (Telegram aktif)${NC}"
fi

VERSION=$(cat VERSION 2>/dev/null || echo "?")
echo -e "${YELLOW}📦 Versiyon: $VERSION${NC}"
echo -e "${YELLOW}📋 Sıradaki görevler:${NC}"
grep '^\- \[ \]' TODO.md | head -3 | sed 's/^/   /'

# Zaten çalışıyorsa
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Session zaten çalışıyor: $SESSION${NC}"
    echo -e "İzlemek: ${YELLOW}tmux attach -t $SESSION${NC}"
    exit 0
fi

echo -e "\n${GREEN}🚀 Claude otonom modda başlatılıyor...${NC}"

# tmux session oluştur
tmux new-session -d -s "$SESSION" -x 220 -y 50

# .env'yi tmux içine aktar
if [ -f ".env" ]; then
    while IFS='=' read -r key val; do
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        tmux send-keys -t "$SESSION" "export $key='$val'" Enter
    done < .env
fi

# Claude'u başlat — CLAUDE.md'yi okuyup TODO.md'den görev alır
tmux send-keys -t "$SESSION" "cd '$PROJ' && claude --dangerously-skip-permissions" Enter

# Telegram'a başlangıç bildirimi
sleep 3
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{
        \"chat_id\": \"${TELEGRAM_CHAT_ID}\",
        \"text\": \"🚀 *Claude başladı*\nVersiyon: \`$VERSION\`\nGörev: $(grep '^\- \[ \]' TODO.md | head -1 | sed 's/- \[ \] //')\",
        \"parse_mode\": \"Markdown\"
    }" > /dev/null 2>&1 || true

echo -e "${GREEN}✓ Claude çalışıyor!${NC}"
echo ""
echo -e "📺 İzlemek:  ${YELLOW}tmux attach -t $SESSION${NC}"
echo -e "📊 Durum:    ${YELLOW}./status.sh${NC}"
echo -e "👁️  Canlı:    ${YELLOW}./watch.sh${NC}"
echo -e "🛑 Durdurmak: ${YELLOW}tmux kill-session -t $SESSION${NC}"
