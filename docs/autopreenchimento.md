# Guia de configuração do autopreenchimento

Este documento explica **como preencher o valor do "Seletor CSS"** do autopreenchimento, de
forma que uma pessoa (ou uma IA assistente) consiga configurá-lo corretamente para qualquer
site.

São dois autopreenchimentos independentes, cada um com o seu próprio liga/desliga:

- **Código (OTP)** — o assunto da maior parte deste guia, das seções abaixo até "Dicas e
  limites".
- **Login (e-mail e senha)** — a seção [Autopreenchimento de login](#autopreenchimento-de-login)
  no fim.

## O que é o valor

O campo de configuração espera um **seletor CSS** — a mesma sintaxe usada em
`document.querySelectorAll(...)`. Ele aponta para o(s) campo(s) `<input>` onde o código de 6
dígitos deve ser digitado na página de login do serviço.

- Padrão de fábrica: `input[autocomplete="one-time-code"]`
  (atributo padronizado que muitos sites usam no campo de OTP).

## Como o preenchimento decide o que fazer

Quando o popup abre e há **exatamente 1 MFA** para o domínio atual, a extensão executa, na
página ativa, `document.querySelectorAll(SEU_SELETOR)` e:

1. **Se casar 1 elemento** → escreve o código inteiro (ex.: `482913`) nesse input.
2. **Se casar vários elementos** e a quantidade for **≥ 6** → trata como "um input por dígito"
   (caixas separadas) e escreve um dígito em cada um dos 6 primeiros.
3. Em ambos os casos dispara os eventos `input`/`change` (para frameworks como React/Vue
   reconhecerem o valor) e, no último campo, dispara `Enter` para tentar enviar o formulário.

> Só o **código de 6 dígitos** é inserido — nunca o segredo. O recurso é opt-in.

## Exemplos prontos

| Situação na página | Seletor recomendado |
|---|---|
| Campo único com o atributo padrão | `input[autocomplete="one-time-code"]` |
| Campo único com `id="otp"` | `#otp` |
| Campo único com `name="code"` | `input[name="code"]` |
| Campo único por classe | `input.codigo-2fa` |
| 6 caixas separadas com a mesma classe | `.otp-box` (precisa casar os 6 inputs) |
| 6 inputs dentro de um container | `#otp-container input` |
| 6 caixas com `id` sequencial (prefixo + contador) | `input[id^="token-input-mfa-"]` |
| Vários candidatos (tenta todos) | `input[autocomplete="one-time-code"], #otp, input[name="code"]` |

Quando cada caixa tem um **`id` único terminado em um contador** (ex.: `token-input-mfa-0`,
`token-input-mfa-1`, … `token-input-mfa-5`), use o seletor de **prefixo** `^=` para casar todas
de uma vez sem listar cada id: `input[id^="token-input-mfa-"]` (lê-se "id que **começa com**"). Os
operadores de substring do CSS também valem: `*=` (contém), `$=` (termina com). A alternativa
explícita — `#token-input-mfa-0, #token-input-mfa-1, …` separados por vírgula — funciona, mas é
mais verbosa.

Para uma única config cobrir **mais de um esquema de `id`** (sites diferentes usam prefixos
diferentes), combine os seletores de prefixo com vírgula:
`input[id^="token-input-mfa-"], input[id^="token-input-token-"]`. Como cada página de login só
tem um dos esquemas, a união casa exatamente as 6 caixas presentes em cada site.

Você pode combinar **múltiplos seletores separados por vírgula** — o `querySelectorAll` casa
todos. Isso é útil para uma config que funcione em mais de um site.

## Como descobrir o seletor de um site

1. Na página de login, clique com o botão direito no campo de código → **Inspecionar**.
2. Veja o `<input>` selecionado no DevTools. Procure, nesta ordem de preferência:
   - um `id` (`<input id="otp">` → use `#otp`);
   - um `name` (`<input name="code">` → use `input[name="code"]`);
   - `autocomplete="one-time-code"` (→ use o padrão);
   - uma classe estável (`<input class="otp-box">` → use `.otp-box`).
3. Para caixas separadas, confirme no DevTools que o seletor casa **todos** os inputs (o
   DevTools mostra quantos elementos casam ao buscar com `Ctrl+F` no painel Elements).

## Dicas e limites

- Prefira seletores **estáveis** (`id`, `name`, `autocomplete`) a classes geradas
  dinamicamente (ex.: `css-1a2b3c`), que mudam a cada build do site.
- Se o seletor casar o **campo errado**, o pior caso é colar o código num input visível — o
  mesmo que você faria manualmente. Ajuste o seletor para ser mais específico.
- Em páginas restritas (`about:`, `file:`) ou sem o campo, o preenchimento falha em silêncio,
  sem atrapalhar o popup.
- A partir da task 23, é possível definir um seletor **por domínio**, além do seletor padrão —
  útil quando cada site usa uma estrutura diferente.

## Resumo para uma IA configurar

> Para configurar, forneça um seletor CSS que case o(s) input(s) do código OTP da página.
> Use 1 seletor para campo único, ou um seletor que case 6 inputs para caixas separadas.
> Pode usar vírgulas para tentar múltiplos. Prefira `#id`, `input[name=...]` ou
> `input[autocomplete="one-time-code"]`. Nunca inclua dados sensíveis no seletor.

## Autopreenchimento de login

Preenche o **e-mail/usuário** e a **senha** da **conta principal** do site (a marcada com o
switch "Principal" na tela de contas). Ligado nas Configurações, roda ao abrir a extensão;
o ícone de conta no card também dispara o preenchimento a qualquer momento.

### Os dois seletores

| Campo | Padrão de fábrica |
|---|---|
| E-mail/usuário | `input[autocomplete="username"], input[type="email"], input[name*="email" i], input[name*="user" i], input[name*="login" i], input[id*="email" i], input[id*="user" i]` |
| Senha | `input[type="password"]` |

Os padrões cobrem a maior parte dos formulários de login. Quando não casarem, defina um
seletor **só para aquele domínio** em "Seletores por domínio" — dá para sobrescrever só um dos
dois campos; o outro continua usando o padrão.

### Como o preenchimento decide

1. Procura o **primeiro campo utilizável** de cada seletor: ignora campos invisíveis,
   desabilitados, somente-leitura e `type="hidden"`.
2. Se o seletor de usuário **não casar nada**, usa o **campo de texto visível imediatamente
   anterior ao campo de senha** dentro do mesmo `<form>` — que é como quase todo login é
   montado. Por isso muitos sites funcionam sem configurar nada.
3. Escreve pelo **setter nativo** de `value` e então dispara `input` e `change`. Formulários
   controlados por framework (React e semelhantes) ignoram uma atribuição direta; por esse
   caminho eles reconhecem o valor.
4. **Não envia o formulário.** O Enter só é disparado se você ligar "Enviar o formulário com
   Enter depois de preencher" — desligado por padrão, porque em algumas páginas o Enter faz
   outra coisa.

### Segurança

A senha **não passa pelo popup**: o popup só informa a aba e o domínio, e quem descriptografa
e injeta na página é o processo de fundo, dono da chave. Em páginas restritas (`about:`,
`file:`) ou sem campos, falha em silêncio.

Duas páginas de exemplo para testar localmente: `examples/login-simples.html` (formato comum)
e `examples/login-campos-atipicos.html` (fallback e overrides).

### Resumo para uma IA configurar

> Forneça dois seletores CSS: um para o campo de usuário/e-mail e outro para o de senha da
> página de login. Prefira `#id` ou `input[name=...]`. Deixe em branco para usar o padrão.
> O preenchimento nunca envia o formulário, a menos que a opção de Enter esteja ligada.
