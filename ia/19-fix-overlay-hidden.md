# 19 — Correção: overlay preso na primeira abertura (atributo `hidden` sobreposto)

## Objetivo

Corrigir o bug em que, ao abrir o popup pela primeira vez, o diálogo de confirmação de
exclusão aparece sobreposto à tela de criação de senha e não pode ser fechado, prendendo o
usuário.

## Por que / contexto

Reportado com captura de tela: na primeira abertura, sobre a tela "Defina uma senha mestra"
aparece o diálogo "Tem certeza? Essa ação não pode ser desfeita" (Cancelar/Excluir), bloqueando
o uso.

**Causa raiz:** o atributo HTML `hidden` esconde via uma regra de baixa especificidade
(`[hidden] { display: none }` do navegador). Componentes como `.dialog` e `.card__feedback`
definem `display: flex` por uma classe — seletor de especificidade maior — que **sobrepõe** o
`hidden`. Resultado: o elemento marcado como `hidden` continua visível, e como "Cancelar"
apenas volta a setar `hidden`, o diálogo nunca some.

## Escopo

**Entra:**
- Regra global garantindo que `hidden` sempre vença: `[hidden] { display: none !important; }`.
- Garantir que o diálogo de confirmação seja fechado em qualquer troca de tela (defesa em
  profundidade).
- Teste de regressão que falha se a regra global de `[hidden]` for removida.

**Não entra:**
- Qualquer mudança funcional de fluxo — é só correção de visibilidade.

## Decisões técnicas

- A correção é uma única regra de CSS de reset, aplicada cedo no `popup.css`. Afeta só
  elementos que têm o atributo `hidden` (que sempre queremos ocultos) — sem efeito colateral.
- `mostrarVista` passa a fechar o diálogo de exclusão, garantindo que ele nunca persista entre
  telas.

## Critérios de aceite (teste manual)

1. Primeira abertura (instalação limpa): aparece só a tela de criação de senha, sem nenhum
   diálogo sobreposto.
2. O diálogo de exclusão só aparece ao clicar em "Excluir MFA" na edição, e "Cancelar" o fecha.
3. O feedback "Copiado!" do card aparece só após copiar, não o tempo todo.

## Testes automatizados

- Teste estático do `popup.css` confirmando a presença da regra
  `[hidden] { display: none !important; }` — impede a regressão.

## Riscos / pontos de atenção

- `!important` aqui é apropriado e seguro: a intenção do atributo `hidden` é absoluta (o
  elemento não deve aparecer), então deve vencer qualquer `display` de componente.
