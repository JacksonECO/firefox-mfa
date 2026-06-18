# 01 — Setup da extensão base

## Objetivo

Criar a estrutura mínima de uma extensão Firefox (Manifest V3) capaz de ser carregada e
exibir um popup vazio, servindo de base para todas as próximas tasks.

## Por que / contexto

Sem essa base, nenhuma outra funcionalidade pode ser implementada ou testada manualmente no
navegador. É a fundação técnica do produto.

## Escopo

**Entra:**
- Estrutura de pastas do projeto.
- `manifest.json` em Manifest V3.
- Popup HTML/CSS/JS vazio (apenas um placeholder), carregável via `about:debugging`.
- Ícones básicos da extensão (pode ser um placeholder simples).
- Script de empacotamento (gerar `.zip` para instalação/teste).

**Não entra:**
- Qualquer lógica de negócio (criptografia, listagem, TOTP) — isso vem nas próximas tasks.

## Decisões técnicas

- Estrutura de pastas sugerida:
  ```
  /manifest.json
  /icons/
  /popup/
    popup.html
    popup.css
    popup.js
  /src/
    background.js   (service worker, usado a partir da task 02)
  ```
- `manifest.json`:
  - `manifest_version: 3`
  - `permissions`: começar só com `storage` (a permissão `activeTab` e
    `clipboardWrite` entram nas tasks 04 e 08, respectivamente, quando forem de fato usadas).
  - `action.default_popup`: `popup/popup.html`
  - `background.service_worker`: `src/background.js` (vazio por enquanto)
- Sem bundler/transpiler: JS puro carregado diretamente via `<script src="...">`/ES modules
  nativos do navegador.
- Adicionar um `README.md` na raiz explicando como carregar a extensão temporária no Firefox
  (`about:debugging#/runtime/this-firefox` → "Carregar extensão temporária" → selecionar
  `manifest.json`).

## Dependências

Nenhuma — é a primeira task.

## Critérios de aceite (teste manual)

1. Abrir `about:debugging` no Firefox, carregar a extensão pelo `manifest.json`.
2. A extensão aparece na barra de ferramentas sem erros no painel de debugging.
3. Clicar no ícone abre o popup (mesmo que vazio/placeholder).
4. Não há nenhum warning de permissão desnecessária no manifest.

## Testes automatizados

- Não aplicável nesta task (não há lógica de negócio ainda). Validar apenas que o
  `manifest.json` é JSON válido (pode ser um teste simples de parse, se houver pipeline de
  CI configurado).

## Riscos / pontos de atenção

- Já nesta task, pedir só as permissões estritamente necessárias para cada momento (evitar
  pedir `tabs`/`clipboardWrite` antes de serem realmente usadas) — manter o princípio de
  menor privilégio.
