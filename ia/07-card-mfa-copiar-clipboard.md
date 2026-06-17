# 07 — Card de MFA e copiar para a área de transferência

## Objetivo

Construir o componente visual do card de cada MFA (nome, domínio, código, cronômetro, botão
editar) e implementar a cópia do código para a área de transferência do sistema operacional ao
clicar nele.

## Por que / contexto

É o ponto de contato final do usuário com o produto: ver o código e levá-lo rapidamente para o
formulário de login do site de destino. A cópia em um clique é o que torna o fluxo mais rápido
do que abrir um app de autenticação separado e digitar manualmente.

## Escopo

**Entra:**
- Componente visual do card, consumindo os dados do MFA (task 03) e o código/cronômetro
  gerado (task 06).
- Clique no código copia para a área de transferência via `navigator.clipboard.writeText`.
- Feedback visual de "copiado" (ex: ícone/texto trocando temporariamente).
- Botão de editar no card, que aciona a tela de edição (task 09).
- Foco obrigatório de funcionamento em **Ubuntu/Linux + Firefox** (ambiente de
  desenvolvimento/uso primário do autor).

**Não entra (fora do escopo atual, ver nota abaixo):**
- Garantir compatibilidade/fallbacks de clipboard para todos os sistemas operacionais e
  variações de Firefox. Caso surjam limitações específicas de outro SO durante o
  desenvolvimento, abrir isso como observação na task 11 (futuro) em vez de bloquear esta
  task.

## Decisões técnicas

- Estrutura do card: nome do MFA, domínio (se houver, exibido como subtítulo/badge), código
  de 6 dígitos em destaque (clicável), indicador de cronômetro (barra ou anel de progresso),
  botão de editar (ícone de lápis, por exemplo).
- Cópia para clipboard: `navigator.clipboard.writeText(codigo)`. Em contexto de extensão
  Firefox, isso funciona a partir de um popup com a permissão `clipboardWrite` no manifest
  (adicionada nesta task) e dentro de um gesto do usuário (o próprio clique), o que já
  satisfaz a exigência de "user gesture" das APIs de clipboard.
- Feedback de cópia: alterar temporariamente (ex: 1-2s) o texto/ícone do card para algo como
  "Copiado!" e depois voltar ao normal — sem usar `alert()` (quebra o fluxo e o visual).
- Tratar erro de cópia (ex: permissão negada) com uma mensagem de erro discreta no próprio
  card, sem travar a tela.

## Dependências

- Task 03 (modelo de dados) — dados do card.
- Task 06 (TOTP e cronômetro) — código e cronômetro a exibir.
- Task 05 (tela principal) — onde os cards são renderizados em lista.

## Critérios de aceite (teste manual, Ubuntu + Firefox)

1. Clicar no código do card copia exatamente o código de 6 dígitos exibido (sem espaços ou
   caracteres extras) para a área de transferência do sistema (validar colando em outro
   programa, ex: um editor de texto do Ubuntu).
2. Após copiar, aparece o feedback visual de "copiado" e depois volta ao estado normal.
3. O botão de editar abre a tela/formulário de edição daquele MFA específico (task 09).
4. O cronômetro do card visualmente reflete o tempo restante (task 06) sem travar a interação
   de clique/cópia.

## Testes automatizados

- Teste unitário da função que formata o código para cópia (garante que não inclui espaços,
  zeros à esquerda preservados — ex: código `007123` deve continuar com 6 dígitos).
- Teste (com mock de `navigator.clipboard.writeText`) de que a função de copiar é chamada com
  o valor exato do código atual ao clicar.

## Riscos / pontos de atenção

- Documentar explicitamente no código/README que o suporte garantido no MVP é Ubuntu/Linux +
  Firefox, e que outros SOs (Windows, macOS) ou outros navegadores devem ser tratados como
  trabalho futuro (task 11), incluindo fallback de cópia manual (seleção de texto) se algum
  ambiente não suportar a Clipboard API.
