# 04 — Cadastro de novo MFA

> **Posicionada propositalmente logo após a task 03 (modelo de dados).** Sem nenhum MFA
> cadastrado, nenhuma das telas seguintes (desbloqueio com dados reais, listagem, geração de
> código, card, edição) pode ser validada manualmente. Esta task é o primeiro marco em que o
> produto tem dados reais para todo o resto do roadmap testar incrementalmente.

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
  que o formulário é aberto, permitindo edição/limpeza manual pelo usuário.
- Criação da função utilitária `extrairDominioDaAba(tab)` (módulo compartilhado, ex:
  `src/dominio.js`), já que ela será reaproveitada depois pela tela principal (task 06) para
  o filtro por domínio — não duplicar essa lógica.
- Validação de formato do segredo (Base32 — formato padrão de segredos TOTP).
- Ao salvar: criptografar o segredo (task 02) e persistir via a camada de dados (task 03).
- Retorno para a tela principal já mostrando o novo card cadastrado.

**Não entra:**
- Edição de um MFA já existente (task 09, que reaproveita este formulário em outro modo).
- A tela principal de listagem (task 06) — esta task não depende dela; o formulário de
  cadastro deve funcionar de forma isolada (ex: acessível por uma rota/tela simples própria),
  permitindo testá-lo antes mesmo de a listagem existir.

## Decisões técnicas

- Validação de Base32: segredos TOTP normalmente usam o alfabeto Base32 (`A-Z2-7`,
  eventualmente com `=` de padding). Validar e normalizar (ex: remover espaços comuns em
  segredos copiados de QR codes, converter para maiúsculas) antes de salvar.
- Campo `dominio` pré-preenchido usando `new URL(tab.url).hostname`, obtido via
  `browser.tabs.query({ active: true, currentWindow: true })` (permissão `activeTab`,
  adicionada já nesta task). Implementar essa extração como a função utilitária
  `extrairDominioDaAba(tab)` mencionada no escopo, tratando os casos de borda: aba sem URL
  http(s) válida, `about:`/`file://`, ou URL ausente por restrição de permissão — em qualquer
  desses casos retorna `null`, e o campo de domínio do formulário simplesmente fica vazio
  (não pré-preenchido), sem travar o cadastro. Deixar o campo sempre editável — o usuário
  pode trocar ou apagar o valor pré-preenchido.
- Campo `nome` com validação de obrigatoriedade no front-end e reforçada na camada de dados
  (task 03) como defesa em profundidade.
- Erros de validação exibidos inline, próximos ao campo correspondente, sem bloquear a
  digitação dos outros campos.

## Dependências

- Task 02 (criptografia) — para criptografar o segredo antes de salvar.
- Task 03 (modelo de dados) — `salvarMfa`.

Nota: esta task **não depende da tela principal** (task 06) — a lógica de extração de domínio
da aba ativa é implementada aqui como utilitário independente e reaproveitada depois pela
tela principal. Isso permite testar o cadastro de forma isolada antes mesmo de a listagem
existir.

## Critérios de aceite (teste manual)

1. Abrir o formulário com uma aba ativa em um site válido: o campo de domínio já vem
   preenchido com o domínio daquele site.
2. Deixar o domínio vazio (apagando o pré-preenchido) e salvar: o MFA é cadastrado sem
   domínio, aparecendo só na listagem completa (task 06) quando ela existir, nunca no filtro
   por domínio.
3. Tentar salvar sem nome: erro de validação, não salva.
4. Tentar salvar com um segredo em formato inválido (ex: contendo caracteres fora do
   alfabeto Base32): erro de validação, não salva.
5. Cadastro válido: persiste corretamente (validar via DevTools → Storage que o segredo
   salvo está criptografado, nunca em claro).
6. Marco do produto: validar manualmente o ciclo completo mínimo nesta etapa do roadmap —
   cadastrar a senha mestra (mesmo que via uma interação simplificada, antes da task 05 de
   desbloqueio estar pronta) → cadastrar um MFA → confirmar via DevTools que o registro foi
   persistido corretamente e criptografado. Este é o primeiro estado do produto com dados
   reais para as próximas tasks testarem incrementalmente.

## Testes automatizados

- Teste da função de validação/normalização de segredo Base32 (casos válidos, espaços,
  minúsculas, caracteres inválidos).
- Teste da função de validação do formulário (nome obrigatório, domínio opcional, segredo
  obrigatório e válido).
- Teste de integração leve: submeter o formulário com dados válidos chama `salvarMfa` com os
  dados esperados (mock da camada de dados).
- Teste de `extrairDominioDaAba(tab)`: URL http(s) normal retorna o hostname; `about:`,
  `file://` e ausência de `url` (objeto `tab` sem o campo, simulando permissão insuficiente)
  retornam `null` sem lançar exceção.

## Riscos / pontos de atenção de segurança

- O campo de segredo deve ser do tipo `password` (ou equivalente mascarado) para evitar
  exposição visual acidental ao digitar/colar, com opção de "mostrar" controlada pelo
  usuário.
- Garantir que o valor do campo de segredo é descartado da memória do formulário (não fica
  em nenhum estado residual da UI) imediatamente após o salvamento bem-sucedido.
- `nome` e `dominio` são aceitos como texto livre (incluindo caracteres como `<`, `>`, `&`,
  aspas) sem restrição de validação — a defesa contra XSS não é bloquear esses caracteres na
  entrada, e sim garantir que, em qualquer tela futura que os exiba (tasks 06, 08, 09), a
  renderização use `textContent`/DOM API programática, nunca `innerHTML`.
