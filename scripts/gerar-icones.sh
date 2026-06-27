#!/usr/bin/env bash
#
# Rasteriza icons/icon.svg nos tamanhos PNG exigidos pelo Chrome (o Chrome não
# renderiza SVG no manifest; ver ia/27-suporte-chrome.md). O Firefox segue usando
# o SVG; só o manifest.chrome.json aponta para estes PNGs.
#
# Uso: ./scripts/gerar-icones.sh
# Saída: icons/icon-16.png, icon-32.png, icon-48.png, icon-128.png
#
# Usa a primeira ferramenta disponível, nesta ordem:
#   rsvg-convert  →  inkscape  →  magick/convert (ImageMagick)  →  Chrome headless

set -euo pipefail
cd "$(dirname "$0")/.."

SRC="icons/icon.svg"
SIZES=(16 32 48 128)

[ -f "$SRC" ] || { echo "Erro: $SRC não encontrado" >&2; exit 1; }

renderizar() { # $1=tamanho  $2=saida
  local n="$1" out="$2"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$n" -h "$n" "$SRC" -o "$out"
  elif command -v inkscape >/dev/null 2>&1; then
    inkscape "$SRC" --export-type=png --export-filename="$out" -w "$n" -h "$n" >/dev/null 2>&1
  elif command -v magick >/dev/null 2>&1; then
    magick -background none -density 384 "$SRC" -resize "${n}x${n}" "$out"
  elif command -v convert >/dev/null 2>&1; then
    convert -background none -density 384 "$SRC" -resize "${n}x${n}" "$out"
  else
    renderizar_chrome "$n" "$out"
  fi
}

# Fallback: Chrome/Chromium headless. Embrulha o SVG num HTML que o escala para n×n
# via CSS (o viewBox 0 0 128 128 é preservado, então o conteúdo reduz inteiro) e tira
# um screenshot n×n com fundo transparente. NÃO mexemos nos width/height internos do
# SVG (rect/clipPath) — fazer isso encolheria o desenho para um canto.
renderizar_chrome() {
  local n="$1" out="$2" bin="" tmp
  for b in google-chrome chromium chromium-browser google-chrome-stable; do
    command -v "$b" >/dev/null 2>&1 && { bin="$b"; break; }
  done
  [ -n "$bin" ] || { echo "Erro: nenhuma ferramenta de rasterização encontrada (rsvg-convert/inkscape/imagemagick/chrome)" >&2; exit 1; }
  tmp="$(mktemp -d)"
  {
    printf '<!doctype html><meta charset="utf-8">'
    printf '<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:%dpx;height:%dpx}</style>' "$n" "$n"
    cat "$SRC"
  } > "$tmp/icon.html"
  "$bin" --headless=new --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 \
    --screenshot="$out" --window-size="$n,$n" "file://$tmp/icon.html" >/dev/null 2>&1
  rm -rf "$tmp"
}

for n in "${SIZES[@]}"; do
  out="icons/icon-${n}.png"
  renderizar "$n" "$out"
  echo "Gerado: $out"
done
