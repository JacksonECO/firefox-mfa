# 14 — (Futuro) Exportar e importar dados

> **Status: tarefa futura, fora do MVP.** Não bloqueia o lançamento da v1 do plug-in. Incluída
> aqui para já registrar a intenção e as decisões técnicas previstas, evitando decisões no
> modelo de dados (tasks 02/03) que dificultem implementar isso depois.

## Objetivo

Permitir exportar todos os MFAs cadastrados para um arquivo, protegido por uma senha de
exportação definida pelo usuário no momento do export, e importar esse arquivo de volta
(no mesmo navegador ou em outro), usando essa senha para decriptar e restaurar os dados.

## Por que / contexto

Hoje os dados vivem só localmente no storage do navegador (por design, para segurança). Isso
significa que trocar de computador, reinstalar o navegador, ou simplesmente fazer um backup
de segurança não é possível sem essa funcionalidade. Export/import resolve isso sem abrir mão
do armazenamento local-first: o arquivo exportado também é criptografado, com uma senha
própria (diferente da senha mestra do cofre).

## Escopo (quando for implementada)

**Entra:**
- Botão "Exportar dados" que solicita ao usuário uma senha de exportação (distinta da senha
  mestra do dia a dia).
- Geração de um arquivo (ex: `.json` ou formato próprio) contendo todos os registros de MFA,
  re-criptografados com uma chave derivada dessa senha de exportação (mesmo esquema PBKDF2 +
  AES-GCM da task 02, mas com parâmetros de derivação próprios — salt gerado especificamente
  para esse export).
- Download do arquivo via API do navegador (sem upload para nenhum servidor — segue o
  princípio offline-first).
- Botão "Importar dados" que solicita o arquivo e a senha de exportação correspondente,
  decriptografa e insere os registros no storage local (com tratamento de duplicados,
  a definir: sobrescrever, mesclar ou pedir confirmação por item).

**Não entra:**
- Sincronização automática entre dispositivos (ex: via conta de usuário/servidor) — está
  fora do princípio "sem acesso à Internet" do produto. Export/import é manual e sob
  controle total do usuário.

## Decisões técnicas previstas

- O arquivo exportado nunca contém os segredos em claro — eles são re-criptografados com a
  chave derivada da senha de exportação antes de serem escritos no arquivo.
- A senha de exportação é só usada no momento do export/import — não fica guardada em
  nenhum lugar, igual à senha mestra.
- Formato do arquivo: incluir um cabeçalho com metadados não sensíveis (versão do formato,
  salt de derivação, data de exportação) e o payload criptografado.
- Validar na importação se a senha informada está correta (mesmo padrão de "valor de
  controle" usado na task 02) antes de tentar decriptografar todos os registros.

## Dependências (quando entrar no roadmap)

- Task 02 (criptografia) — reuso do esquema de derivação de chave e criptografia.
- Task 03 (modelo de dados) — formato dos registros a exportar/importar.

## Critérios de aceite (quando implementada)

1. Exportar gera um arquivo que não contém nenhum segredo em claro (inspecionável
   manualmente).
2. Importar esse arquivo com a senha correta restaura os MFAs corretamente (códigos gerados
   batem com os originais).
3. Importar com senha errada falha de forma clara, sem corromper os dados existentes no
   storage local.

## Testes automatizados (quando implementada)

- Round-trip completo: exportar e depois importar deve resultar exatamente nos mesmos dados
  (nome, domínio, segredo) do estado original.
- Importar com senha errada deve falhar de forma previsível (erro tratado, não exceção não
  tratada).

## Observações

- Como apontado na task 08, eventuais limitações de clipboard ou comportamento específico de
  outros sistemas operacionais (fora do Ubuntu/Linux) também podem ser tratadas como anexos a
  esta task futura, caso surjam durante o desenvolvimento do MVP.
