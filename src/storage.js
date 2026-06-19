// Camada única de acesso a `browser.storage.local` (ver CLAUDE.md / ia/03).
// NENHUM outro módulo toca o storage diretamente — tudo passa por aqui.
//
// Conteúdo:
//  - Metadados de criptografia (task 02): salt + valor de controle.
//  - CRUD dos registros de MFA (task 03): o segredo é SEMPRE persistido
//    criptografado (AES-GCM), nunca em claro.
//  - `schemaVersion` (espaço reservado; a migração formal fica na task 11).

import * as cripto from './crypto.js';

const CHAVE_SALT = 'cryptoSalt';
const CHAVE_CONTROLE = 'cryptoControle';
const CHAVE_MFAS = 'mfaItems';
const CHAVE_SCHEMA = 'schemaVersion';
const CHAVE_TENTATIVAS = 'mfaUnlockAttempts';
const CHAVE_ULTIMA_TENTATIVA = 'mfaUnlockLastAttemptAt';
const CHAVE_CONFIG_RATELIMIT = 'rateLimitConfig';
const CHAVE_CONFIG_AUTOFILL = 'autofillConfig';
const CHAVE_TIMEOUT_SESSAO = 'sessionTimeoutMs';
const CHAVE_AUTOCOPIAR = 'autocopiarHabilitado';
const SCHEMA_ATUAL = 1;

// Migrações de schema (task 11). Vazio hoje (só existe a v1). Cada migração
// futura: { de: N, para: N+1, executar: async () => { ... } }, aplicada em ordem.
const MIGRACOES = [];

export { SCHEMA_ATUAL };

// Lista branca de campos que `atualizarMfa` pode sobrescrever. Proposital:
// impede que um segredo em claro (ou campo inesperado) seja gravado por engano.
const CAMPOS_ATUALIZAVEIS = ['nome', 'dominio', 'secretCriptografado', 'iv'];

// Acesso tardio ao `browser` global: existe no Firefox e é injetado como mock
// nos testes. Lê a referência a cada chamada para respeitar troca de mock.
function area() {
  return globalThis.browser.storage.local;
}

/* ---------------------------- metadados (task 02) ---------------------------- */

/** @returns {Promise<Uint8Array|null>} o salt salvo, ou null se ausente. */
export async function obterSalt() {
  const dados = await area().get(CHAVE_SALT);
  const salt = dados[CHAVE_SALT];
  return typeof salt === 'string' ? cripto.base64ParaBytes(salt) : null;
}

export async function salvarSalt(saltBytes) {
  await area().set({ [CHAVE_SALT]: cripto.bytesParaBase64(saltBytes) });
}

/** @returns {Promise<{ciphertext:string, iv:string}|null>} */
export async function obterValorControle() {
  const dados = await area().get(CHAVE_CONTROLE);
  return dados[CHAVE_CONTROLE] ?? null;
}

export async function salvarValorControle(controle) {
  await area().set({ [CHAVE_CONTROLE]: controle });
}

/** Há senha mestra definida? (existem salt + valor de controle). */
export async function estaInicializado() {
  const dados = await area().get([CHAVE_SALT, CHAVE_CONTROLE]);
  return Boolean(dados[CHAVE_SALT] && dados[CHAVE_CONTROLE]);
}

/* ------------------------------ schema (task 11) ----------------------------- */

export async function obterSchemaVersion() {
  const dados = await area().get(CHAVE_SCHEMA);
  return typeof dados[CHAVE_SCHEMA] === 'number' ? dados[CHAVE_SCHEMA] : null;
}

async function garantirSchemaVersion() {
  if ((await obterSchemaVersion()) === null) {
    await area().set({ [CHAVE_SCHEMA]: SCHEMA_ATUAL });
  }
}

/**
 * Migra o schema do storage para a versão atual, se necessário (task 11).
 * Idempotente: rodar de novo quando já está atualizado é no-op. Deve rodar na
 * inicialização do background, antes de qualquer leitura/escrita de `mfaItems`.
 *
 * - schemaVersion ausente (instalação nova OU dados pré-versionamento) → grava
 *   a versão atual sem tocar nos dados existentes (não perde MFAs).
 * - schemaVersion antiga → aplica as migrações em ordem até a versão atual.
 * @returns {Promise<number>} a versão resultante.
 */
export async function migrarSeNecessario() {
  let versao = await obterSchemaVersion();
  if (versao === null) {
    await area().set({ [CHAVE_SCHEMA]: SCHEMA_ATUAL });
    return SCHEMA_ATUAL;
  }
  for (const migracao of MIGRACOES) {
    if (versao === migracao.de) {
      await migracao.executar();
      versao = migracao.para;
      await area().set({ [CHAVE_SCHEMA]: versao });
    }
  }
  return versao;
}

/* ---------------------- rate limiting de desbloqueio (task 10) ---------------------- */

/** Nº de tentativas erradas consecutivas (0 se ausente). */
export async function obterTentativas() {
  const dados = await area().get(CHAVE_TENTATIVAS);
  return typeof dados[CHAVE_TENTATIVAS] === 'number' ? dados[CHAVE_TENTATIVAS] : 0;
}

export async function salvarTentativas(n) {
  await area().set({ [CHAVE_TENTATIVAS]: n, [CHAVE_ULTIMA_TENTATIVA]: Date.now() });
}

export async function resetarTentativas() {
  await area().set({ [CHAVE_TENTATIVAS]: 0 });
}

/* ------------------------ configurações (task 16) ------------------------ */

/** Config (não sensível) do rate limiting, ou null se nunca salva. */
export async function obterConfigRateLimit() {
  const dados = await area().get(CHAVE_CONFIG_RATELIMIT);
  const c = dados[CHAVE_CONFIG_RATELIMIT];
  return c && typeof c === 'object' ? c : null;
}

export async function salvarConfigRateLimit(config) {
  await area().set({ [CHAVE_CONFIG_RATELIMIT]: config });
}

/** Config (não sensível) do autopreenchimento, ou null se nunca salva. */
export async function obterConfigAutofill() {
  const dados = await area().get(CHAVE_CONFIG_AUTOFILL);
  const c = dados[CHAVE_CONFIG_AUTOFILL];
  return c && typeof c === 'object' ? c : null;
}

export async function salvarConfigAutofill(config) {
  await area().set({ [CHAVE_CONFIG_AUTOFILL]: config });
}

/** Timeout de inatividade da sessão (ms), ou null se nunca salvo. */
export async function obterTimeoutSessao() {
  const dados = await area().get(CHAVE_TIMEOUT_SESSAO);
  const ms = dados[CHAVE_TIMEOUT_SESSAO];
  return typeof ms === 'number' ? ms : null;
}

export async function salvarTimeoutSessao(ms) {
  await area().set({ [CHAVE_TIMEOUT_SESSAO]: ms });
}

/** Autocópia ligada? Padrão: ligada (comportamento original da task 15). */
export async function obterAutocopiar() {
  const dados = await area().get(CHAVE_AUTOCOPIAR);
  const v = dados[CHAVE_AUTOCOPIAR];
  return typeof v === 'boolean' ? v : true;
}

export async function salvarAutocopiar(habilitado) {
  await area().set({ [CHAVE_AUTOCOPIAR]: Boolean(habilitado) });
}

/* -------------------------------- MFAs (task 03) ----------------------------- */

async function lerTodos() {
  const dados = await area().get(CHAVE_MFAS);
  return Array.isArray(dados[CHAVE_MFAS]) ? dados[CHAVE_MFAS] : [];
}

async function gravarTodos(lista) {
  await area().set({ [CHAVE_MFAS]: lista });
}

function normalizarCampoDominio(valor) {
  return valor && String(valor).trim() !== '' ? String(valor).trim() : null;
}

/** Retorna todos os MFAs (sem descriptografar — o segredo só vira claro na task 07). */
export async function listarMfas() {
  return lerTodos();
}

/** Filtra por domínio com comparação exata de strings (inclui o caso `null`). */
export async function listarMfasPorDominio(dominio) {
  const todos = await lerTodos();
  return todos.filter((mfa) => mfa.dominio === dominio);
}

/** Retorna um MFA pelo id (com o segredo ainda criptografado), ou null. */
export async function obterMfa(id) {
  const todos = await lerTodos();
  return todos.find((mfa) => mfa.id === id) ?? null;
}

/**
 * Aplica a troca de senha mestra (task 17) em UMA escrita atômica: novo salt,
 * novo valor de controle, todos os MFAs recriptografados e o contador zerado.
 */
export async function aplicarTrocaSenha({ saltBytes, controle, mfas }) {
  await area().set({
    [CHAVE_SALT]: cripto.bytesParaBase64(saltBytes),
    [CHAVE_CONTROLE]: controle,
    [CHAVE_MFAS]: mfas,
    [CHAVE_TENTATIVAS]: 0,
  });
}

/**
 * Cria um MFA: criptografa o segredo (task 02) e persiste APENAS o ciphertext.
 * O `secretEmClaro` nunca é gravado — só o resultado criptografado + IV.
 * @param {{nome:string, dominio:string|null, secretEmClaro:string}} dados
 * @param {CryptoKey} chave  chave de sessão (transitória, nunca persistida)
 * @returns o registro criado (sem segredo em claro).
 */
export async function salvarMfa({ nome, dominio, secretEmClaro }, chave) {
  if (typeof nome !== 'string' || nome.trim() === '') {
    throw new Error('Nome do MFA é obrigatório.');
  }
  if (typeof secretEmClaro !== 'string' || secretEmClaro.length === 0) {
    throw new Error('Segredo do MFA é obrigatório.');
  }
  const { ciphertext, iv } = await cripto.criptografar(secretEmClaro, chave);
  const agora = Date.now();
  const registro = {
    id: crypto.randomUUID(),
    nome: nome.trim(),
    dominio: normalizarCampoDominio(dominio),
    secretCriptografado: ciphertext,
    iv,
    createdAt: agora,
    updatedAt: agora,
  };
  const todos = await lerTodos();
  todos.push(registro);
  await gravarTodos(todos);
  await garantirSchemaVersion();
  return registro;
}

/**
 * Cria um MFA de localhost SEM criptografia (task 26). O segredo é guardado em
 * claro — exceção restrita a localhost, decidida pelo usuário no cadastro. O
 * chamador (background) é responsável por validar que o domínio é localhost.
 */
export async function salvarMfaSemCripto({ nome, dominio, secretEmClaro }) {
  if (typeof nome !== 'string' || nome.trim() === '') {
    throw new Error('Nome do MFA é obrigatório.');
  }
  if (typeof secretEmClaro !== 'string' || secretEmClaro.length === 0) {
    throw new Error('Segredo do MFA é obrigatório.');
  }
  const agora = Date.now();
  const registro = {
    id: crypto.randomUUID(),
    nome: nome.trim(),
    dominio: normalizarCampoDominio(dominio),
    secretEmClaro,
    semCriptografia: true,
    createdAt: agora,
    updatedAt: agora,
  };
  const todos = await lerTodos();
  todos.push(registro);
  await gravarTodos(todos);
  await garantirSchemaVersion();
  return registro;
}

/** Atualiza um MFA de localhost sem criptografia, mantendo-o em claro. */
export async function atualizarMfaSemCripto(id, { nome, dominio, secretEmClaro }) {
  if (typeof nome !== 'string' || nome.trim() === '') {
    throw new Error('Nome do MFA é obrigatório.');
  }
  if (typeof secretEmClaro !== 'string' || secretEmClaro.length === 0) {
    throw new Error('Segredo do MFA é obrigatório.');
  }
  const todos = await lerTodos();
  const indice = todos.findIndex((mfa) => mfa.id === id);
  if (indice === -1) return null;
  const atualizado = {
    id: todos[indice].id,
    nome: nome.trim(),
    dominio: normalizarCampoDominio(dominio),
    secretEmClaro,
    semCriptografia: true,
    createdAt: todos[indice].createdAt,
    updatedAt: Date.now(),
  };
  todos[indice] = atualizado;
  await gravarTodos(todos);
  return atualizado;
}

/**
 * Converte um MFA de localhost-sem-cripto para criptografado (task: edição de
 * domínio). Usado quando o domínio editado deixa de ser localhost — o registro
 * não pode mais ficar em claro, então passa a usar `secretCriptografado`/`iv`
 * (já cifrados pelo chamador) e descarta `secretEmClaro`/`semCriptografia`.
 * Conversão é só nesse sentido (sem-cripto → criptografado); o inverso
 * continua exigindo excluir e recadastrar (decisão tomada na criação).
 */
export async function converterMfaParaCriptografado(id, { nome, dominio, secretCriptografado, iv }) {
  const todos = await lerTodos();
  const indice = todos.findIndex((mfa) => mfa.id === id);
  if (indice === -1) return null;
  const atualizado = {
    id: todos[indice].id,
    nome: nome.trim(),
    dominio: normalizarCampoDominio(dominio),
    secretCriptografado,
    iv,
    createdAt: todos[indice].createdAt,
    updatedAt: Date.now(),
  };
  todos[indice] = atualizado;
  await gravarTodos(todos);
  return atualizado;
}

/**
 * Atualiza campos de um MFA existente. Só aceita os campos da lista branca —
 * nunca um segredo em claro (que deve ser criptografado pelo chamador, task 09).
 * @returns o registro atualizado, ou `null` se o id não existir.
 */
export async function atualizarMfa(id, dadosNovos) {
  if (dadosNovos && 'secretEmClaro' in dadosNovos) {
    throw new Error('atualizarMfa não aceita segredo em claro; criptografe antes.');
  }
  const todos = await lerTodos();
  const indice = todos.findIndex((mfa) => mfa.id === id);
  if (indice === -1) return null;

  const atualizado = { ...todos[indice] };
  for (const campo of CAMPOS_ATUALIZAVEIS) {
    if (dadosNovos && campo in dadosNovos) atualizado[campo] = dadosNovos[campo];
  }
  if (typeof atualizado.nome !== 'string' || atualizado.nome.trim() === '') {
    throw new Error('Nome do MFA é obrigatório.');
  }
  atualizado.nome = atualizado.nome.trim();
  atualizado.dominio = normalizarCampoDominio(atualizado.dominio);
  atualizado.updatedAt = Date.now();

  todos[indice] = atualizado;
  await gravarTodos(todos);
  return atualizado;
}

/**
 * Remove um MFA por id. Remover um id inexistente é no-op (não lança).
 * @returns {Promise<number>} quantos registros foram removidos (0 ou 1).
 */
export async function removerMfa(id) {
  const todos = await lerTodos();
  const filtrados = todos.filter((mfa) => mfa.id !== id);
  const removidos = todos.length - filtrados.length;
  if (removidos > 0) await gravarTodos(filtrados);
  return removidos;
}
