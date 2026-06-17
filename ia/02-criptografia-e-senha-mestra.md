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
- UI da tela de desbloqueio/cadastro (isso é a task 04 — aqui só a lógica/API).
- Armazenamento do registro de cada MFA (task 03).

## Decisões técnicas

- **Derivação de chave**: `PBKDF2` via `crypto.subtle.deriveKey`, com salt aleatório de 16
  bytes gerado uma única vez no primeiro acesso e salvo (não sensível) em
  `browser.storage.local`. Recomenda-se no mínimo 100.000 iterações (ajustar conforme
  performance aceitável no popup).
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

## Riscos / pontos de atenção de segurança

- Nunca logar a senha mestra ou a chave derivada (nem em `console.log` durante
  desenvolvimento).
- Garantir que o valor de controle usado para verificar a senha não revela informação sobre
  os segredos reais.
- Cuidado com o ciclo de vida do service worker em MV3: documentar que a expiração da chave
  por reinício do navegador/descarregamento do worker é um comportamento aceitável e até
  desejável em termos de segurança.
