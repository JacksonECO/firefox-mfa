#!/usr/bin/env bash
#
# Empacota a extensão em um .zip instalável/testável no Firefox.
# Sem build step: apenas copia os arquivos de runtime para um .zip.
#
# Uso: ./scripts/empacotar.sh
# Saída: web-ext-artifacts/firefox-mfa.zip  (ignorado pelo .gitignore)

set -euo pipefail

# Garante execução a partir da raiz do projeto, independentemente do cwd.
cd "$(dirname "$0")/.."

OUT_DIR="web-ext-artifacts"
OUT="$OUT_DIR/firefox-mfa.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT"

# Inclui só o que roda na extensão; exclui docs (ia/), scripts e metalixo de SO.
zip -r -FS "$OUT" \
  manifest.json \
  icons \
  popup \
  src \
  -x "*.DS_Store" "*/.DS_Store"

echo "Pacote gerado: $OUT"
