#!/bin/sh
# Agenda o robô para rodar todo dia útil às 07:10 (cron). Rode uma vez: sh agendar-mac-linux.sh
PASTA="$(cd "$(dirname "$0")" && pwd)"
LINHA="10 7 * * 1-5 cd \"$PASTA\" && python3 robo.py >> robo.log 2>&1"
( crontab -l 2>/dev/null | grep -v "GabineteDigital\|robo.py" ; echo "# GabineteDigital"; echo "$LINHA" ) | crontab -
echo "Agendado: todo dia útil às 07:10. Log em $PASTA/robo.log"
