# CLAUDE.md

Guia para agentes de IA e desenvolvedores trabalhando neste repositório. Leia antes de
escrever qualquer código.

## O que é o projeto

Extensão (plug-in) para **Firefox** que gerencia códigos **MFA / TOTP** (RFC 6238),
substituindo apps de autenticação externos. Dois diferenciais norteiam **toda** decisão:

1. **Foco no domínio atual** — o popup mostra por padrão só os MFAs do domínio da aba ativa.
2. **Segurança das chaves** — segredos TOTP **e credenciais do site (e-mail/senha)** sempre
   criptografados em repouso, decriptados só em memória, 100% local, sem rede.

O planejamento completo está em [`ia/`](./ia/), começando por
[`ia/00-resumo-do-projeto.md`](./ia/00-resumo-do-projeto.md) (norte do produto + roadmap das
14 tasks). **Cada task em `ia/` é a fonte de verdade da funcionalidade correspondente** —
consulte o arquivo da task antes de implementá-la.

> Estado atual: MVP implementado. Além dos MFAs, o cofre guarda **contas do site** (e-mail +
> senha por domínio, task 30) e a exportação é seletiva (task 31).

## Stack e estrutura

- **Vanilla JS + Manifest V3**, sem framework de UI e **sem build step / bundler** (superfície
  de ataque mínima, fácil de auditar). JS carregado via ES modules nativos.
- **Web Crypto API nativa** para toda a criptografia (PBKDF2 + AES-GCM). Nunca reimplementar
  primitiva criptográfica à mão.
- Lib leve, auditada e **vendorizada** (copiada para o repo, sem CDN/registry em runtime) para
  o algoritmo TOTP.
- Plataforma alvo obrigatória no MVP: **Ubuntu/Linux**, em **Firefox e Chrome** (codebase
  único; ver `ia/27-suporte-chrome.md`).

**Cross-browser (Firefox + Chrome).** Um só código roda nos dois navegadores. As únicas
divergências são isoladas:
- **Dois manifestos:** `manifest.json` = Firefox (`background.scripts`/event page, ícone SVG);
  `manifest.chrome.json` = Chrome (`background.service_worker`, ícones PNG, sem
  `browser_specific_settings`). O `manifest.json` da raiz é sempre o do Firefox.
- **Shim de namespace:** todo ponto de entrada (`background.js`, `popup.js`, `backup.js`)
  importa **`src/navegador.js` como primeiro import** — ele aponta `browser` → `chrome` no
  Chrome. Use sempre `browser.*` no código (nunca `chrome.*` direto).
- **Empacotar:** `./scripts/empacotar.sh` gera os dois pacotes (com a versão do manifesto no
  nome do `.zip`); aceita `firefox`/`chrome` para um só. O alvo chrome roda
  `scripts/gerar-icones.sh` para rasterizar os PNGs do SVG (sempre que faltarem ou o SVG for
  mais novo que eles).
- **Manter os manifestos em dia:** `version`, `description`, `permissions` e a CSP devem ser
  **idênticos** entre `manifest.json` e `manifest.chrome.json` (só `background` e `icons`/
  `browser_specific_settings` divergem de propósito) — `tests/manifestos.test.js` garante isso.
  Ao mudar um desses campos, atualize os dois manifestos na mesma alteração.

Estrutura de pastas planejada (ver `ia/01`):

```
/manifest.json        manifesto do Firefox (event page)
/manifest.chrome.json manifesto do Chrome (service worker)
/icons/               icon.svg (Firefox) + icon-{16,32,48,128}.png (Chrome, gerados)
/popup/        popup.html, popup.css, popup.js, theme.css   (UI; superfície mais exposta)
/src/
  background.js   service worker — DONO de toda crypto e segredo em claro
  navegador.js    shim browser/chrome (primeiro import de cada entry point)
  storage.js      única camada que toca browser.storage.local
  dominio.js      extrairDominioDaAba(tab) — utilitário compartilhado
  conta.js        validação pura das contas do site (e-mail/senha por domínio)
  autofilllogin.js  seletores + função injetada do autopreenchimento de login
```

## Regras de segurança (inegociáveis)

Segurança é um dos dois diferenciais do produto. Estas regras **não podem ser violadas em
nenhuma task** — uma mudança que comprometa qualquer uma delas está errada:

1. **Nada sensível em disco ou na rede.** Senha mestra, segredo TOTP em claro e a `CryptoKey`
   derivada **nunca** são persistidos nem transmitidos. Em storage só vão: salt, valor de
   controle criptografado, segredos criptografados (AES-GCM) e metadados não sensíveis.
   **Exceção única e explícita (task 26):** MFAs de **localhost** podem ser cadastrados, por
   opção do usuário no cadastro, **sem criptografia** (`secretEmClaro` + `semCriptografia:true`)
   — isso libera vê-los sem a senha mestra, mas é estritamente isolado a localhost (validado no
   background) e nunca se aplica a outros domínios. É um trade-off de conveniência de dev, não
   o caminho padrão. A mesma exceção, com a mesma validação, vale para as **contas do site** de
   localhost (`emailEmClaro`/`senhaEmClaro`, task 30).
2. **Toda crypto vive no `background.js`.** Todo código que toca a senha mestra, a `CryptoKey`
   ou um segredo em claro roda **exclusivamente** no service worker. O popup só troca mensagens
   (`UNLOCK`, `LIST_MFAS`, `GET_CODE`, `SAVE_MFA`, `REVEAL_SECRET`, `LIST_CONTAS`,
   `REVEAL_CONTA`, `AUTOFILL_LOGIN`) — nunca recebe a chave nem o segredo bruto. **A senha de
   uma conta do site sai do background em um ponto só: `REVEAL_CONTA`** (formulário de edição,
   mesma exceção deliberada do `REVEAL_SECRET`); no autopreenchimento quem injeta na aba é o
   próprio background, para a senha não passar pelo popup. Motivo técnico: o popup é destruído ao perder foco e uma `CryptoKey`
   não-extraível não atravessa `runtime.sendMessage`. Motivo de segurança: o popup renderiza
   dados do usuário e é a maior superfície de XSS.
3. **Derivação de chave forte.** PBKDF2 com **SHA-256** e **600.000 iterações** (OWASP), salt
   aleatório de 16 bytes. AES-GCM com **IV aleatório de 12 bytes por registro** — nunca reusar
   IV com a mesma chave. Numa conta do site, e-mail e senha são campos cifrados separados, cada
   um com o **seu próprio IV**.
4. **Verificação timing-safe.** Validar a senha mestra apenas pelo sucesso/falha do
   `crypto.subtle.decrypt` sobre o valor de controle (a tag AES-GCM é checada em tempo
   constante pelo navegador). **Nunca** comparar strings manualmente como critério de validação.
5. **Sanitização: `textContent`, nunca `innerHTML`.** `nome`, `dominio`, `rotulo` e `email` são
   texto livre do usuário. Ao renderizar, usar exclusivamente `textContent` / DOM API programática. Um nome
   contendo `<script>` deve aparecer como texto literal. Os caracteres especiais são aceitos na
   entrada — a defesa é na renderização, não bloqueando a digitação.
6. **Rate limiting é MVP.** Atraso progressivo após tentativas erradas de senha mestra
   (contador persistido, controlado no background) faz parte do MVP de segurança, não é
   polimento futuro.
7. **Chave em memória expira.** A `CryptoKey` vive só em memória do background e expira após
   **2 minutos de inatividade** (timer resetado a cada interação, via `alarms`). Reinício do
   service worker = expiração (aceitável e até desejável). **Enquanto o popup está aberto a
   sessão não expira** (keep-alive por uma porta `runtime.connect` de longa duração): o usuário
   pode demorar preenchendo um cadastro sem perder a sessão; a janela de 2 min só (re)começa
   quando o popup fecha (porta desconecta). **Com o popup fechado, um heartbeat de 20s
   (`runtime.getPlatformInfo`) mantém o event page vivo até faltarem ~30s para o timeout** —
   senão o Firefox suspenderia o background em ~30s e a chave morreria antes do tempo
   configurado. Nos últimos 30s o heartbeat para, deixando o Firefox suspender o worker
   naturalmente (~30s depois do último toque) bem no fim da janela — assim a sessão não
   sobrevive além do timeout configurado.
8. **Zeroing best-effort.** Chamar `.fill(0)` em `Uint8Array`/`ArrayBuffer` com segredo em
   claro após o uso. Não é garantia absoluta (GC), mas reduz a janela de exposição.
9. **Sem logs de segredo.** Nunca `console.log` de senha mestra, chave ou segredo em claro —
   nem em desenvolvimento. Sem telemetria.
10. **Menor privilégio.** `permissions` do manifest é exatamente `storage`, `activeTab`,
    `clipboardWrite`, `alarms` e `scripting` (este último só para o autopreenchimento opt-in da
    task 18, que injeta o código de 6 dígitos — nunca o segredo — na aba ativa via `activeTab`).
    Nada de `tabs` genérica, `<all_urls>` ou `http://*/*`. CSP explícita
    (`script-src 'self'; object-src 'self'`).

## Regras de design (UI)

- Visual **arredondado, sóbrio e futurista** — nunca datado (sem bordas 3D, gradientes
  pesados, sombras exageradas, ícones pixelados).
- **Tokens centralizados** em CSS custom properties (`popup/theme.css`): cores, raios,
  espaçamentos (escala de 4px), tipografia. Componentes usam as variáveis, nunca valores
  hardcoded.
- **Fonte do sistema** e **ícones SVG inline** — nada carregado por rede (reforça offline-first).
- Tema claro/escuro automático via `prefers-color-scheme` (sem toggle manual no MVP).
- Acessibilidade: contraste adequado e foco de teclado sempre visível.
- Detalhes completos em [`ia/13-design-system-visual.md`](./ia/13-design-system-visual.md).

## Modelo de dados

Registro de MFA — coleção `mfaItems` (ver `ia/03`):

```js
{
  id: string,                  // uuid
  nome: string,                // obrigatório
  dominio: string | null,      // opcional
  secretCriptografado: string, // base64 do ciphertext AES-GCM
  iv: string,                  // base64 do IV deste registro
  createdAt: number,
  updatedAt: number,
}
```

Conta do site — coleção `credItems` (ver `ia/30`):

```js
{
  id: string,                  // uuid
  dominio: string,             // OBRIGATÓRIO — é a chave de vínculo com o site
  rotulo: string | null,       // opcional ("Pessoal", "Trabalho")
  emailCriptografado: string,  // base64 do ciphertext AES-GCM
  ivEmail: string,             // base64, IV próprio
  senhaCriptografada: string,  // base64 do ciphertext AES-GCM
  ivSenha: string,             // base64, IV próprio (nunca igual ao do e-mail)
  principal: boolean,          // exatamente uma por domínio
  createdAt: number,
  updatedAt: number,
}
```

- `src/storage.js` é a **única** parte do código que acessa `browser.storage.local` direto.
- Comparação de domínio é **exata** (`www.x.com` ≠ `x.com`); `hostname` já vem minúsculo do
  parser nativo de URL.
- **Exatamente uma conta principal por domínio** é uma invariante do storage, não da UI:
  criar a primeira promove; excluir a principal promove a mais antiga restante; importar um
  backup nunca rouba a principal de quem já tem uma.
- `schemaVersion` (metadado não sensível) versiona o schema para migrações futuras (ver
  `ia/11`). A v2 introduziu `credItems`.

## Testes

- Testar com **mocks** de `browser.storage.local`, `navigator.clipboard.writeText` e
  **fake timers** (sessão de 2 min, janela de 30s).
- TOTP: usar os **vetores oficiais do RFC 6238 Apêndice B** (segredo
  `12345678901234567890` → Base32 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`), lembrando que o RFC
  mostra 8 dígitos e o produto trunca para 6.
- Cobrir bordas: IV trocado deve falhar; fronteira exata da janela de 30s; domínios com porta,
  IP literal, subdomínio, case e aba sem `url`; falha de clipboard não deve mostrar "copiado";
  renderização de `nome`/`dominio` com markup deve usar `textContent`.
- Contas: nada em claro no storage, IVs distintos por campo, a invariante de conta principal em
  todas as escritas (criar, trocar, excluir, mudar de domínio, importar) e o fato de que uma
  listagem **nunca** devolve a senha.
- Sem build step e sem DOM nos testes, `popup-estrutura.test.js` confere que todo id usado no
  JS existe no HTML — um rename quebraria a tela só em runtime.
- Cada task em `ia/` lista seus critérios de aceite manuais e testes automatizados — siga-os.

## Convenções de trabalho

- O conteúdo do projeto (docs, UI, comentários) está em **português**. Mantenha o idioma.
- Antes de implementar uma task, **leia o arquivo correspondente em `ia/`**; ele tem escopo,
  decisões técnicas, dependências e testes.
- Respeite a ordem do roadmap: a task 04 (cadastro) é o primeiro marco com dados reais; as
  demais telas dependem dela para teste manual.
- `git add` de arquivos específicos (nunca `-A`). Não criar PR sem pedido explícito.
