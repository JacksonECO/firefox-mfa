# 20 — Correção: importação fecha o popup ao escolher o arquivo

## Objetivo

Corrigir a importação de backup, que era impossível: ao clicar no campo de arquivo dentro do
popup, o seletor de arquivos do sistema rouba o foco e o **popup é destruído** (comportamento
do Firefox), perdendo todo o estado antes mesmo de o arquivo ser escolhido.

## Por que / contexto

Popups de extensão fecham ao perder o foco. Qualquer `<input type="file">` (que abre um diálogo
nativo) inviabiliza o fluxo dentro do popup. A solução robusta é mover as operações de arquivo
para uma **página da extensão aberta em uma aba**, que não é destruída ao abrir o seletor.

## Escopo

**Entra:**
- Página dedicada `popup/backup.html` (+ `backup.js`) com exportar e importar, aberta em uma
  aba via `browser.tabs.create`.
- Os botões "Exportar"/"Importar" do popup passam a abrir essa página (não mais telas internas).
- A página usa a mesma sessão do background (a chave em memória persiste entre popup e aba).
  Se a sessão estiver bloqueada, a página orienta a desbloquear pela extensão.

**Não entra:**
- Novos recursos de backup (escolher importar configurações é a task 25).

## Decisões técnicas

- `browser.tabs.create({ url: runtime.getURL('popup/backup.html') })` não exige permissão
  extra (criar aba da própria extensão é permitido sem `tabs`).
- Export e import movidos do popup para a página; as views `view-exportar`/`view-importar` e
  seus handlers saem do popup.
- A página reaproveita `theme.css` + `popup.css` (layout de página via classe `.pagina`).

## Dependências

- Task 14 (export/import) — mesma lógica de background (EXPORT_DATA/IMPORT_DATA).

## Critérios de aceite (teste manual)

1. Clicar em "Importar" abre uma aba; escolher o arquivo NÃO fecha nada; importar funciona.
2. Exportar pela aba baixa o arquivo normalmente.
3. Com a sessão bloqueada, a aba mostra orientação para desbloquear primeiro.

## Testes automatizados

- A página é DOM/aba (não testável no node). Mantém-se a cobertura de EXPORT_DATA/IMPORT_DATA
  no background; teste estático de hardening cobre a nova página (sem innerHTML/eval/console).
