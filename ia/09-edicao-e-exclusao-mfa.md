# 09 — Edição e exclusão de MFA

## Objetivo

Permitir editar os dados de um MFA já cadastrado (nome, domínio, segredo) e excluí-lo,
reaproveitando o formulário da task 08 em modo de edição.

## Por que / contexto

Usuários cometem erros de digitação ou precisam atualizar um segredo (ex: ao reconfigurar o
MFA de um serviço). Sem essa task, o único jeito de corrigir algo seria excluir e recriar
manualmente — pior experiência e mais risco de erro.

## Escopo

**Entra:**
- Reaproveitamento do formulário da task 08 em **modo edição**: ao abrir, pré-carrega os
  dados existentes do MFA (nome, domínio, e o segredo — descriptografado em memória apenas
  para essa exibição/edição, nunca persistido em claro).
- Permitir alterar qualquer um dos três campos e salvar (reaplicando a mesma validação da
  task 08).
- Ação de **excluir** o MFA, com uma confirmação explícita antes de remover
  permanentemente (ex: diálogo "Tem certeza? Essa ação não pode ser desfeita").

**Não entra:**
- Qualquer alteração no fluxo de criação de novos MFAs (já coberto na task 08).

## Decisões técnicas

- O formulário de edição é o mesmo componente da task 08, recebendo um parâmetro/estado que
  indica se está em modo "criar" ou "editar" (e, se editar, o `id` do MFA).
- Ao abrir em modo edição, descriptografar o segredo daquele registro (usando a chave em
  memória da task 02) só no momento de popular o campo do formulário — exibido mascarado por
  padrão, com opção de "mostrar" controlada pelo usuário, igual à task 08.
- Ao salvar a edição, se o segredo foi alterado, criptografar o novo valor com um novo IV
  (nunca reaproveitar o IV antigo); se o segredo não foi alterado, pode manter o
  `secretCriptografado`/`iv` originais sem necessidade de re-criptografar.
- Exclusão: usa `removerMfa(id)` da camada de dados (task 03), seguida de atualização
  imediata da listagem na tela principal.
- Confirmação de exclusão implementada como um diálogo simples na própria UI (não usar
  `confirm()` nativo do navegador, para manter consistência visual com o design system da
  task 10).

## Dependências

- Task 08 (cadastro de novo MFA) — formulário reaproveitado.
- Task 02 (criptografia) — descriptografar para edição, criptografar ao salvar alteração.
- Task 03 (modelo de dados) — `atualizarMfa`, `removerMfa`.

## Critérios de aceite (teste manual)

1. Clicar em "editar" em um card abre o formulário já preenchido com os dados daquele MFA
   (nome, domínio, segredo mascarado).
2. Alterar o nome e salvar: a listagem reflete o novo nome imediatamente.
3. Alterar o segredo e salvar: o código TOTP gerado a partir daquele momento corresponde ao
   novo segredo (validar com uma ferramenta de referência, como na task 06).
4. Tentar excluir um MFA: aparece a confirmação; cancelar não exclui; confirmar remove o
   card da listagem imediatamente.

## Testes automatizados

- Teste de que abrir em modo edição popula corretamente os campos a partir dos dados
  existentes (com mock de descriptografia).
- Teste de que salvar sem alterar o segredo não gera um novo IV/ciphertext (evita
  re-criptografia desnecessária).
- Teste de que salvar com novo segredo gera um IV diferente do anterior.
- Teste da função de exclusão chamando `removerMfa` com o id correto, e que a confirmação é
  obrigatória antes de chamar essa função (não deve ser possível excluir sem confirmar).

## Riscos / pontos de atenção de segurança

- O segredo descriptografado para edição deve ter o mesmo cuidado de manuseio em memória da
  task 06 (nunca logado, nunca persistido em claro, descartado da memória do formulário ao
  fechar/cancelar a edição).
