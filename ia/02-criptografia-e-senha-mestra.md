# 02 — Criptografia e senha mestra

## Objetivo

Implementar o núcleo de segurança do produto: cadastro da senha mestra, derivação de chave de
criptografia, criptografia/descriptografia dos segredos TOTP, e expiração automática da chave
em memória após 2 minutos de inatividade.

## Por que / contexto

Este é o diferencial de segurança do produto. Toda a confiança do usuário em guardar segredos
sensíveis no plug-in depende desta task estar correta. Nenhuma outra task que manipula
segredos (cadastro, edição, geração de código) deve implementar sua própria criptografia —
todas devem reusar este módulo.

## Escopo

**Entra:**
- Fluxo de **primeiro acesso**: usuário define a senha mestra (sem ela ainda não há nada
  cadastrado).
- Derivação de chave de criptografia a partir da senha mestra via **PBKDF2** (Web Crypto
  API), com salt aleatório armazenado (o salt não é segredo, mas é necessário para
  redrivar a mesma chave depois).
- Verificação da senha mestra em acessos seguintes (sem nunca armazenar a senha em si —
  apenas um hash/verificador derivado, ou validação por tentativa de descriptografia de um
  valor de controle).
- Funções `criptografar(segredoEmClaro, chave)` e `descriptografar(segredoCriptografado,
  chave)` usando **AES-GCM**.
- Mecanismo de "sessão" em memória: a chave derivada fica guardada em uma variável do
  `service worker` (background) enquanto o popup estiver em uso.
- Timer de inatividade de **2 minutos**: qualquer interação reinicia o timer; ao expirar, a
  chave é apagada da memória.

**Não entra:**
- UI da tela de desbloqueio/cadastro (isso é a task 05 — aqui só a lógica/API).
- Armazenamento do registro de cada MFA (task 03).
- Rate limiting de tentativas erradas de senha mestra (task 10 dedicada).

## Decisões técnicas

- **Arquitetura de contexto (importante)**: todo o código que manipula a senha mestra, a
  `CryptoKey` derivada, e os segredos TOTP em claro deve rodar **exclusivamente dentro do
  `background.js` (service worker)** — nunca no popup script. O popup é destruído ao perder
  foco (não há estado persistente entre aberturas), e uma `CryptoKey` não-extraível não pode
  ser transferida para outro contexto via `browser.runtime.sendMessage` de qualquer forma —
  isso impossibilitaria tecnicamente cumprir o requisito de "senha mestra em memória por até
  2 minutos entre aberturas do popup" se a chave vivesse no popup. É também a postura de
  segurança correta: o popup script renderiza HTML a partir de dados do usuário (nome,
  domínio) e é a superfície mais exposta a um eventual XSS; manter a chave e os segredos fora
  dele limita o dano de uma falha ali.
  Fluxo de comunicação popup → background via `browser.runtime.sendMessage`:
  - `{ type: 'UNLOCK', senha }` → `{ ok: boolean }`
  - `{ type: 'LIST_MFAS', dominio? }` → lista de metadados (nome, domínio, id — nunca o
    segredo).
  - `{ type: 'GET_CODE', id }` → `{ codigo: string, segundosRestantes: number }` (o
    background descriptografa e calcula o TOTP; o segredo em claro nunca sai do
    `background.js`).
  - `{ type: 'SAVE_MFA', nome, dominio, secret }` → o background criptografa e persiste; o
    `secret` em claro chega até o background só nesta única mensagem, processada e
    descartada imediatamente.
  - `{ type: 'REVEAL_SECRET', id }` → usado exclusivamente pelo fluxo de edição (task 09)
    quando o usuário clica em "mostrar segredo"; resposta pontual, não cacheada no popup.
- **Derivação de chave**: `PBKDF2` via `crypto.subtle.deriveKey`, com salt aleatório de 16
  bytes gerado uma única vez no primeiro acesso e salvo (não sensível) em
  `browser.storage.local`. Hash interno: **SHA-256** (especificar explicitamente o parâmetro
  `hash` em `deriveKey`/`deriveBits`). Iterações: **600.000** (referência OWASP Password
  Storage Cheat Sheet, recomendação atual para PBKDF2-HMAC-SHA256), com um teste de
  performance no popup real (Ubuntu/Firefox) para garantir que o desbloqueio não trava a UI
  por mais de ~500ms-1s; se ultrapassar isso de forma perceptível, rodar a derivação dentro
  do próprio `background.js` (sem o mesmo limite de "responsividade de popup") e mostrar um
  spinner discreto durante a espera.
- **Verificação de senha mestra**: ao cadastrar a senha mestra, criptografar um valor de
  controle conhecido (ex: uma string fixa) com a chave derivada e salvar o resultado. Em
  acessos seguintes, derivar a chave a partir da senha digitada e tentar descriptografar o
  valor de controle — sucesso = senha correta. Isso evita guardar hash de senha
  separadamente.
- **Criptografia dos segredos**: `AES-GCM` via `crypto.subtle.encrypt`/`decrypt`, com um IV
  aleatório de 12 bytes por registro (nunca reusar IV com a mesma chave).
- **Chave em memória**: guardada como `CryptoKey` (não exportável) em uma variável do
  `background.js` (service worker). Como o service worker em Manifest V3 pode ser
  descarregado pelo navegador, isso deve ser levado em conta: se o service worker for
  reiniciado, a chave se perde de qualquer forma (efeito equivalente a expirar) — documentar
  esse comportamento como aceitável (é ainda mais seguro, não menos).
- **Timer de 2 minutos**: implementado com `setTimeout`/`alarms` API do navegador (mais
  confiável que `setTimeout` em service workers que podem suspender). Ao expirar, limpar a
  variável da chave e notificar a UI (se o popup estiver aberto) para voltar à tela de
  desbloqueio.

## Dependências

- Task 01 (setup base) — precisa do `background.js` existente.

## Critérios de aceite (teste manual)

1. No primeiro uso, é possível cadastrar uma senha mestra.
2. Fechar e reabrir o popup dentro de 2 minutos não pede a senha novamente.
3. Esperar mais de 2 minutos sem interação e reabrir o popup — a senha é solicitada de novo.
4. Digitar uma senha mestra errada não dá acesso e mostra erro.
5. Inspecionar `browser.storage.local` via ferramentas de desenvolvedor: a senha mestra em
   claro **nunca** aparece armazenada; apenas salt, valor de controle criptografado e os
   segredos de MFA criptografados.

## Testes automatizados

- Derivar a mesma chave duas vezes a partir da mesma senha + salt deve gerar resultados
  equivalentes (criptografar/descriptografar com sucesso).
- Criptografar e descriptografar um segredo de teste deve retornar o valor original.
- Tentar descriptografar com uma chave derivada de senha errada deve falhar (lançar erro), e
  o código deve tratar isso como "senha incorreta", nunca como sucesso silencioso.
- Testar que dois IVs gerados em chamadas sucessivas de criptografar são diferentes
  (aleatoriedade do IV).
- Teste de que a derivação de chave usa os parâmetros corretos (hash SHA-256, 600.000
  iterações, salt de 16 bytes) — teste de configuração, não só de resultado funcional.
- Teste de que tentar descriptografar um ciphertext válido com o IV trocado por outro IV
  (também válido, mas errado) falha — garante que o IV participa da autenticação AEAD do
  AES-GCM, não é só um valor decorativo.
- Teste de que criptografar/salvar um segredo vazio ou nulo é tratado explicitamente (erro de
  validação) antes de chegar à Web Crypto API.
- Teste do timer de 2 minutos com fake timers: avançar o relógio em 1m59s não expira a chave;
  avançar para 2m01s expira; uma interação que reseta o timer em 1m50s e depois mais 1m30s
  (total 3m20s de relógio, mas só 1m30s desde a última interação) **não** deve expirar — testa
  a lógica de "reset a cada interação", não um timer fixo desde o desbloqueio.
- Teste de concorrência: duas chamadas de "verificar sessão ativa" quase simultâneas (ex: dois
  popups/janelas) não corrompem o estado do timer nem duplicam o agendamento do `alarms`.

## Riscos / pontos de atenção de segurança

- Nunca logar a senha mestra ou a chave derivada (nem em `console.log` durante
  desenvolvimento).
- Garantir que o valor de controle usado para verificar a senha não revela informação sobre
  os segredos reais.
- Cuidado com o ciclo de vida do service worker em MV3: documentar que a expiração da chave
  por reinício do navegador/descarregamento do worker é um comportamento aceitável e até
  desejável em termos de segurança.
- Ao final do uso de qualquer `Uint8Array`/`ArrayBuffer` contendo segredo em claro (resultado
  de `crypto.subtle.decrypt`, ou o valor digitado pelo usuário antes de criptografar), chamar
  `.fill(0)` sobre o buffer antes de descartar a referência. Não é uma garantia absoluta em
  uma linguagem com garbage collector, mas reduz a janela de exposição em memória como defesa
  em profundidade — aplicar de forma consistente em todo lugar que manuseia segredo em claro
  (background.js: geração de TOTP, fluxo de salvar/editar).
- A verificação da senha mestra deve depender exclusivamente do sucesso/falha de
  `crypto.subtle.decrypt` sobre o valor de controle (a tag de autenticação do AES-GCM já é
  verificada internamente pelo navegador, antes de expor qualquer plaintext, em tempo
  constante). Nunca implementar uma comparação manual adicional (ex: comparar strings
  decodificadas) como critério de validação — isso reintroduziria risco de timing attack que
  o uso nativo do AES-GCM já evita.
