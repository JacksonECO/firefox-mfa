# 25 — Exportar/importar configurações junto com os dados

## Objetivo

Incluir as configurações atuais (não sensíveis) no arquivo de backup e, na importação,
permitir escolher se elas também serão aplicadas.

## Por que / contexto

Ao migrar de máquina ou restaurar um backup, repetir manualmente todos os ajustes (tempo de
sessão, rate limit, autopreenchimento, autocópia) é trabalhoso. O arquivo já é criptografado;
guardar as configurações ali, e deixar a importação opcional, fecha esse buraco.

## Escopo

**Entra:**
- O payload do export passa a ser `{ mfas, configuracoes }` (dentro da parte criptografada).
- `configuracoes` reúne rateLimit, autofill, tempo de sessão e autocópia.
- Na aba de backup, um checkbox "Importar também as configurações".
- Compatibilidade: arquivos antigos (só array de MFAs) continuam importando (config = null).

**Não entra:**
- Exportar dados sensíveis adicionais — só as configurações não sensíveis.

## Decisões técnicas

- `exportarDados(registros, configuracoes, senha)` e `importarDados → { mfas, configuracoes }`.
- O background coleta as configurações (normalizadas) ao exportar e, ao importar com a opção
  marcada, **revalida** cada uma antes de salvar (`aplicarConfiguracoes`), aplicando o timeout
  na sessão em curso.
- As configurações viajam dentro do payload criptografado (não em claro no arquivo).

## Dependências

- Task 14/20 (backup), tasks 16/21/23/24 (configurações).

## Critérios de aceite (teste manual)

1. Exportar e inspecionar: nenhuma config aparece em claro no arquivo.
2. Importar com o checkbox marcado aplica as configurações; sem marcar, mantém as atuais.
3. Importar um arquivo antigo (sem configurações) continua funcionando.

## Testes automatizados

- Round-trip de backup com `configuracoes`; export sem config → null; compat com formato antigo.
- `EXPORT_DATA` inclui as configurações; `IMPORT_DATA { importarConfig }` aplica (e sem a flag,
  não altera).
