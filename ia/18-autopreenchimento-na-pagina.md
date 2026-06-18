# 18 — Autopreenchimento do código na página

## Objetivo

Opcionalmente (opt-in nas configurações), quando o popup abre e há exatamente um MFA para o
domínio da aba, inserir o código de 6 dígitos diretamente no(s) campo(s) de código da página e
tentar confirmar com Enter — completando o login sem o usuário digitar nada.

## Por que / contexto

Fecha o fluxo de um passo iniciado na task 15 (autocópia): além de copiar, preenche. Funciona
com um único campo de OTP ou com o padrão de "um input por dígito" (caixas separadas). É
**opt-in** e configurável porque injeta conteúdo na página — uma ação mais sensível.

## Escopo

**Entra:**
- Seção de configurações: habilitar/desabilitar e um **seletor CSS** para o(s) campo(s) de
  código (padrão: `input[autocomplete="one-time-code"]`).
- Ao abrir o popup com 1 MFA do domínio e autofill habilitado: injeta o código na aba ativa
  via `browser.scripting.executeScript` (permissão `scripting` + `activeTab`).
- Suporte a um único input (preenche o código inteiro) e a múltiplos inputs (um dígito por
  campo); tenta disparar Enter ao final.

**Não entra:**
- Detecção automática de campos sem seletor configurado (heurísticas frágeis) — fica no padrão
  `one-time-code`, ajustável pelo usuário.
- Preenchimento quando há 0 ou 2+ MFAs do domínio (ambíguo).

## Decisões técnicas

- `src/autofill.js`: `SELETOR_OTP_PADRAO`, `AUTOFILL_PADRAO` (desligado) e
  `normalizarConfigAutofill`. Mensagens `GET_CONFIG` (passa a incluir `autofill`) e
  `SET_AUTOFILL`.
- A função injetada (`preencherCamposOtp`) é autocontida (sem closures/imports), roda no
  contexto isolado da página: seta `value` e dispara `input`/`change` (notifica frameworks),
  depois dispara `keydown/keypress/keyup` de Enter no último campo.
- **Só o código de 6 dígitos é injetado** — o segredo nunca toca a página. Usa `activeTab`
  (acesso concedido só na invocação do popup), sem host permission ampla.
- Nova permissão `scripting` adicionada ao manifest e à auditoria de hardening (task 12), com
  justificativa documentada (CLAUDE.md / README).

## Dependências

- Task 15 (gatilho de MFA único), task 07 (GET_CODE), task 16 (tela de configurações).

## Critérios de aceite (teste manual)

1. Com autofill habilitado e seletor correto, abrir o popup em um site com 1 MFA preenche o
   campo de código e tenta enviar.
2. Funciona tanto com um único `input` quanto com 6 inputs separados.
3. Desabilitado (padrão), nada é injetado na página.
4. Em páginas sem o campo / restritas (`about:`), falha em silêncio, sem quebrar o popup.

## Testes automatizados

- `normalizarConfigAutofill` (coerção/seletor padrão) e `GET_CONFIG`/`SET_AUTOFILL` no
  background (exigem desbloqueio; persistência).
- A injeção em si depende do DOM da página (não testável no node); coberta por teste manual.

## Riscos / pontos de atenção de segurança

- Injetar na página é poderoso: por isso é opt-in, usa só `activeTab` (sem acesso persistente)
  e injeta apenas o código gerado, nunca o segredo nem a chave.
- Um seletor mal configurado pode preencher o campo errado; é responsabilidade do usuário, e o
  pior caso é colar o código em um input visível (o mesmo que ele faria manualmente).
