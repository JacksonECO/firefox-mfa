# 08 — Cadastro de novo MFA

## Objetivo

Implementar o formulário de criação de um novo MFA: nome (obrigatório), domínio/site
(opcional, pré-preenchido com o domínio da aba atual quando possível) e segredo TOTP
(obrigatório).

## Por que / contexto

É o ponto de entrada de dados do produto. A pré-preenchimento do domínio reforça o
diferencial de foco no site atual: ao cadastrar um MFA enquanto já está no site do serviço,
o usuário não precisa nem digitar o domínio manualmente.

## Escopo

**Entra:**
- Formulário com os três campos: `nome` (obrigatório), `dominio` (opcional), `secret`
  (obrigatório).
- Pré-preenchimento automático do campo `dominio` com o domínio da aba ativa no momento em
  que o formulário é aberto (reaproveitando a lógica da task 05), permitindo edição/limpeza
  manual pelo usuário.
- Validação de formato do segredo (Base32 — formato padrão de segredos TOTP).
- Ao salvar: criptografar o segredo (task 02) e persistir via a camada de dados (task 03).
- Retorno para a tela principal já mostrando o novo card cadastrado.

**Não entra:**
- Edição de um MFA já existente (task 09, que reaproveita este formulário em outro modo).

## Decisões técnicas

- Validação de Base32: segredos TOTP normalmente usam o alfabeto Base32 (`A-Z2-7`,
  eventualmente com `=` de padding). Validar e normalizar (ex: remover espaços comuns em
  segredos copiados de QR codes, converter para maiúsculas) antes de salvar.
- Campo `dominio` pré-preenchido a partir da mesma função de extração de domínio da task 05
  (`new URL(tab.url).hostname`), mas deixando o campo sempre editável — o usuário pode trocar
  ou apagar.
- Campo `nome` com validação de obrigatoriedade no front-end e reforçada na camada de dados
  (task 03) como defesa em profundidade.
- Erros de validação exibidos inline, próximos ao campo correspondente, sem bloquear a
  digitação dos outros campos.

## Dependências

- Task 02 (criptografia) — para criptografar o segredo antes de salvar.
- Task 03 (modelo de dados) — `salvarMfa`.
- Task 05 (tela principal) — fornece a lógica de obter o domínio da aba atual e é a tela de
  origem/destino do fluxo de cadastro.

## Critérios de aceite (teste manual)

1. Abrir o formulário com uma aba ativa em um site válido: o campo de domínio já vem
   preenchido com o domínio daquele site.
2. Deixar o domínio vazio (apagando o pré-preenchido) e salvar: o MFA é cadastrado sem
   domínio, aparecendo só na listagem completa (task 05), nunca no filtro por domínio.
3. Tentar salvar sem nome: erro de validação, não salva.
4. Tentar salvar com um segredo em formato inválido (ex: contendo caracteres fora do
   alfabeto Base32): erro de validação, não salva.
5. Cadastro válido: volta para a tela principal e o novo card aparece imediatamente,
   exibindo já um código TOTP válido.

## Testes automatizados

- Teste da função de validação/normalização de segredo Base32 (casos válidos, espaços,
  minúsculas, caracteres inválidos).
- Teste da função de validação do formulário (nome obrigatório, domínio opcional, segredo
  obrigatório e válido).
- Teste de integração leve: submeter o formulário com dados válidos chama `salvarMfa` com os
  dados esperados (mock da camada de dados).

## Riscos / pontos de atenção de segurança

- O campo de segredo deve ser do tipo `password` (ou equivalente mascarado) para evitar
  exposição visual acidental ao digitar/colar, com opção de "mostrar" controlada pelo
  usuário.
- Garantir que o valor do campo de segredo é descartado da memória do formulário (não fica
  em nenhum estado residual da UI) imediatamente após o salvamento bem-sucedido.
