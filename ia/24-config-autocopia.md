# 24 — Configuração para ligar/desligar a autocópia

## Objetivo

Permitir desativar (ou reativar) a autocópia do código ao abrir o popup com um único MFA do
domínio (task 15), via uma opção nas configurações.

## Por que / contexto

A autocópia é conveniente, mas mexe na área de transferência sem clique. Alguns usuários
preferem desligá-la. O padrão segue ligado (comportamento original).

## Escopo

**Entra:**
- Opção "Copiar o código automaticamente ao abrir" na seção "Geral" das configurações.
- Persistência (padrão: ligado). O popup respeita a opção ao decidir autocopiar.

**Não entra:**
- Mudança no gatilho (continua: 1 MFA do domínio, só na abertura).

## Decisões técnicas

- `storage.obterAutocopiar()` retorna `true` quando ausente (padrão ligado).
- `GET_CONFIG` passa a incluir `autocopiar`; nova mensagem `SET_AUTOCOPY { habilitado }`.
- O popup busca a config uma única vez ao abrir a principal e usa para decidir autocópia e
  autopreenchimento (evita chamadas duplicadas).

## Dependências

- Task 15 (autocópia), task 16 (configurações).

## Critérios de aceite (teste manual)

1. Desligar a opção: abrir o popup com 1 MFA não copia automaticamente (clicar ainda copia).
2. Ligar de novo: volta a copiar ao abrir.

## Testes automatizados

- `GET_CONFIG.autocopiar` é `true` por padrão; `SET_AUTOCOPY` alterna e exige desbloqueio.
