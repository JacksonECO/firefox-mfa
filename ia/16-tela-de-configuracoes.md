# 16 — Tela de configurações + rate limiting configurável

## Objetivo

Criar uma tela de configurações acessível da tela principal e, como primeira configuração,
tornar o rate limiting de senha mestra (task 10) ajustável: quantidade de tentativas sem
atraso, limiares de faixa, "máximo de tentativas" e os atrasos de cada faixa.

## Por que / contexto

O fluxo de atraso progressivo (task 10) tinha valores fixos no código. Diferentes usuários
têm tolerâncias diferentes a fricção vs. segurança; expor isso numa tela de configurações
deixa o produto flexível sem comprometer o padrão seguro (os defaults reproduzem o fluxo
original). A tela de configurações também é a base para as próximas opções (trocar senha
mestra — task 17; autopreenchimento — task 18).

## Escopo

**Entra:**
- Tela de configurações (`view-config`), aberta por um botão no rodapé da tela principal.
- Seção de proteção contra tentativas: campos para `livres`, `limite1`, `atraso1`,
  `limite2` ("máximo de tentativas"), `atraso2` e `atrasoMax` (atrasos em segundos na UI,
  guardados em ms).
- Persistência da config (não sensível) em `browser.storage.local`; o `desbloquear` passa a
  usar a config salva (com fallback para os padrões).
- Normalização/sanitização da config no background (faixas coerentes, atrasos não negativos).

**Não entra:**
- Trocar senha mestra (task 17) e autopreenchimento (task 18) — seções adicionadas depois na
  mesma tela.
- A exclusão de MFA já existe (task 09, via tela de edição) — nada novo aqui.

## Decisões técnicas

- `ratelimit.js` ganha `RATE_LIMIT_PADRAO`, `normalizarConfigRateLimit(parcial)` e
  `calcularAtraso(tentativas, config)`. Os padrões mantêm 0/1s/5s/30s.
- A sanitização garante `livres < limite1 < limite2` e atrasos dentro de limites razoáveis —
  defesa contra valores absurdos/inválidos vindos da UI (sempre revalidado no background).
- Mensagens novas: `GET_CONFIG` → `{ rateLimit }`; `SET_RATE_LIMIT { config }` → salva e
  devolve a config normalizada. Exigem sessão desbloqueada.

## Dependências

- Task 10 (rate limiting), task 03 (storage), task 05/06 (UI/navegação).

## Critérios de aceite (teste manual)

1. Abrir "Configurações" na tela principal mostra os valores atuais (padrão na 1ª vez).
2. Salvar novos valores e errar a senha mestra reflete os novos atrasos.
3. Valores inválidos (ex: limite2 < limite1) são corrigidos/normalizados ao salvar.

## Testes automatizados

- `normalizarConfigRateLimit` corrige faixas incoerentes e respeita os limites.
- `calcularAtraso` usa a config fornecida (e os padrões quando ausente).
- `GET_CONFIG`/`SET_RATE_LIMIT` exigem desbloqueio e persistem a config.

## Riscos / pontos de atenção de segurança

- A config é dado não sensível, mas a normalização no background impede que a UI desabilite a
  proteção com valores absurdos sem querer; o desbloqueio sempre revalida a config salva.
