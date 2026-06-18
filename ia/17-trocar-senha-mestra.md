# 17 — Trocar a senha mestra

## Objetivo

Permitir, na tela de configurações, trocar a senha mestra: confirmar a senha atual, definir
uma nova (com confirmação e tamanho mínimo) e recriptografar todos os segredos com a chave
derivada da nova senha.

## Por que / contexto

A senha mestra protege tudo. Poder trocá-la é higiene de segurança básica (suspeita de
comprometimento, rotação periódica). Como a chave deriva da senha, trocar a senha exige
re-derivar a chave e **recriptografar todos os segredos** — operação que tem de ser correta e
atômica para não corromper o cofre.

## Escopo

**Entra:**
- Seção "Trocar senha mestra" na tela de configurações: senha atual, nova senha, confirmação.
- Verificação da senha atual pelo valor de controle (decrypt — timing-safe, igual ao
  desbloqueio).
- Geração de novo salt, nova chave, novo valor de controle e recriptografia de todos os MFAs
  com novos IVs.
- Escrita atômica (uma única `storage.set`) de salt + controle + MFAs + reset do contador.
- A sessão segue aberta com a nova chave após a troca.

**Não entra:**
- Recuperação de senha esquecida — não existe (cofre local sem backend).

## Decisões técnicas

- `sessao.trocarSenhaMestra(senhaAtual, senhaNova)` faz toda a lógica no background; valida a
  nova senha pelo tamanho mínimo (mesma regra da task 05).
- `storage.aplicarTrocaSenha({ saltBytes, controle, mfas })` grava tudo de uma vez, reduzindo
  a janela de inconsistência se o worker for descarregado no meio.
- Mensagem nova: `CHANGE_MASTER_PASSWORD { senhaAtual, senhaNova }` → `{ ok, erro? }`.
  Erros: `SENHA_ATUAL_INCORRETA`, `SENHA_NOVA_INVALIDA`. Exige sessão desbloqueada.

## Dependências

- Task 02 (cripto/derivação), task 03 (storage), task 16 (tela de configurações).

## Critérios de aceite (teste manual)

1. Trocar com a senha atual correta e nova válida: confirmação de sucesso; bloquear e
   desbloquear passa a exigir a nova senha (a antiga falha).
2. Os códigos TOTP gerados continuam corretos após a troca (segredos preservados).
3. Senha atual errada: erro claro, nada é alterado.
4. Nova senha curta ou confirmação divergente: erro de validação, nada é alterado.

## Testes automatizados

- Troca bem-sucedida: a nova senha desbloqueia, a antiga não; os segredos (REVEAL/GET_CODE)
  permanecem íntegros.
- Senha atual incorreta → `SENHA_ATUAL_INCORRETA`, dados inalterados.
- Nova senha curta → `SENHA_NOVA_INVALIDA`.

## Riscos / pontos de atenção de segurança

- Nunca logar nenhuma das senhas. Os segredos em claro existem só em memória, no laço de
  recriptografia, e são descartados em seguida (zeroing best-effort herdado de crypto.js).
