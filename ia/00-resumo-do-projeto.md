# 00 — Resumo do projeto: Firefox MFA Manager

## O que é

Um plug-in (extensão) para o Firefox que gerencia códigos MFA (TOTP — Time-based One-Time
Password), substituindo apps externos de autenticação. O foco é resolver dois problemas que
apps de MFA tradicionais não resolvem bem: **perda de tempo procurando o código certo** e
**risco de exposição das chaves secretas**.

## Os dois diferenciais (norte do produto)

Toda decisão de implementação deve ser avaliada contra estes dois pontos. Se uma escolha
técnica compromete qualquer um deles, ela está errada.

### 1. Foco no domínio atual

Ao abrir o popup da extensão, por padrão **só aparecem os MFAs cadastrados para o mesmo
domínio do site aberto na aba ativa**. Não é preciso rolar uma lista gigante procurando o
serviço certo — o plug-in já sabe em qual site você está e mostra o que importa.

A lista completa de todos os MFAs cadastrados só aparece em dois casos:
- Não existe nenhum MFA cadastrado para o domínio atual (não há nada específico para
  mostrar, então mostra tudo).
- O usuário clica explicitamente no botão "Ver todos".

### 2. Segurança das chaves (criptografia ponta a ponta no dispositivo)

- Os segredos TOTP nunca são salvos em texto puro. Ficam sempre criptografados em
  `browser.storage.local` (sem qualquer sincronização ou chamada de rede).
- A criptografia usa uma **senha mestra** definida pelo usuário no primeiro acesso. Essa
  senha nunca é salva — apenas usada para derivar uma chave de criptografia em memória
  (PBKDF2 + AES-GCM via Web Crypto API).
- A chave derivada vive **somente em memória** e expira automaticamente após **2 minutos de
  inatividade**. Depois disso, é preciso digitar a senha mestra novamente.
- A descriptografia do segredo e a geração do código de 6 dígitos acontecem inteiramente em
  memória, no momento de exibir o card — nunca persistido em claro em disco.

## Stack técnica

- **Vanilla JS + Manifest V3**, sem framework de UI e sem build step (extensão simples,
  pequena, fácil de auditar — menor superfície de ataque).
- **Web Crypto API nativa** do navegador para toda a criptografia (PBKDF2 para derivação de
  chave a partir da senha mestra, AES-GCM para criptografar/descriptografar os segredos).
- Lib leve e auditada para o algoritmo **TOTP (RFC 6238)**, evitando reimplementar primitivas
  criptográficas por conta própria.
- Plataforma alvo obrigatória no MVP: **Ubuntu/Linux + Firefox** (clipboard, UI, etc). Outros
  sistemas operacionais ficam como evolução futura, documentada quando relevante.

## Glossário

- **MFA**: Multi-Factor Authentication — neste projeto, especificamente o segundo fator via
  código numérico temporário (TOTP).
- **TOTP**: Time-based One-Time Password — algoritmo (RFC 6238) que gera um código de 6
  dígitos válido por uma janela de tempo (30s), a partir de um segredo compartilhado.
- **Domínio**: o host do site (ex: `github.com`), usado para relacionar um MFA cadastrado ao
  site onde ele é usado.
- **Senha mestra**: senha definida pelo usuário, usada apenas para derivar a chave de
  criptografia/descriptografia. Nunca é armazenada.
- **Card de MFA**: componente visual que representa um MFA cadastrado (nome, domínio
  opcional, código atual, cronômetro, ação de copiar, ação de editar).

## Modelo de dados (visão geral)

Cada MFA cadastrado guarda:
- `id`
- `nome` (obrigatório)
- `dominio` (opcional)
- `secretCriptografado` + metadados de criptografia (iv/salt)
- `createdAt` / `updatedAt`

Detalhes completos na task `03-modelo-de-dados-e-armazenamento.md`.

## Roadmap / índice de tasks

A ordem abaixo é a ordem recomendada de implementação. Cada arquivo é autocontido e descreve
uma única funcionalidade.

| # | Task | Resumo |
|---|------|--------|
| 01 | [Setup da extensão base](./01-setup-extensao-base.md) | Estrutura do projeto, manifest.json, popup base |
| 02 | [Criptografia e senha mestra](./02-criptografia-e-senha-mestra.md) | Derivação de chave (PBKDF2/AES-GCM), arquitetura popup/background, expiração em 2min |
| 03 | [Modelo de dados e armazenamento](./03-modelo-de-dados-e-armazenamento.md) | Schema e camada de acesso ao storage local |
| 04 | [Cadastro de novo MFA](./04-cadastro-novo-mfa.md) | Formulário de criação (nome, site opcional, key) — primeiro marco testável |
| 05 | [Tela de desbloqueio](./05-tela-de-desbloqueio.md) | Cadastro/validação da senha mestra ao abrir o popup |
| 06 | [Tela principal — listagem por domínio](./06-tela-principal-listagem-por-dominio.md) | Filtro por domínio atual + botão "ver todos" |
| 07 | [Geração de código TOTP e cronômetro](./07-geracao-codigo-totp-e-cronometro.md) | Código de 6 dígitos + contagem de 30s |
| 08 | [Card de MFA e copiar para clipboard](./08-card-mfa-copiar-clipboard.md) | UI do card + copiar com um clique (Ubuntu/Linux) |
| 09 | [Edição e exclusão de MFA](./09-edicao-e-exclusao-mfa.md) | Editar/remover um MFA existente |
| 10 | [Rate limiting de senha mestra](./10-rate-limiting-senha-mestra.md) | Atraso progressivo contra força bruta local |
| 11 | [Versionamento e migração de schema](./11-versionamento-schema.md) | `schemaVersion` + migração incremental |
| 12 | [Hardening: CSP, permissões e isolamento](./12-hardening-csp-permissoes.md) | Auditoria final de segurança do MVP |
| 13 | [Design system visual](./13-design-system-visual.md) | Estilo arredondado, sóbrio e futurista |
| 14 | [(Futuro) Exportar/Importar dados](./14-futuro-exportar-importar-dados.md) | Backup criptografado com senha própria |
| 15 | [Autocópia de MFA único](./15-autocopiar-mfa-unico.md) | Copia o código ao abrir se houver 1 MFA do domínio; ordena ao listar todos |
| 16 | [Tela de configurações + rate limit configurável](./16-tela-de-configuracoes.md) | Ajustes do atraso progressivo de senha mestra |
| 17 | [Trocar a senha mestra](./17-trocar-senha-mestra.md) | Re-deriva a chave e recriptografa todos os segredos |
| 18 | [Autopreenchimento na página](./18-autopreenchimento-na-pagina.md) | Insere o código no campo do site (opt-in, via seletor) |
| 19 | [Correção: overlay preso na 1ª abertura](./19-fix-overlay-hidden.md) | `[hidden]` deixava de esconder diálogos/feedback |
| 20 | [Correção: importação em aba dedicada](./20-fix-importacao-aba.md) | Seletor de arquivo fechava o popup; backup vai p/ aba |
| 21 | [Tempo de sessão configurável](./21-tempo-de-sessao-configuravel.md) | Ajusta o tempo de relogin por inatividade |
| 22 | [Doc do autopreenchimento](./22-doc-autopreenchimento.md) | Guia de configuração do seletor CSS |

## Princípios que não devem ser violados em nenhuma task

1. Nenhum dado sensível (senha mestra, segredo TOTP em claro, chave derivada) é persistido em
   disco ou enviado pela rede — em nenhum momento.
2. A UI sempre prioriza o domínio atual antes de mostrar qualquer outra coisa.
3. Tudo funciona 100% offline.
4. O visual é sempre arredondado, sóbrio e futurista — nunca com aparência datada.
5. Rate limiting de tentativas de senha mestra, Content Security Policy explícita e
   sanitização de dados do usuário (`textContent`, nunca `innerHTML`) são parte do MVP de
   segurança, não polimento opcional a ser feito "depois".
