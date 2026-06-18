# 11 — Versionamento e migração de schema de dados

## Objetivo

Adicionar um campo de versão de schema aos dados persistidos e uma função simples de
migração, preparando o terreno para evoluções futuras do formato de dados sem quebrar
instalações existentes.

## Por que / contexto

Uma vez que usuários reais tenham MFAs cadastrados, qualquer mudança futura no formato dos
dados (por exemplo, ao implementar a task 14 de exportar/importar, ou ao adicionar um novo
campo) precisa de um caminho de migração — senão dados existentes podem ficar inacessíveis
ou corrompidos após uma atualização da extensão. É muito mais barato estruturar isso agora,
com o schema ainda simples e sem dados legados reais, do que depois.

## Escopo

**Entra:**
- Campo `schemaVersion` (número inteiro, ex: `1`) salvo junto aos metadados não sensíveis em
  `browser.storage.local` (mesma área onde fica `cryptoSalt`, conforme já reservado na task
  03).
- Função `migrarSeNecessario()` chamada na inicialização do `background.js`, que compara a
  versão salva com a versão atual esperada pelo código e aplica migrações incrementais se
  necessário.
- Documentação de que qualquer mudança futura de schema deve vir acompanhada de uma função de
  migração nomeada (ex: `migrarDe1Para2()`).

**Não entra:**
- Qualquer migração real além da v1 — não há ainda nenhuma mudança de schema pendente; esta
  task só constrói a estrutura para quando ela for necessária.

## Decisões técnicas

- `schemaVersion` é um dado não sensível, salvo junto da área de metadados (junto com
  `cryptoSalt`, `mfaUnlockAttempts` da task 10, etc.), nunca junto dos registros de MFA em si.
- A função de migração deve ser idempotente (rodar de novo sem efeito colateral se já estiver
  na versão atual) e deve rodar antes de qualquer leitura/escrita de `mfaItems`.
- Estrutura sugerida: um array ordenado de migrações `[{ de: 1, para: 2, executar: fn }, ...]`
  aplicado sequencialmente até alcançar a versão atual — mesmo com um array vazio hoje, isso
  documenta o padrão esperado para quando a primeira migração real surgir.

## Dependências

- Task 03 (modelo de dados) — esta task estende a área de metadados definida ali.

## Critérios de aceite (teste manual)

1. Uma instalação nova grava `schemaVersion: 1` automaticamente no primeiro uso.
2. Forçar manualmente (via DevTools → Storage) um valor de `schemaVersion` ausente e
   confirmar que a extensão ainda inicializa corretamente (tratando como versão antiga e
   migrando para a v1 atual, sem perder os MFAs já cadastrados).

## Testes automatizados

- Teste de que `migrarSeNecessario()` é um no-op quando a versão já está atualizada (não
  altera nenhum dado).
- Teste de que, com um mock de storage sem `schemaVersion`, a função inicializa corretamente
  para a versão 1 sem perder os registros de MFA já existentes (round-trip dos dados).

## Riscos / pontos de atenção

- Não over-engenheirar: o objetivo aqui é abrir a porta para migrações futuras com baixo
  custo, não construir um framework de migração complexo para um produto que ainda tem só
  uma versão de schema.
