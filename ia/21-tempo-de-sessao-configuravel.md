# 21 — Tempo de expiração da sessão configurável

## Objetivo

Tornar configurável o tempo de inatividade após o qual a senha mestra é exigida de novo
(antes fixo em 2 minutos), com um campo na tela de configurações.

## Por que / contexto

Diferentes usuários querem equilíbrios diferentes entre conveniência e segurança: 30s num
computador compartilhado, alguns minutos num pessoal. O padrão seguro (2 min) é mantido.

## Escopo

**Entra:**
- Campo "Expirar após (minutos)" na tela de configurações.
- Persistência (não sensível) do timeout; a sessão passa a usar o valor salvo.
- Sanitização do valor (mínimo 15s, máximo 60 min) — não permite desligar a expiração.
- Aplicação imediata: salvar atualiza também a sessão em curso.

**Não entra:**
- "Nunca expirar" — proibido por design (a expiração é parte da segurança).

## Decisões técnicas

- `src/sessaoconfig.js`: `TIMEOUT_PADRAO_MS` (2 min), limites e `normalizarTimeout`.
- `sessao.js` mantém o timeout em memória (`estaDesbloqueado` é síncrono); carrega do storage
  ao desbloquear/criar senha e expõe `definirTimeoutMs` para aplicar na hora.
- Mensagens: `GET_CONFIG` passa a incluir `sessaoTimeoutMs`; `SET_SESSION_TIMEOUT { ms }`.

## Dependências

- Task 02 (sessão/expiração), task 16 (tela de configurações).

## Critérios de aceite (teste manual)

1. Configurar 0,5 min e ficar inativo: após ~30s o popup volta a pedir a senha.
2. Valores fora dos limites são ajustados ao salvar.
3. O padrão (sem nunca configurar) continua sendo 2 minutos.

## Testes automatizados

- `normalizarTimeout` (limites e fallback).
- `GET_CONFIG`/`SET_SESSION_TIMEOUT` (exigem desbloqueio, persistem).
- Com `definirTimeoutMs` + fake timers, a sessão expira no tempo configurado.
