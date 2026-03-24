#!/usr/bin/env bash
# Telegram → Claude köprüsü
# Telegram'dan gelen mesajları Claude'a iletir
# Kullanım: ./telegram_bridge.sh (ayrı tmux penceresinde çalışır)

set -euo pipefail

PROJ="/mnt/c/Users/Lenovo/OneDrive - MAGIS TEKNOLOJI ANONIM SIRKETI/Masaüstü/app-dev-devops"
cd "$PROJ"

# .env yükle
export $(grep -v '^#' .env | xargs)

SESSION="videocheviri-claude"
API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
AUTHORIZED_CHAT="${TELEGRAM_CHAT_ID}"
OFFSET_FILE="/tmp/tg_offset_videocheviri"
LAST_OFFSET=$(cat "$OFFSET_FILE" 2>/dev/null || echo "0")

echo "🌉 Telegram köprüsü başladı"
echo "📱 Yetkili chat: $AUTHORIZED_CHAT"
echo "🎯 Claude session: $SESSION"
echo ""
echo "Komutlar:"
echo "  /durum   → ./status.sh çıktısını gönder"
echo "  /log     → son 20 aktiviteyi gönder"
echo "  /versiyon → mevcut versiyon"
echo "  /durdur  → Claude'u durdur"
echo "  Diğer her mesaj → Claude'a iletilir"
echo ""

send_telegram() {
    local msg="$1"
    curl -s -X POST "$API/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\": \"$AUTHORIZED_CHAT\", \"text\": \"$msg\", \"parse_mode\": \"Markdown\"}" \
        > /dev/null 2>&1 || true
}

send_to_claude() {
    local msg="$1"
    if tmux has-session -t "$SESSION" 2>/dev/null; then
        tmux send-keys -t "$SESSION" "$msg" Enter
        echo "✅ Claude'a iletildi: $msg"
    else
        send_telegram "⚠️ Claude session çalışmıyor. start.sh ile başlatın."
    fi
}

while true; do
    # Telegram'dan yeni mesajları al
    RESPONSE=$(curl -s "$API/getUpdates?offset=$LAST_OFFSET&timeout=20&allowed_updates=message" 2>/dev/null || echo '{"ok":false}')

    OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok','false'))" 2>/dev/null || echo "false")

    if [ "$OK" != "True" ]; then
        sleep 5
        continue
    fi

    # Her mesajı işle
    COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('result',[])))" 2>/dev/null || echo "0")

    if [ "$COUNT" -gt "0" ]; then
        echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for update in data.get('result', []):
    uid = update.get('update_id', 0)
    msg = update.get('message', {})
    chat_id = str(msg.get('chat', {}).get('id', ''))
    text = msg.get('text', '').strip()
    print(f'{uid}|||{chat_id}|||{text}')
" 2>/dev/null | while IFS='|||' read -r uid chat_id text; do
            # Offset güncelle
            echo $((uid + 1)) > "$OFFSET_FILE"
            LAST_OFFSET=$((uid + 1))

            # Sadece yetkili kullanıcıdan gelen mesajları işle
            if [ "$chat_id" != "$AUTHORIZED_CHAT" ]; then
                continue
            fi

            echo "📨 Telegram: $text"

            # Özel komutlar
            case "$text" in
                /durum|/status)
                    STATUS=$(bash "$PROJ/status.sh" 2>/dev/null | tail -30 | sed 's/\x1B\[[0-9;]*m//g')
                    send_telegram "📊 *Durum:*\n\`\`\`\n${STATUS:0:3000}\n\`\`\`"
                    ;;
                /log)
                    LOG=$(tail -20 "$PROJ/.claude/logs/activity.log" 2>/dev/null || echo "Log yok")
                    send_telegram "📜 *Son Aktivite:*\n\`\`\`\n$LOG\n\`\`\`"
                    ;;
                /versiyon)
                    VER=$(cat "$PROJ/VERSION" 2>/dev/null || echo "?")
                    send_telegram "📦 Versiyon: \`$VER\`"
                    ;;
                /durdur)
                    send_telegram "🛑 Claude durduruluyor..."
                    tmux kill-session -t "$SESSION" 2>/dev/null || true
                    send_telegram "✅ Claude durduruldu."
                    ;;
                /gorevler)
                    TODOS=$(grep '^\- \[ \]' "$PROJ/TODO.md" 2>/dev/null | head -5)
                    send_telegram "📋 *Bekleyen Görevler:*\n$TODOS"
                    ;;
                /yardim)
                    send_telegram "📖 *Komutlar:*\n/durum → proje durumu\n/log → son aktivite\n/versiyon → mevcut versiyon\n/gorevler → bekleyen görevler\n/durdur → Claude'u durdur\n\nDiğer mesajlar Claude'a iletilir."
                    ;;
                *)
                    # Normal mesajı Claude'a ilet
                    send_to_claude "$text"
                    send_telegram "✅ Claude'a iletildi:\n_$text_"
                    ;;
            esac
        done
    fi

    # Offset güncelle
    NEW_OFFSET=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('result', [])
if results:
    print(results[-1]['update_id'] + 1)
else:
    import os; print(os.environ.get('LAST_OFFSET', '0'))
" 2>/dev/null || echo "$LAST_OFFSET")

    if [ "$NEW_OFFSET" != "$LAST_OFFSET" ]; then
        LAST_OFFSET="$NEW_OFFSET"
        echo "$LAST_OFFSET" > "$OFFSET_FILE"
    fi

done
