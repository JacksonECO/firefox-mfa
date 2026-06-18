# 10 — Rate limiting de tentativas de senha mestra

> **Parte do MVP de segurança, não uma melhoria futura.** Segurança é um dos dois
> diferenciais centrais do produto ("protegidas de qualquer invasor") — um cofre local sem
> nenhuma fricção contra tentativas repetidas de adivinhar a senha mestra deixaria essa
> promessa incompleta.

## Objetivo

Introduzir um atraso progressivo após tentativas erradas consecutivas de senha mestra na
tela de desbloqueio (task 05), dificultando ataques de força bruta local.

## Por que / contexto

Como é um cofre 100% local (sem rede), o principal vetor de ataque é alguém com acesso
físico/local ao perfil do navegador (outra pessoa usando a máquina, malware local) tentando
adivinhar a senha mestra repetidamente, sem nenhum limite de tentativas por segundo. Um
atraso progressivo é uma medida simples e de baixo custo que aumenta significativamente o
tempo necessário para qualquer tentativa de força bruta.

## Escopo

**Entra:**
- Contador de tentativas erradas consecutivas, persistido (não sensível) em
  `browser.storage.local`.
- Tabela de atraso progressivo aplicada no `background.js` antes de processar a próxima
  tentativa de desbloqueio.
- Reset do contador a zero a cada tentativa correta.
- O atraso é aplicado mesmo que o popup seja fechado e reaberto entre tentativas (por isso o
  contador vive no background/storage, não em uma variável do popup).

**Não entra:**
- Qualquer bloqueio permanente da extensão — não existe conceito de "conta" para travar, e
  travar permanentemente um cofre local prejudicaria o usuário legítimo que só errou a senha
  várias vezes.

## Decisões técnicas

- Tabela de atraso (ajustável, mas como referência inicial):
  - 1ª–3ª tentativa errada consecutiva: sem atraso.
  - 4ª–6ª: atraso de 1s antes de processar a tentativa.
  - 7ª–10ª: atraso de 5s.
  - Acima de 10 tentativas erradas consecutivas: atraso de 30s (não cresce indefinidamente —
    mantém esse teto como defesa em profundidade razoável sem travar o uso legítimo
    indefinidamente).
- Contador armazenado junto aos metadados não sensíveis (ex: `mfaUnlockAttempts: number`,
  `mfaUnlockLastAttemptAt: number`), no mesmo módulo de storage da task 03.
- O atraso é implementado como uma `Promise` que resolve após o tempo da tabela antes de
  chamar a lógica de verificação da senha (task 02) — a UI da task 05 deve mostrar um
  indicador (ex: botão desabilitado/spinner) durante esse atraso, para não parecer que a
  extensão travou.
- O reset do contador acontece apenas após confirmação de sucesso pela task 02 (decrypt do
  valor de controle bem-sucedido).

## Dependências

- Task 02 (criptografia e senha mestra) — fornece a verificação cujo resultado alimenta o
  contador.
- Task 05 (tela de desbloqueio) — onde o atraso é percebido pelo usuário.

## Critérios de aceite (teste manual)

1. Errar a senha mestra de 1 a 3 vezes: nenhum atraso perceptível entre tentativas.
2. Errar de 4 a 6 vezes: cada tentativa subsequente leva ~1s para responder.
3. Errar de 7 a 10 vezes: cada tentativa leva ~5s.
4. Errar mais de 10 vezes: cada tentativa leva ~30s.
5. Fechar e reabrir o popup no meio da sequência de erros não reseta o contador — o atraso
   continua a partir de onde estava.
6. Acertar a senha em qualquer ponto da sequência: acesso liberado normalmente, e uma nova
   sequência de erros recomeça do zero (sem atraso nas primeiras tentativas).

## Testes automatizados

- Teste da função de cálculo de atraso dado um número de tentativas erradas consecutivas,
  cobrindo as quatro faixas da tabela.
- Teste de que uma tentativa correta no meio de uma sequência de erros reseta o contador para
  zero.
- Teste de que o contador persiste corretamente entre "reaberturas" simuladas (mock de
  storage mantendo o valor entre chamadas).

## Riscos / pontos de atenção de segurança

- Garantir que o contador e o timestamp da última tentativa não sejam manipuláveis pelo
  popup script diretamente — toda a lógica de incrementar/resetar e calcular o atraso deve
  viver no `background.js`, consistente com a arquitetura definida na task 02.
- Não logar a senha tentada (correta ou incorreta) em nenhum momento, mesmo durante o
  controle de tentativas.
