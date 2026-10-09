#!/usr/bin/env bash
# Copia o protótipo (prototipo-plantoes/index.html) para site/demo/,
# acrescentando o cabeçalho HTML que a página precisa fora do Claude.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$raiz/site/demo"
{
  printf '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<link rel="icon" href="../favicon.svg" type="image/svg+xml">\n'
  printf '<style>[hidden]{display:none!important}body{margin:0}</style>\n'
  cat "$raiz/prototipo-plantoes/index.html"
  printf '\n</html>\n'
} > "$raiz/site/demo/index.html"
echo "site/demo/index.html atualizado"
