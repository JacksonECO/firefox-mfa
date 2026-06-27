# 27 — Suporte ao Chrome (codebase único Firefox + Chrome)

## Objetivo

Fazer **a mesma extensão** rodar no **Chrome** (Manifest V3) além do Firefox, a partir de **um
único código** — sem manter dois projetos e sem introduzir build step nem dependências de
runtime. Entregar pronta para carregar no dev (Load unpacked) e empacotada para a **Chrome Web
Store**.

## Por que / contexto

O código já era ~99% portável: Web Crypto, `storage`, `alarms`, `tabs`, `scripting`, o
keep-alive por heartbeat e a troca de mensagens popup↔background são idênticos nos dois
navegadores. Dois plugins separados duplicariam manutenção sem ganho. As únicas divergências
reais são pontuais e isoláveis, então um codebase só é o caminho certo.

## Escopo

**Entra:**
- Shim de namespace `browser`/`chrome` (`src/navegador.js`), importado como primeiro import dos
  pontos de entrada (`background.js`, `popup.js`, `backup.js`).
- Segundo manifesto `manifest.chrome.json` (service worker + ícones PNG, sem
  `browser_specific_settings`). O `manifest.json` da raiz **continua sendo o do Firefox**.
- Ícones PNG (`icons/icon-{16,32,48,128}.png`) gerados de `icons/icon.svg` por
  `scripts/gerar-icones.sh` (o Chrome não renderiza SVG no manifest).
- Empacotador `scripts/empacotar.sh [firefox|chrome|ambos]` — **gera os dois por padrão**, com
  a versão do manifesto no nome do `.zip`; atalhos no `package.json`.

**Não entra:**
- Reescrita do keep-alive — a estratégia atual (heartbeat `getPlatformInfo` + porta do popup)
  funciona nos dois navegadores; só os comentários foram generalizados.
- `webextension-polyfill` — preterido para manter o princípio "sem libs além do TOTP". As APIs
  MV3 do Chrome já são Promise-based, então um alias `browser = chrome` basta.
- Conta/listagem da Chrome Web Store (assets de loja, screenshots) — fora do código.

## As três divergências (e como cada uma é resolvida)

1. **Namespace** — Firefox expõe `browser.*`; Chrome expõe `chrome.*`. O popup usa `browser.*`
   nu (viraria `ReferenceError` no Chrome) e o background usa `globalThis.browser?.` (viraria
   no-op silencioso). **Solução:** `src/navegador.js` faz
   `if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') globalThis.browser = globalThis.chrome;`
   No Firefox `browser` já existe (no-op); nos testes Node os mocks definem `browser` (no-op).
2. **Background** — Firefox MV3 usa `background.scripts` (event page); Chrome MV3 exige
   `background.service_worker`. **Solução:** cada manifesto declara o seu; o código do
   `background.js` é o mesmo (listeners registrados síncronos no topo, sem DOM/`window`).
3. **Ícones** — Chrome não aceita SVG no manifest. **Solução:** PNGs rasterizados do SVG;
   só o `manifest.chrome.json` aponta para eles. O Firefox segue com o SVG.

## Decisões técnicas

- `src/navegador.js`: alias idempotente, sem wrapping (Chrome MV3 já retorna Promises nas APIs
  usadas). Importado primeiro em cada entry point para existir antes de qualquer uso de `browser`.
- `manifest.chrome.json`: igual ao `manifest.json` exceto `background.service_worker`, `icons`/
  `action.default_icon` em PNG (16/32/48/128) e ausência de `browser_specific_settings`. CSP,
  permissões e `action` idênticos.
- `scripts/gerar-icones.sh`: usa a 1ª ferramenta disponível — `rsvg-convert` → `inkscape` →
  ImageMagick (`magick`/`convert`) → Chrome/Chromium headless (fallback: SVG temporário
  redimensionado + screenshot com fundo transparente).
- `scripts/empacotar.sh` (sem argumento) gera **ambos**; aceita `firefox`/`chrome` para um só.
  O alvo chrome monta `web-ext-artifacts/chrome-build/` com `manifest.chrome.json` renomeado
  para `manifest.json` (o Chrome exige na raiz do pacote) + `src popup icons`, e zipa em
  `chrome-mfa-<versao>.zip` (artefato da loja; a versão vem do manifesto). A pasta serve para
  "Load unpacked" no dev. Se os PNGs não existirem, o alvo chrome roda `gerar-icones.sh` antes.
- `web-ext-config.cjs`: ignora `manifest.chrome.json` no `web-ext lint` (Firefox).

## Segurança

Nenhuma regra do `CLAUDE.md` é tocada: o shim só aponta `browser` → `chrome`; toda a crypto
continua exclusivamente no background, nada sensível vai a disco/rede, e a CSP/permissões
mínimas são idênticas nos dois manifestos. O keep-alive expira a chave no mesmo tempo nos dois
navegadores (ambos suspendem o worker ~30s ociosos).

## Testes

- `tests/navegador.test.js`: (a) só `chrome` → cria alias; (b) `browser` já existe → não
  sobrescreve; (c) nenhum dos dois → não lança. Reavalia o módulo via query-string por cenário.
- Os 17 testes existentes não mudam (rodam em Node com `browser` mockado).

## Critérios de aceite (manuais)

- `node --test` e `npx web-ext lint` passam sem erros novos.
- Firefox (regressão): `npx web-ext run` — fluxo completo igual ao de antes.
- Chrome: `./scripts/empacotar.sh chrome` → `chrome://extensions` (Modo desenvolvedor) →
  "Carregar sem compactação" em `web-ext-artifacts/chrome-build/`. Criar senha mestra,
  cadastrar MFA, gerar/copiar código, autopreenchimento (páginas em `examples/`), expiração de
  sessão (~2 min com popup fechado), trocar senha mestra, backup export/import. Ícones visíveis.
- `web-ext-artifacts/chrome-mfa.zip` tem `manifest.json` (versão Chrome) na raiz.

## Arquivos

- **Novos:** `src/navegador.js`, `manifest.chrome.json`, `icons/icon-{16,32,48,128}.png`,
  `scripts/gerar-icones.sh`, `tests/navegador.test.js`, este doc.
- **Alterados:** `src/background.js`, `popup/popup.js`, `popup/backup.js` (1 import no topo);
  `scripts/empacotar.sh`, `package.json`, `web-ext-config.cjs`, `src/sessao.js` (comentários),
  `CLAUDE.md`, `README.md`.
