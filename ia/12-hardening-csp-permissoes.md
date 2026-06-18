# 12 — Hardening: Content Security Policy, permissões mínimas e isolamento

## Objetivo

Consolidar e auditar, ao final da implementação funcional, as medidas de hardening da
extensão: Content Security Policy explícita, revisão de permissões mínimas no manifest,
confirmação de isolamento de storage entre extensões, e garantia de que nenhuma dependência
externa é carregada via rede.

## Por que / contexto

O segundo diferencial do produto é segurança ("protegidas de qualquer invasor"). Várias
decisões de hardening não têm um dono natural em nenhuma task funcional específica — esta
task existe para que nenhuma delas seja esquecida, e para servir de checklist final antes de
considerar o MVP pronto para uso real (não só funcionalmente completo).

## Escopo

**Entra:**
- Declarar explicitamente `content_security_policy` no `manifest.json` para
  `extension_pages`, recusando scripts inline e `eval`/`new Function` (ex:
  `"script-src 'self'; object-src 'self'"`), e confirmar que toda a aplicação (incluindo a
  lib de TOTP escolhida na task 07) funciona sob essa política sem violações no console.
- Auditoria final da lista de `permissions` do manifest: confirmar que é exatamente
  `storage`, `activeTab`, `clipboardWrite`, `alarms` — nenhuma permissão mais ampla
  (`tabs` genérica, `<all_urls>`, `http://*/*`) foi introduzida acidentalmente ao longo do
  desenvolvimento.
- Confirmar e documentar que `browser.storage.local` é isolado por extensão no Firefox (uma
  extensão maliciosa instalada no mesmo navegador não tem acesso ao storage desta extensão
  por padrão do modelo de segurança do WebExtensions) — é uma garantia da plataforma, mas
  deve ser verificada/documentada, não assumida implicitamente.
- Confirmar que a lib de TOTP (e qualquer outra dependência) está **vendorizada** (copiada
  para dentro do repositório, sem `import` de CDN ou registry remoto em tempo de execução) —
  elimina risco de supply-chain via comprometimento de um CDN ou do pacote após a instalação.
- Revisão de que toda manipulação de dados do usuário (`nome`, `dominio`) na renderização usa
  `textContent`/DOM API programática, nunca `innerHTML` (auditoria cruzada com as tasks 06 e
  08, que já devem ter essa prática aplicada — esta task valida, não reimplementa).
- Garantir que nenhum dado sensível (senha mestra, segredo em claro, `CryptoKey`) atravessa
  `console.log`, mensagens de erro genéricas expostas na UI, ou qualquer telemetria (não há
  telemetria no produto, mas vale confirmar essa ausência explicitamente).

**Não entra:**
- Reimplementar qualquer lógica funcional — esta task só audita e corrige o que já foi
  construído nas tasks 01–09.

## Decisões técnicas

- Usar o painel de console do Firefox (`about:debugging`) durante testes manuais para
  confirmar ausência de qualquer warning de CSP.
- Documentar no `README.md` a lista final de permissões e a justificativa de cada uma (boa
  prática para revisão futura por terceiros/auditoria da extensão, e também útil no processo
  de revisão de lojas de extensão como o addons.mozilla.org).

## Dependências

- Tasks 01, 02, 04, 06, 07, 08, 09 — esta task audita o resultado de todas elas. Deve ser
  executada como uma passada final, mas o critério de CSP/permissões mínimas deve ser
  vigiado desde a task 01 (não é só um retrofit no fim).

## Critérios de aceite (teste manual)

1. O manifest declara uma CSP explícita e a extensão funciona normalmente sob essa política
   (sem warnings no console do `about:debugging`).
2. A lista de permissões do manifest final é exatamente a esperada, sem nenhuma adição não
   documentada/justificada.
3. Inspecionar o pacote final (`.zip`) da extensão confirma que não há nenhuma referência a
   URLs externas/CDN em nenhum arquivo JS/HTML/CSS.
4. Buscar por `innerHTML` em todo o código-fonte retorna zero ocorrências que envolvam dados
   do usuário (`nome`, `dominio`) — pode haver `innerHTML` para markup estático controlado
   pelo próprio código, mas nunca interpolando dados do usuário.

## Testes automatizados

- Teste estático (lint/grep automatizado em CI, se houver pipeline) que falha se houver uso
  de `innerHTML` ou `eval`/`new Function` em qualquer arquivo do popup/background.
- Teste de parse do `manifest.json` confirmando a lista exata de `permissions` esperada
  (evita regressão silenciosa de alguém adicionar uma permissão ampla sem notar).

## Riscos / pontos de atenção

- Esta task tende a ser negligenciada por "não ter UI nova para mostrar" — ela é obrigatória
  para considerar o MVP completo, não opcional/polimento.
- Vem antes do design system (task 13) de propósito: melhor descobrir um problema de CSP ou
  de `innerHTML` antes de polir visualmente componentes que talvez precisem de pequenos
  ajustes estruturais no HTML.
