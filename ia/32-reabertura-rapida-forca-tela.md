# 32 — Reabertura rápida força a tela a aparecer

## Objetivo

Quando `fecharAoPreencher` está ligado, o popup se fecha sozinho assim que o código (ou o
login) é preenchido na página — o usuário nem chega a ver a tela. Se o clique no ícone da
extensão se repetir em **menos de 3s** do fechamento automático anterior, isso é lido como "eu
quero ver a tela", e essa reabertura específica **ignora a config** e permanece aberta.

## Por que / contexto

Antes desta task, não havia como abrir o popup e efetivamente vê-lo quando
`fecharAoPreencher` estava ligado: qualquer clique no ícone repetia o autopreenchimento e
fechava de novo, num loop sem saída visível (só desligando a config nas configurações). Um
clique duplo/rápido no ícone é o gesto natural para "quero ver", então ele vira a válvula de
escape sem exigir navegar até as configurações.

## Escopo

**Entra:**
- Nova mensagem `PODE_FECHAR_AUTOMATICO` no background, **sem exigir sessão** (é só um
  cronômetro de UX, não toca em segredo/chave/storage) — vale tanto na tela principal quanto
  no fluxo localhost (task 28).
- Estado em memória no background: `ultimoFechamentoAutomaticoEm`. A cada fechamento
  automático concedido, grava o instante. Uma nova checagem em menos de 3s desse instante
  devolve `permitir: false` (não fechar desta vez) e **consome** a janela — a abertura seguinte
  já volta ao comportamento normal, mesmo ainda dentro dos 3s originais.
- `aplicarAcoesAoAbrir` (popup.js), antes de chamar `window.close()`, consulta
  `PODE_FECHAR_AUTOMATICO`; só fecha se a resposta permitir (falha de comunicação mantém o
  comportamento anterior — fecha, para não regredir o recurso existente).

**Não entra:**
- Qualquer mudança na config `fecharAoPreencher` em si — a exceção é só da reabertura rápida,
  não uma forma de desligar a config permanentemente.
- Persistir esse estado em `browser.storage` — é efêmero, vive só na memória do background
  durante a sessão do worker (reinício = esquece, sem problema).

## Decisões técnicas

- Estado simples (`let` no módulo do background), não em `storage.js`: não é dado do usuário,
  não precisa sobreviver a um reinício, e reduz o escopo do que `storage.js` precisa cobrir.
- Sentinela `null` (não `0`) para "nenhum fechamento recente" — evita ambiguidade com
  `Date.now() === 0`.
- A checagem/gravação acontece **no mesmo request**: quando não há reabertura rápida, já marca
  o instante atual como o próximo "fechamento automático" (pressupõe que, tendo permitido,
  o popup vai de fato fechar em seguida).

## Dependências

- Task 18 (autopreenchimento + `fecharAoPreencher`), task 28 (ações ao abrir no localhost).

## Critérios de aceite (teste manual)

1. Com `fecharAoPreencher` ligado e 1 MFA do domínio: abrir o popup preenche e fecha sozinho.
2. Clicar no ícone de novo em seguida (< 3s): o popup abre e **permanece aberto** desta vez.
3. Esperar mais de 3s e clicar de novo: volta a fechar sozinho normalmente.
4. O mesmo vale no fluxo localhost sem senha mestra.

## Testes automatizados

- `tests/reabertura-rapida.test.js`: primeira chamada permite fechar; uma reabertura a menos
  de 3s não permite (força tela); a janela não empilha (a abertura seguinte já volta ao
  normal); depois de 3s, volta a permitir fechar; funciona sem sessão desbloqueada.

## Riscos / pontos de atenção de segurança

- `PODE_FECHAR_AUTOMATICO` não expõe nem recebe nada sensível — só um timestamp de UX.
