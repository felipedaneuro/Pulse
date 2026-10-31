#!/bin/bash
# Abre o Pulse em modo local: servidor apenas em 127.0.0.1 (só este computador).
# A porta é fixa de propósito: os dados ficam no navegador e dependem do endereço.
PORTA=8765
PASTA="$(cd "$(dirname "$0")" && pwd)/pulse/assets/app"
URL="http://127.0.0.1:$PORTA/"

if lsof -nP -iTCP:$PORTA -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Pulse já está em execução. Abrindo o painel..."
  open "$URL"
  exit 0
fi

echo "Pulse rodando em $URL (apenas neste computador)."
echo "Feche esta janela ou pressione Ctrl+C para encerrar."
(sleep 1 && open "$URL") &
exec python3 -m http.server $PORTA --bind 127.0.0.1 --directory "$PASTA"
