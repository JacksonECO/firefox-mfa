# 03 — Modelo de dados e armazenamento

## Objetivo

Definir o schema de cada MFA cadastrado e implementar a camada de acesso a dados isolada
(CRUD), usando `browser.storage.local`.

## Por que / contexto

Toda a UI (listagem, cadastro, edição) depende de uma camada de dados consistente e já
preparada para guardar segredos sempre criptografados (nunca em claro), conforme o diferencial
de segurança do produto.

## Escopo

**Entra:**
- Schema de dados de um registro de MFA.
- Funções de acesso a dados: criar, listar (todos / por domínio), atualizar, remover.
- Armazenamento exclusivamente local (`browser.storage.local`), sem sincronização.

**Não entra:**
- Lógica de criptografia em si (já implementada na task 02 — esta task só consome as
  funções `criptografar`/`descriptografar`).
- UI de listagem/cadastro (tasks 05, 08, 09).

## Decisões técnicas

- Schema do registro de MFA:
  ```js
  {
    id: string,              // uuid gerado na criação
    nome: string,            // obrigatório
    dominio: string | null,  // opcional
    secretCriptografado: string, // base64 do ciphertext (AES-GCM)
    iv: string,               // base64 do IV usado nesse registro
    createdAt: number,        // timestamp
    updatedAt: number,        // timestamp
  }
  ```
- Os registros são guardados em `browser.storage.local` sob uma chave própria, por exemplo
  `mfaItems: MfaItem[]`. O salt de derivação de chave (task 02) fica em outra chave separada,
  ex: `cryptoSalt`.
- Camada de acesso a dados (módulo `src/storage.js` ou similar), com funções:
  - `salvarMfa({ nome, dominio, secretEmClaro })` → criptografa o segredo (usando o módulo da
    task 02) e persiste o registro.
  - `listarMfas()` → retorna todos os registros (sem descriptografar — descriptografia é
    feita só no momento de exibir o código, task 06).
  - `listarMfasPorDominio(dominio)` → filtra os registros cujo campo `dominio` é igual ao
    domínio informado.
  - `atualizarMfa(id, dadosNovos)`.
  - `removerMfa(id)`.
- Essa camada deve ser a única parte do código que acessa `browser.storage.local`
  diretamente — todo o resto do app passa por ela (facilita manutenção e testes).

## Dependências

- Task 02 (criptografia) — `salvarMfa`/`atualizarMfa` chamam as funções de criptografia.

## Critérios de aceite (teste manual)

1. Cadastrar um MFA de teste e confirmar, via DevTools → Storage, que o `secretCriptografado`
   salvo não é o segredo em claro.
2. Listar todos os MFAs cadastrados retorna a lista esperada.
3. Listar por domínio retorna só os registros daquele domínio.
4. Atualizar um registro reflete a mudança ao listar novamente.
5. Remover um registro o retira da listagem.

## Testes automatizados

- Testes unitários da camada de storage usando um mock de `browser.storage.local` (objeto em
  memória simulando a API).
- Casos a cobrir: criar e listar, listar filtrando por domínio (incluindo o caso de domínio
  `null`/ausente), atualizar campos parciais, remover por id, remover um id inexistente não
  deve lançar erro inesperado.

## Riscos / pontos de atenção de segurança

- Garantir que `salvarMfa`/`atualizarMfa` nunca persistam o `secretEmClaro` por engano (por
  exemplo, um bug que salve o objeto inteiro recebido em vez de só o campo criptografado).
- Validar que `nome` é sempre obrigatório antes de persistir (validação tanto na UI quanto na
  camada de dados, como defesa em profundidade).
