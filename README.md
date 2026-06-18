# Firefox MFA

Extensão (plug-in) para **Firefox** que gerencia códigos **MFA / TOTP** (RFC 6238),
substituindo apps de autenticação externos. Dois diferenciais norteiam o produto:

1. **Foco no domínio atual** — o popup mostra por padrão só os MFAs do domínio da aba ativa.
2. **Segurança das chaves** — segredos TOTP sempre criptografados em repouso, decriptados só
   em memória, 100% local, sem rede.

O planejamento completo está em [`ia/`](./ia/) (começando por
[`ia/00-resumo-do-projeto.md`](./ia/00-resumo-do-projeto.md)). As regras de segurança e design
estão em [`CLAUDE.md`](./CLAUDE.md).

> **Estado atual:** task 01 concluída — estrutura base da extensão carregável. As
> funcionalidades (criptografia, cadastro, listagem, TOTP, etc.) chegam nas próximas tasks.

## Estrutura

```
/manifest.json        manifest MV3
/icons/               ícone da extensão (SVG)
/popup/               UI do popup (popup.html, popup.css, popup.js)
/src/                 background.js — dono de toda a crypto e segredo em claro
/scripts/             empacotar.sh — gera o .zip de instalação
/ia/                  docs de planejamento (uma task por arquivo)
```

## Como carregar a extensão (temporária) no Firefox

1. Abra `about:debugging#/runtime/this-firefox` no Firefox.
2. Clique em **"Carregar extensão temporária…"**.
3. Selecione o arquivo `manifest.json` na raiz deste repositório.
4. A extensão aparece na barra de ferramentas. Clicar no ícone abre o popup.

A instalação temporária some ao fechar o Firefox — repita o processo a cada sessão de
desenvolvimento. Mudanças nos arquivos exigem clicar em **"Recarregar"** na mesma tela.

## Empacotar para distribuição/teste

```bash
./scripts/empacotar.sh
```

Gera `web-ext-artifacts/firefox-mfa.zip`. Requer o utilitário `zip` instalado
(`sudo apt install zip` no Ubuntu).

## Nota de plataforma (background MV3 no Firefox)

O alvo obrigatório do MVP é **Ubuntu/Linux + Firefox**. No Firefox, o background de uma
extensão MV3 roda como **event page** declarada em `background.scripts` (não-persistente),
e não como `service_worker` ao estilo do Chrome. Por isso o `manifest.json` usa
`background.scripts`. Os docs em `ia/` se referem ao background como "service worker" pelo
papel que ele cumpre; o comportamento é equivalente. Para portar ao Chrome no futuro,
trocar a chave por `background.service_worker` (ver task 14 / trabalho futuro).

## Permissões

No momento o manifest pede apenas `storage`. As demais (`activeTab`, `clipboardWrite`,
`alarms`) entram nas tasks que de fato as usam (04, 08, 02), seguindo o princípio de menor
privilégio. A auditoria final de permissões e CSP está na task 12.
