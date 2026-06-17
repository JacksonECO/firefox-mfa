# 05 — Tela principal: listagem por domínio

## Objetivo

Implementar a tela principal do popup, que por padrão mostra apenas os MFAs cadastrados para
o domínio do site aberto na aba ativa, com um botão para ver todos os MFAs cadastrados.

## Por que / contexto

Esta é a tela que materializa o **principal diferencial do produto**: em vez de o usuário
perder tempo procurando o MFA certo numa lista grande, o plug-in já mostra o que é relevante
para o site em que ele está.

## Escopo

**Entra:**
- Obter o domínio da aba ativa.
- Filtrar e renderizar apenas os MFAs daquele domínio (usando `listarMfasPorDominio` da task
  03).
- Botão "Ver todos" que troca para a listagem completa (`listarMfas`).
- Fallback automático: se não houver nenhum MFA para o domínio atual, já mostrar a lista
  completa diretamente (sem precisar clicar em "ver todos").
- Estado vazio: nenhum MFA cadastrado ainda (mensagem + chamada para ação de cadastrar o
  primeiro).
- Botão fixo de "Adicionar novo" (abre o formulário da task 08).

**Não entra:**
- O conteúdo do card em si (código TOTP, cronômetro, copiar) — isso é a task 06/07. Aqui a
  tela principal apenas itera sobre os MFAs e renderiza um card por item (o componente de
  card pode inicialmente ser um placeholder simples).

## Decisões técnicas

- Obter a aba ativa via `browser.tabs.query({ active: true, currentWindow: true })`
  (permissão `activeTab` no manifest, adicionada nesta task).
- Extrair o domínio a partir da `url` da aba usando o construtor nativo `new URL(url).hostname`.
- Tratar casos especiais: aba sem URL http(s) válida (ex: `about:`, `file://`, nova aba) —
  nesse caso não há domínio para filtrar, então mostrar diretamente a listagem completa.
- Comparação de domínio: exata por padrão (`www.exemplo.com` ≠ `exemplo.com`); deixar
  documentado como possível melhoria futura normalizar removendo `www.` — mas não
  obrigatório para o MVP, desde que documentado.
- Estado da tela (filtrado por domínio vs. todos) mantido em uma variável local da sessão do
  popup (não precisa persistir).

## Dependências

- Task 03 (modelo de dados e armazenamento).
- Task 04 (tela de desbloqueio) — só chega aqui depois de desbloqueado.

## Critérios de aceite (teste manual)

1. Com a aba ativa em um domínio que tem MFA cadastrado: só esse(s) MFA(s) aparecem.
2. Com a aba ativa em um domínio sem MFA cadastrado: a lista completa aparece automaticamente
   (sem precisar clicar em nada).
3. Clicar em "Ver todos" com um domínio que tem MFA: mostra a lista completa.
4. Sem nenhum MFA cadastrado: aparece o estado vazio com call-to-action para cadastrar.
5. Botão "Adicionar novo" sempre visível e funcional.

## Testes automatizados

- Função de extração de domínio a partir de uma URL (casos: URL normal, URL com porta, URL
  inválida/`about:blank`, ausência de URL).
- Função que decide qual conjunto de dados mostrar (filtrado vs. todos), dado: lista de MFAs,
  domínio atual, e se o usuário clicou em "ver todos" — cobrindo o caso de fallback
  automático quando o filtro retorna vazio.

## Riscos / pontos de atenção

- A permissão `activeTab`/`tabs` deve ser usada exclusivamente para ler o domínio da aba
  ativa — não usar para nenhuma outra finalidade, e deixar isso documentado no código/README
  para reforçar a postura de privacidade do produto.
