# 06 — Tela principal: listagem por domínio

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
- Botão fixo de "Adicionar novo" (abre o formulário da task 04).

**Não entra:**
- O conteúdo do card em si (código TOTP, cronômetro, copiar) — isso é a task 07/08. Aqui a
  tela principal apenas itera sobre os MFAs e renderiza um card por item (o componente de
  card pode inicialmente ser um placeholder simples).

## Decisões técnicas

- Reaproveitar a função utilitária `extrairDominioDaAba(tab)` criada na task 04 (cadastro) —
  não duplicar a lógica de extração de domínio. A permissão `activeTab` já foi adicionada ao
  manifest na task 04; esta task apenas consome a mesma função para filtrar a listagem, via
  `browser.tabs.query({ active: true, currentWindow: true })`.
- Comparação de domínio: exata por padrão (`www.exemplo.com` ≠ `exemplo.com`); deixar
  documentado como possível melhoria futura normalizar removendo `www.` — mas não
  obrigatório para o MVP, desde que documentado. A comparação é feita sobre `hostname`
  (resultado de `new URL().hostname`), que já é normalizado para minúsculas pela própria
  implementação nativa do parser de URL (garantia da spec WHATWG URL) — então
  `GitHub.com`/`github.com` cadastrados ou comparados em casing diferente já funcionam
  corretamente sem normalização adicional.
- Estado da tela (filtrado por domínio vs. todos) mantido em uma variável local da sessão do
  popup (não precisa persistir).
- Renderização da lista de cards segue a mesma regra de sanitização da task 08: nunca usar
  `innerHTML` com dados vindos do storage (`nome`, `dominio`). Usar `textContent`/DOM API
  programática.

## Dependências

- Task 03 (modelo de dados e armazenamento).
- Task 04 (cadastro de novo MFA) — fornece a função `extrairDominioDaAba` reaproveitada aqui.
- Task 05 (tela de desbloqueio) — só chega aqui depois de desbloqueado.

## Critérios de aceite (teste manual)

1. Com a aba ativa em um domínio que tem MFA cadastrado: só esse(s) MFA(s) aparecem.
2. Com a aba ativa em um domínio sem MFA cadastrado: a lista completa aparece automaticamente
   (sem precisar clicar em nada).
3. Clicar em "Ver todos" com um domínio que tem MFA: mostra a lista completa.
4. Sem nenhum MFA cadastrado: aparece o estado vazio com call-to-action para cadastrar.
5. Botão "Adicionar novo" sempre visível e funcional.

## Testes automatizados

- Função que decide qual conjunto de dados mostrar (filtrado vs. todos), dado: lista de MFAs,
  domínio atual, e se o usuário clicou em "ver todos" — cobrindo o caso de fallback
  automático quando o filtro retorna vazio.
- Teste de `extrairDominioDaAba` (já criada na task 04) cobrindo, especificamente para o uso
  desta tela: URL com porta (`https://localhost:3000/` → hostname `localhost`, sem a porta —
  confirmar e documentar que dois serviços locais em portas diferentes caem no mesmo
  "domínio" `localhost`, comportamento esperado/limitação conhecida, não bug).
- Teste de URL com IP literal (`http://192.168.1.1/login` → hostname `192.168.1.1`, deve
  funcionar normalmente como qualquer domínio).
- Teste de subdomínio: `app.exemplo.com` vs `exemplo.com` tratados como domínios diferentes
  (comparação exata) — confirmar via teste, não só documentação em prosa.
- Teste do cenário em que `browser.tabs.query` retorna uma aba sem campo `url` (por falta de
  permissão suficiente do `activeTab` em certas circunstâncias, ou aba interna do Firefox) —
  deve cair no mesmo fallback de "mostrar lista completa" do caso `about:`/`file://`.
- Teste de case-sensitivity: domínio cadastrado como `GitHub.com` compara igual à aba atual
  `github.com` (confirma a normalização nativa do `URL().hostname`).

## Riscos / pontos de atenção

- A permissão `activeTab`/`tabs` deve ser usada exclusivamente para ler o domínio da aba
  ativa — não usar para nenhuma outra finalidade, e deixar isso documentado no código/README
  para reforçar a postura de privacidade do produto.
