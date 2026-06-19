# 23 — Autopreenchimento por domínio e múltiplos seletores

## Objetivo

Permitir configurar seletores de autopreenchimento **por domínio** (além do seletor padrão
global) e suportar **múltiplos** seletores, já que cada site estrutura o campo de OTP de um
jeito.

## Por que / contexto

Um único seletor global raramente serve para todos os sites. Permitir um override por domínio
(ex.: `github.com → #otp`) torna o autopreenchimento confiável em vários serviços. "Múltiplos"
é coberto de duas formas: vários domínios na lista, e cada seletor pode ter várias regras
separadas por vírgula (`querySelectorAll`).

## Escopo

**Entra:**
- Config de autofill passa a ter `seletorPadrao` (migra do antigo `seletor`) e `porDominio`
  (mapa domínio → seletor).
- `resolverSeletor(config, dominio)`: usa o override do domínio, senão o padrão.
- UI: seletor padrão + lista editável de "domínio → seletor" (adicionar/remover linhas).
- Normalização: domínios em minúsculo/trim; entradas vazias descartadas.

**Não entra:**
- Mudança no algoritmo de injeção (continua o da task 18: 1 campo ou um por dígito + Enter).

## Decisões técnicas

- `normalizarConfigAutofill` aceita o formato antigo (`seletor`) e migra para `seletorPadrao`,
  sem quebrar quem já salvou.
- As linhas de domínio são criadas via DOM API (`createElement`/`textContent`), nunca
  `innerHTML` — os valores são do usuário.
- A resolução do seletor usa o domínio da aba atual (já minúsculo).

## Dependências

- Task 18 (autopreenchimento), task 16 (tela de configurações).

## Critérios de aceite (teste manual)

1. Definir um seletor por domínio e abrir o popup nesse site usa o seletor específico.
2. Em domínios sem override, usa o seletor padrão.
3. Adicionar/remover linhas e salvar persiste corretamente.

## Testes automatizados

- `normalizarConfigAutofill` (migração, normalização de domínios, descarte de vazios).
- `resolverSeletor` (override vs. padrão).
- `SET_AUTOFILL`/`GET_CONFIG` com `porDominio`.
