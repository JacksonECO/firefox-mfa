# MFA Num Toque

Extensão (plug-in) para **Firefox** que gerencia códigos **MFA / TOTP** (RFC 6238) e as
credenciais do site (**e-mail e senha**), substituindo apps de autenticação externos. Dois
diferenciais norteiam o produto:

1. **Foco no domínio atual** — o popup mostra por padrão só o que é do domínio da aba ativa.
2. **Segurança das chaves** — segredos TOTP e credenciais sempre criptografados em repouso,
   decriptados só em memória, 100% local, sem rede.

O planejamento completo está em [`ia/`](./ia/) (começando por
[`ia/00-resumo-do-projeto.md`](./ia/00-resumo-do-projeto.md)). As regras de segurança e design
estão em [`CLAUDE.md`](./CLAUDE.md).

> **Estado atual:** MVP funcionalmente completo. Senha mestra, cadastro, listagem por domínio,
> geração de TOTP, copiar código, edição/exclusão, rate limiting, versionamento de schema,
> hardening, design system, autopreenchimento, **contas do site (e-mail e senha por domínio)**
> e exportar/importar com seleção de domínios e tipos de dado.

## Como instalar (passo a passo)

A extensão roda como **instalação temporária** no Firefox (não precisa de loja). Não há build
step: o código é carregado direto.

1. Abra o **Firefox** e digite na barra de endereço: `about:debugging#/runtime/this-firefox`
2. Clique em **"Carregar extensão temporária…"**.
3. Navegue até a pasta deste repositório e selecione o arquivo **`manifest.json`**.
4. Pronto: o ícone do **MFA Num Toque** aparece na barra de ferramentas. Se não aparecer, abra
   o menu de extensões (ícone de peça de quebra-cabeça) e fixe-o.

> A instalação temporária some ao **fechar o Firefox** — repita os passos a cada sessão. Se
> editar o código, volte em `about:debugging` e clique em **"Recarregar"**.

## Como usar (passo a passo)

1. **Primeiro acesso — criar a senha mestra.** Clique no ícone da extensão. Defina uma senha
   mestra (mínimo 3 caracteres; um indicador mostra a força com base em tamanho, maiúsculas,
   minúsculas, números e caracteres especiais) e confirme. Ela protege todos os seus códigos e
   **não pode ser recuperada** se esquecida — guarde-a bem.
2. **Cadastrar um MFA.** Na tela principal, clique em **"+ Novo MFA"**. Preencha:
   - **Nome** (obrigatório): ex. "GitHub".
   - **Site (domínio)** (opcional): já vem pré-preenchido com o domínio da aba atual; pode
     editar ou apagar.
   - **Chave (segredo)** (obrigatório): a chave Base32 fornecida pelo serviço (o mesmo texto
     que você usaria em outro app autenticador). Use **"Mostrar"** para conferir.

   Clique em **"Salvar MFA"**.
3. **Ver e copiar o código.** Na tela principal, cada card mostra o código de 6 dígitos e um
   cronômetro (anel) com o tempo restante da janela de 30s. **Clique no código** para copiá-lo
   para a área de transferência — aparece **"Copiado!"**. O código se atualiza sozinho ao
   virar a janela. Se houver **só 1 MFA** para o site, ao abrir o popup o código já é copiado
   automaticamente.
4. **Foco no domínio atual.** Ao abrir o popup em um site, só aparecem os MFAs daquele domínio.
   Se não houver nenhum para o site, a lista completa aparece automaticamente. Use
   **"Ver todos" / "Ver deste site"** para alternar.
5. **Editar ou excluir.** Clique no ícone de lápis (✎) de um card para editar nome, domínio ou
   segredo, ou para **excluir** (com confirmação).
6. **Salvar e-mail e senha do site.** Clique em **"+ E-mail e senha"** (ou, no formulário de um
   MFA, no bloco "E-mail e senha deste site"). Informe o site, o **e-mail ou usuário** e a
   **senha** — e, se quiser, um **rótulo** ("Pessoal", "Trabalho"). Dá para salvar **várias
   contas por site**: o switch **"Principal"** escolhe qual delas o autopreenchimento usa.
   Sites que têm conta salva mostram um **ícone** no card; clicar nele preenche o login na
   página aberta. As senhas ficam criptografadas do mesmo jeito que os segredos MFA e só
   aparecem na tela de edição da conta.
7. **Bloqueio automático.** Após **2 minutos** de inatividade a sessão expira e a senha mestra
   é pedida de novo. Errar a senha repetidamente aplica um atraso progressivo (proteção contra
   força bruta).
8. **Backup (exportar / importar).** Em **"Backup"**, escolha **o que** exportar (códigos MFA,
   contas do site, configurações) e **de quais sites**. Exportar pede **a senha mestra** (é o
   momento em que os dados existem em claro) e uma **senha de exportação** independente, que
   criptografa o arquivo `.json`. Para restaurar (no mesmo Firefox ou em outro), use
   **"Importar"**, selecione o arquivo e informe a senha de exportação.
9. **Configurações.** Em **"Configurações"** (rodapé da tela principal) você pode: ajustar o
   tempo de sessão, a proteção contra tentativas de senha (atrasos), **trocar a senha mestra**
   (recriptografa tudo) e habilitar os **autopreenchimentos** — o do **código** (seletor CSS do
   campo de OTP, com 1 MFA no site) e o de **login** (e-mail e senha da conta principal, que
   por padrão preenche sem enviar o formulário). Como configurar os seletores: veja
   [`docs/autopreenchimento.md`](./docs/autopreenchimento.md).

## Estrutura do projeto

```
/manifest.json        manifest MV3 (permissões mínimas + CSP explícita)
/icons/               ícone da extensão (SVG)
/popup/               UI do popup
    popup.html  popup.js  cards.js  theme.css (tokens)  popup.css
/src/                 lógica (rodando no background quando toca cripto/segredo)
    background.js   roteador de mensagens — dono da crypto e do segredo em claro
    sessao.js       chave em memória + expiração de 2 min + rate limiting
    crypto.js       PBKDF2 + AES-GCM (Web Crypto nativa)
    storage.js      única camada que acessa browser.storage.local
    totp.js         TOTP (RFC 6238) via HMAC-SHA1 nativo
    conta.js        validação das contas do site (e-mail/senha por domínio)
    autofilllogin.js  seletores + função injetada do autopreenchimento de login
    dominio.js  base32.js  cadastro.js  senha.js  listagem.js  codigo.js
    ratelimit.js  backup.js  autofill.js  sessaoconfig.js
/tests/               testes (node:test, sem dependências)
/scripts/             empacotar.sh — gera o .zip
/ia/                  docs de planejamento (uma task por arquivo)
```

## Empacotar (gerar o .zip)

```bash
./scripts/empacotar.sh
```

Gera `web-ext-artifacts/firefox-mfa.zip` com só os arquivos de runtime. Requer o utilitário
`zip` (`sudo apt install zip` no Ubuntu).

## Testes

Rodam com o runner nativo do Node, **sem nenhuma dependência**:

```bash
npm test        # ou: node --test
```

Cobrem criptografia (PBKDF2/AES-GCM), storage/CRUD, sessão (timer de 2 min com fake timers),
TOTP (vetores oficiais do RFC 6238 Apêndice B), listagem por domínio, rate limiting, migração
de schema, contas do site (cifragem, conta principal, localhost), autopreenchimento de login,
exportar/importar com filtro e duas auditorias estáticas (hardening e consistência entre o HTML
e o JS do popup). Requer **Node 20+** (Web Crypto global e `mock.timers`).

## Segurança

- **Tudo local, sem rede.** Nenhum dado sai do navegador; não há telemetria nem CDN.
- **Senha mestra nunca é salva.** Dela deriva-se (PBKDF2-SHA256, 600.000 iterações) uma chave
  AES-GCM que vive **só em memória** do background e expira em 2 min de inatividade.
- **Segredos sempre criptografados em repouso** (AES-GCM, IV aleatório por registro). Só são
  decriptados em memória, no instante de gerar o código.
- **E-mail e senha das contas também são criptografados**, cada campo com o seu próprio IV. A
  listagem de contas decifra só o e-mail (para você distinguir as contas); a senha sai do
  background apenas na tela de edição. No autopreenchimento, quem injeta a senha na página é o
  próprio background — ela nunca passa pelo popup.
- **Exportar exige a senha mestra**, além da senha que criptografa o arquivo, e a verificação
  passa pelo mesmo atraso progressivo do desbloqueio.
- **CSP explícita** no manifest (`script-src 'self'; object-src 'self'`) e **permissões
  mínimas** (veja abaixo).
- **Zero dependências de terceiros.** Toda a criptografia usa a Web Crypto API nativa; o TOTP é
  construído sobre o HMAC-SHA1 nativo — não há lib externa a vendorizar nem risco de
  supply-chain.
- **Isolamento de storage.** `browser.storage.local` é isolado por extensão no modelo de
  segurança do WebExtensions — outra extensão instalada não acessa estes dados.
- **Renderização segura.** `nome`, `dominio`, `rotulo` e `email` (texto livre do usuário) são
  sempre inseridos via `textContent`/DOM API, nunca `innerHTML` — sem XSS via dados armazenados.

### Permissões do manifest

| Permissão        | Para quê                                                            |
|------------------|---------------------------------------------------------------------|
| `storage`        | Guardar (localmente) salt, valor de controle e MFAs criptografados. |
| `alarms`         | Expirar a chave da sessão após 2 min de inatividade.                |
| `activeTab`      | Ler **apenas** o domínio da aba ativa (pré-preencher/filtrar) e injetar o código no autopreenchimento. |
| `clipboardWrite` | Copiar o código de 6 dígitos (clique ou autocópia).                |
| `scripting`      | Autopreenchimento opt-in: inserir o código (nunca o segredo do MFA) e, se você salvar contas, o e-mail e a senha nos campos da página. |

Nenhuma permissão ampla (`tabs` genérica, `<all_urls>`, `http://*/*`).

## Nota de plataforma

O alvo garantido do MVP é **Ubuntu/Linux + Firefox**. No Firefox, o background de uma extensão
MV3 roda como **event page** (`background.scripts`, não-persistente), não como `service_worker`
ao estilo do Chrome — por isso o `manifest.json` usa `background.scripts`. Os docs em `ia/` se
referem ao background como "service worker" pelo papel que ele cumpre; o comportamento é
equivalente. Outros sistemas operacionais/navegadores são trabalho futuro.
