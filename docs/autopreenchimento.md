# Guia de configuração do autopreenchimento

Este documento explica **como preencher o valor do "Seletor CSS"** do autopreenchimento, de
forma que uma pessoa (ou uma IA assistente) consiga configurá-lo corretamente para qualquer
site.

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
| Vários candidatos (tenta todos) | `input[autocomplete="one-time-code"], #otp, input[name="code"]` |

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
