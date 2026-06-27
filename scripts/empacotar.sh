#!/usr/bin/env bash
#
# Empacota a extensão em .zip instaláveis/testáveis. Sem build step: apenas copia
# os arquivos de runtime. Gera os DOIS alvos por padrão (ver ia/27-suporte-chrome.md):
#
#   ./scripts/empacotar.sh            # ambos (firefox + chrome)
#   ./scripts/empacotar.sh firefox    # só Firefox  (manifest.json, event page, ícone SVG)
#   ./scripts/empacotar.sh chrome     # só Chrome   (manifest.chrome.json, service worker, PNGs)
#
# A versão da extensão (lida do manifesto) entra no nome do .zip. Saídas (ignoradas
# pelo .gitignore):
#   firefox → web-ext-artifacts/firefox-mfa-<versao>.zip
#   chrome  → web-ext-artifacts/chrome-build/         (pasta p/ "Load unpacked" no dev)
#             web-ext-artifacts/chrome-mfa-<versao>.zip (artefato p/ Chrome Web Store)

set -euo pipefail

# Garante execução a partir da raiz do projeto, independentemente do cwd.
cd "$(dirname "$0")/.."

OUT_DIR="web-ext-artifacts"
mkdir -p "$OUT_DIR"

# Extrai o campo "version" de um manifesto JSON (sem depender de jq).
versao_de() {
  grep -m1 '"version"' "$1" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

empacotar_firefox() {
  local versao out
  versao="$(versao_de manifest.json)"
  out="$OUT_DIR/firefox-mfa-${versao}.zip"
  rm -f "$out"
  # Inclui só o que roda na extensão; exclui docs (ia/), scripts e metalixo de SO.
  zip -r -FS "$out" \
    manifest.json \
    icons \
    popup \
    src \
    -x "*.DS_Store" "*/.DS_Store" >/dev/null
  echo "Pacote Firefox:               $out"
}

empacotar_chrome() {
  # O Chrome não renderiza SVG no manifest — garante os PNGs antes de empacotar.
  [ -f icons/icon-128.png ] || ./scripts/gerar-icones.sh
  # O Chrome exige manifest.json na raiz do pacote — montamos um staging dir com o
  # manifest.chrome.json renomeado.
  local versao stage out
  versao="$(versao_de manifest.chrome.json)"
  stage="$OUT_DIR/chrome-build"
  out="$OUT_DIR/chrome-mfa-${versao}.zip"
  rm -rf "$stage" "$out"
  mkdir -p "$stage"
  cp manifest.chrome.json "$stage/manifest.json"
  cp -r src popup icons "$stage/"
  find "$stage" -name '.DS_Store' -delete 2>/dev/null || true
  ( cd "$stage" && zip -r -FS "../$(basename "$out")" . -x "*.DS_Store" "*/.DS_Store" >/dev/null )
  echo "Pasta Chrome (Load unpacked): $stage"
  echo "Pacote Chrome Web Store:      $out"
}

ALVO="${1:-ambos}"
case "$ALVO" in
  firefox) empacotar_firefox ;;
  chrome)  empacotar_chrome ;;
  ambos)   empacotar_firefox; empacotar_chrome ;;
  *)
    echo "Alvo desconhecido: '$ALVO'. Use 'firefox', 'chrome' ou 'ambos' (padrão)." >&2
    exit 1
    ;;
esac
