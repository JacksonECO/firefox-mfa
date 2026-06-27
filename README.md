# MFA Num Toque

Extensão (plug-in) para **Firefox** e **Chrome** que gerencia códigos **MFA / TOTP**
(RFC 6238), substituindo apps de autenticação externos. Dois diferenciais norteiam o produto:

1. **Foco no domínio atual** — o popup mostra por padrão só os MFAs do domínio da aba ativa.
2. **Segurança das chaves** — segredos TOTP sempre criptografados em repouso, decriptados só
   em memória, 100% local, sem rede.

O planejamento completo está em [`ia/`](./ia/) (começando por
[`ia/00-resumo-do-projeto.md`](./ia/00-resumo-do-projeto.md)). As regras de segurança e design
estão em [`CLAUDE.md`](./CLAUDE.md).

> **Estado atual:** MVP funcionalmente completo (tasks 01–14). Senha mestra, cadastro,
> listagem por domínio, geração de TOTP, copiar código, edição/exclusão, rate limiting,
> versionamento de schema, hardening, design system e exportar/importar.

## Como instalar (passo a passo)

Não há build step: o código é carregado direto. O **mesmo código** roda nos dois navegadores —
a diferença é só qual manifesto cada um usa (`manifest.json` no Firefox, `manifest.chrome.json`
no Chrome, montado por `scripts/empacotar.sh chrome`).

### Firefox (instalação temporária)

1. Abra o **Firefox** e digite na barra de endereço: `about:debugging#/runtime/this-firefox`
2. Clique em **"Carregar extensão temporária…"**.
3. Navegue até a pasta deste repositório e selecione o arquivo **`manifest.json`**.
4. Pronto: o ícone do **MFA Num Toque** aparece na barra de ferramentas. Se não aparecer, abra
   o menu de extensões (ícone de peça de quebra-cabeça) e fixe-o.

> A instalação temporária some ao **fechar o Firefox** — repita os passos a cada sessão. Se
> editar o código, volte em `about:debugging` e clique em **"Recarregar"**.

### Chrome (Load unpacked)

O Chrome exige `manifest.json` na raiz do pacote (com `service_worker` e ícones PNG). O script
monta isso para você:

1. Gere a pasta do Chrome: `npm run empacotar:chrome` (gera os ícones PNG e
   `web-ext-artifacts/chrome-build/`).
2. Abra o **Chrome** em `chrome://extensions` e ative o **"Modo desenvolvedor"** (canto
   superior direito).
3. Clique em **"Carregar sem compactação"** e selecione a pasta
   **`web-ext-artifacts/chrome-build/`**.
4. O ícone do **MFA Num Toque** aparece na barra. Após editar o código, rode o comando de novo
   e clique em **"Atualizar"** na página de extensões.

## Como usar (passo a passo)

1. **Primeiro acesso — criar a senha mestra.** Clique no ícone da extensão. Defina uma senha
   mestra (mínimo 3 caracteres; um indicador mostra a força com base em tamanho, maiúsculas,
   minúsculas, números e caracteres especiais) e confirme. Ela protege todos os seus códigos e
   **não pode ser recuperada** se esquecida — guarde-a bem.
2. **Cadastrar um MFA.** Na tela principal, clique em **"+ Adicionar novo"**. Preencha:
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
6. **Bloqueio automático.** Após **2 minutos** de inatividade a sessão expira e a senha mestra
   é pedida de novo. Errar a senha repetidamente aplica um atraso progressivo (proteção contra
   força bruta).
7. **Backup (exportar / importar).** Na tela principal, em **"Exportar"**, defina uma senha de
   exportação (independente da senha mestra) e baixe o arquivo `.json` criptografado. Para
   restaurar (no mesmo Firefox ou em outro), use **"Importar"**, selecione o arquivo e informe
   a senha de exportação.
8. **Configurações.** Em **"Configurações"** (rodapé da tela principal) você pode: ajustar o
   tempo de sessão, a proteção contra tentativas de senha (atrasos), **trocar a senha mestra**
   (recriptografa tudo) e habilitar o **autopreenchimento** — informando um seletor CSS do
   campo de código do site para que, com 1 MFA, o código seja inserido e enviado
   automaticamente. Como configurar o seletor: veja
   [`docs/autopreenchimento.md`](./docs/autopreenchimento.md).

## Estrutura do projeto

```
/manifest.json        manifest MV3 do Firefox (event page; permissões mínimas + CSP)
/manifest.chrome.json manifest MV3 do Chrome (service worker; ícones PNG)
/icons/               ícone da extensão (SVG para Firefox; PNGs gerados para o Chrome)
/popup/               UI do popup
    popup.html  popup.js  cards.js  theme.css (tokens)  popup.css
/src/                 lógica (rodando no background quando toca cripto/segredo)
    background.js   roteador de mensagens — dono da crypto e do segredo em claro
    navegador.js    shim browser/chrome (primeiro import de cada entry point)
    sessao.js       chave em memória + expiração de 2 min + rate limiting
    crypto.js       PBKDF2 + AES-GCM (Web Crypto nativa)
    storage.js      única camada que acessa browser.storage.local
    totp.js         TOTP (RFC 6238) via HMAC-SHA1 nativo
    dominio.js  base32.js  cadastro.js  senha.js  listagem.js  codigo.js
    ratelimit.js  backup.js
/tests/               testes (node:test, sem dependências)
/scripts/             empacotar.sh (gera os .zip)  gerar-icones.sh (PNGs do Chrome)
/ia/                  docs de planejamento (uma task por arquivo)
```

## Empacotar (gerar o .zip)

```bash
npm run empacotar           # gera AMBOS (Firefox + Chrome); ou: ./scripts/empacotar.sh
npm run empacotar:firefox   # só Firefox
npm run empacotar:chrome    # só Chrome (gera os ícones PNG automaticamente)
```

A versão da extensão (lida do manifesto) entra no nome do `.zip`:

- **Firefox** → `web-ext-artifacts/firefox-mfa-<versao>.zip` (usa `manifest.json`, ícone SVG).
- **Chrome** → `web-ext-artifacts/chrome-build/` (pasta p/ Load unpacked) e
  `web-ext-artifacts/chrome-mfa-<versao>.zip` (artefato p/ Chrome Web Store; usa
  `manifest.chrome.json` renomeado para `manifest.json` na raiz, com `service_worker` e PNGs).

Requer o utilitário `zip` (`sudo apt install zip` no Ubuntu). Os ícones PNG do Chrome são
rasterizados de `icons/icon.svg` por `scripts/gerar-icones.sh` (usa `rsvg-convert`/`inkscape`/
ImageMagick ou, em último caso, Chrome/Chromium headless).

## Testes

Rodam com o runner nativo do Node, **sem nenhuma dependência**:

```bash
npm test        # ou: node --test
```

Cobrem criptografia (PBKDF2/AES-GCM), storage/CRUD, sessão (timer de 2 min com fake timers),
TOTP (vetores oficiais do RFC 6238 Apêndice B), listagem por domínio, rate limiting, migração
de schema, exportar/importar e uma auditoria estática de hardening. Requer **Node 20+**
(Web Crypto global e `mock.timers`).

## Segurança

- **Tudo local, sem rede.** Nenhum dado sai do navegador; não há telemetria nem CDN.
- **Senha mestra nunca é salva.** Dela deriva-se (PBKDF2-SHA256, 600.000 iterações) uma chave
  AES-GCM que vive **só em memória** do background e expira em 2 min de inatividade.
- **Segredos sempre criptografados em repouso** (AES-GCM, IV aleatório por registro). Só são
  decriptados em memória, no instante de gerar o código.
- **CSP explícita** no manifest (`script-src 'self'; object-src 'self'`) e **permissões
  mínimas** (veja abaixo).
- **Zero dependências de terceiros.** Toda a criptografia usa a Web Crypto API nativa; o TOTP é
  construído sobre o HMAC-SHA1 nativo — não há lib externa a vendorizar nem risco de
  supply-chain.
- **Isolamento de storage.** `browser.storage.local` é isolado por extensão no modelo de
  segurança do WebExtensions — outra extensão instalada não acessa estes dados.
- **Renderização segura.** `nome`/`dominio` (texto livre do usuário) são sempre inseridos via
  `textContent`/DOM API, nunca `innerHTML` — sem XSS via dados armazenados.

### Permissões do manifest

| Permissão        | Para quê                                                            |
|------------------|---------------------------------------------------------------------|
| `storage`        | Guardar (localmente) salt, valor de controle e MFAs criptografados. |
| `alarms`         | Expirar a chave da sessão após 2 min de inatividade.                |
| `activeTab`      | Ler **apenas** o domínio da aba ativa (pré-preencher/filtrar) e injetar o código no autopreenchimento. |
| `clipboardWrite` | Copiar o código de 6 dígitos (clique ou autocópia).                |
| `scripting`      | Autopreenchimento opt-in: inserir o código (nunca o segredo) no campo da página. |

Nenhuma permissão ampla (`tabs` genérica, `<all_urls>`, `http://*/*`).

## Nota de plataforma

O alvo garantido do MVP é **Ubuntu/Linux**, em **Firefox** e **Chrome**, a partir de um único
código (ver [`ia/27-suporte-chrome.md`](./ia/27-suporte-chrome.md)). A diferença entre os
navegadores é mínima e isolada: o Firefox roda o background como **event page**
(`manifest.json` → `background.scripts`) e o Chrome como **service worker**
(`manifest.chrome.json` → `background.service_worker`); o namespace `browser.*`/`chrome.*` é
unificado pelo shim `src/navegador.js`; e os ícones SVG (Firefox) viram PNG no Chrome. Os docs
em `ia/` se referem ao background como "service worker" pelo papel que ele cumpre; o
comportamento é equivalente nos dois. Outros sistemas operacionais são trabalho futuro.
