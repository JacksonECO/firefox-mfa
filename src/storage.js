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
const CHAVE_CONTAS = 'credItems';
const CHAVE_SCHEMA = 'schemaVersion';
const CHAVE_TENTATIVAS = 'mfaUnlockAttempts';
const CHAVE_ULTIMA_TENTATIVA = 'mfaUnlockLastAttemptAt';
const CHAVE_CONFIG_RATELIMIT = 'rateLimitConfig';
const CHAVE_CONFIG_AUTOFILL = 'autofillConfig';
const CHAVE_TIMEOUT_SESSAO = 'sessionTimeoutMs';
const CHAVE_AUTOCOPIAR = 'autocopiarHabilitado';
const SCHEMA_ATUAL = 2;

// Migrações de schema (task 11). Cada migração: { de: N, para: N+1,
// executar: async () => { ... } }, aplicada em ordem na inicialização.
const MIGRACOES = [
  {
    de: 1,
    para: 2,
    // v2 introduz a coleção de contas do site (e-mail + senha por domínio,
    // task 30). Só garante a chave; não toca em `mfaItems`.
    async executar() {
      const dados = await area().get(CHAVE_CONTAS);
      if (!Array.isArray(dados[CHAVE_CONTAS])) await area().set({ [CHAVE_CONTAS]: [] });
    },
  },
];

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

/**
 * Autocópia ligada? Padrão: DESLIGADA (task 29). Mexe na área de transferência
 * sem clique e pode sobrescrever um segredo que o usuário acabou de copiar para
 * cadastrar um novo MFA — por isso é opt-in.
 */
export async function obterAutocopiar() {
  const dados = await area().get(CHAVE_AUTOCOPIAR);
  const v = dados[CHAVE_AUTOCOPIAR];
  return typeof v === 'boolean' ? v : false;
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

// Guardião de TODA escrita de domínio (MFAs e contas): mesma normalização de
// `normalizarDominio` (src/dominio.js) — trim + minúsculo — para que um
// registro importado ou gravado por um caminho que não passou pela validação
// do cadastro (ex.: IMPORT_DATA) não fique com uma grafia divergente da usada
// nos filtros por domínio, que comparam string exata.
function normalizarCampoDominio(valor) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().toLowerCase();
  return limpo === '' ? null : limpo;
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
 * novo valor de controle, todos os MFAs e contas recriptografados e o contador
 * zerado. `contas` é opcional (ausente ⇒ a coleção não é tocada).
 */
export async function aplicarTrocaSenha({ saltBytes, controle, mfas, contas }) {
  const escrita = {
    [CHAVE_SALT]: cripto.bytesParaBase64(saltBytes),
    [CHAVE_CONTROLE]: controle,
    [CHAVE_MFAS]: mfas,
    [CHAVE_TENTATIVAS]: 0,
  };
  if (Array.isArray(contas)) escrita[CHAVE_CONTAS] = contas;
  await area().set(escrita);
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

/* --------------------- contas do site: e-mail + senha (task 30) --------------------- */
//
// Coleção separada dos MFAs (`credItems`), ligada ao site pelo campo `dominio`
// (comparação exata, igual à dos MFAs). E-mail e senha são SEMPRE cifrados aqui
// antes de persistir, cada um com seu próprio IV — nunca reusar IV com a mesma
// chave. A única exceção é `salvarContaSemCripto`/`atualizarContaSemCripto`
// (localhost, task 26), cujo domínio é validado pelo chamador (background).
//
// Invariante: cada domínio tem EXATAMENTE uma conta principal (a que recebe o
// autopreenchimento). Ela é mantida por `normalizarPrincipais` em toda escrita.

async function lerContas() {
  const dados = await area().get(CHAVE_CONTAS);
  return Array.isArray(dados[CHAVE_CONTAS]) ? dados[CHAVE_CONTAS] : [];
}

async function gravarContas(lista) {
  await area().set({ [CHAVE_CONTAS]: lista });
}

function normalizarRotulo(valor) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

/** Campos obrigatórios de uma conta (domínio é a chave de vínculo com o site). */
function exigirCamposConta({ dominio, email, senha }) {
  if (normalizarCampoDominio(dominio) === null) {
    throw new Error('Site (domínio) da conta é obrigatório.');
  }
  if (typeof email !== 'string' || email.trim() === '') {
    throw new Error('E-mail (ou usuário) é obrigatório.');
  }
  if (typeof senha !== 'string' || senha === '') {
    throw new Error('Senha da conta é obrigatória.');
  }
}

/**
 * Devolve uma NOVA lista em que o domínio informado tem exatamente uma conta
 * principal. `preferidaId` (quando existe no domínio) vence; senão mantém-se a
 * principal atual mais antiga; senão promove-se a conta mais antiga do domínio.
 */
function normalizarPrincipais(lista, dominio, preferidaId = null) {
  const doDominio = lista.filter((c) => c.dominio === dominio);
  if (doDominio.length === 0) return lista;
  const porIdade = [...doDominio].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const escolhida =
    (preferidaId && doDominio.find((c) => c.id === preferidaId)) ||
    porIdade.find((c) => c.principal === true) ||
    porIdade[0];
  return lista.map((c) =>
    c.dominio === dominio ? { ...c, principal: c.id === escolhida.id } : c,
  );
}

/** Todas as contas (com e-mail/senha ainda cifrados). */
export async function listarContas() {
  return lerContas();
}

/** Contas de um domínio (comparação exata de strings). */
export async function listarContasPorDominio(dominio) {
  const todas = await lerContas();
  return todas.filter((c) => c.dominio === dominio);
}

/** Uma conta pelo id (ainda cifrada), ou null. */
export async function obterConta(id) {
  const todas = await lerContas();
  return todas.find((c) => c.id === id) ?? null;
}

/**
 * Quantas contas cada domínio tem — só contagem, sem decifrar nada. Alimenta o
 * ícone indicativo nos cards e a seleção de domínios da exportação.
 * @returns {Promise<Record<string, number>>}
 */
export async function contarContasPorDominio() {
  const todas = await lerContas();
  const mapa = {};
  for (const conta of todas) {
    if (typeof conta.dominio !== 'string') continue;
    mapa[conta.dominio] = (mapa[conta.dominio] ?? 0) + 1;
  }
  return mapa;
}

/**
 * Cria uma conta cifrando e-mail e senha (IVs distintos). O texto em claro
 * nunca é persistido.
 * @param {{dominio:string, rotulo?:string|null, email:string, senha:string, principal?:boolean}} dados
 * @param {CryptoKey} chave chave de sessão (transitória, nunca persistida)
 */
export async function salvarConta({ dominio, rotulo, email, senha, principal = false }, chave) {
  exigirCamposConta({ dominio, email, senha });
  const cifradoEmail = await cripto.criptografar(email.trim(), chave);
  const cifradoSenha = await cripto.criptografar(senha, chave);
  const agora = Date.now();
  const registro = {
    id: crypto.randomUUID(),
    dominio: normalizarCampoDominio(dominio),
    rotulo: normalizarRotulo(rotulo),
    emailCriptografado: cifradoEmail.ciphertext,
    ivEmail: cifradoEmail.iv,
    senhaCriptografada: cifradoSenha.ciphertext,
    ivSenha: cifradoSenha.iv,
    principal: Boolean(principal),
    createdAt: agora,
    updatedAt: agora,
  };
  const todas = await lerContas();
  todas.push(registro);
  const lista = normalizarPrincipais(todas, registro.dominio, principal ? registro.id : null);
  await gravarContas(lista);
  await garantirSchemaVersion();
  return lista.find((c) => c.id === registro.id);
}

/**
 * Cria uma conta de localhost SEM criptografia (mesma exceção da task 26). O
 * chamador (background) é responsável por validar que o domínio é localhost.
 */
export async function salvarContaSemCripto({ dominio, rotulo, email, senha, principal = false }) {
  exigirCamposConta({ dominio, email, senha });
  const agora = Date.now();
  const registro = {
    id: crypto.randomUUID(),
    dominio: normalizarCampoDominio(dominio),
    rotulo: normalizarRotulo(rotulo),
    emailEmClaro: email.trim(),
    senhaEmClaro: senha,
    semCriptografia: true,
    principal: Boolean(principal),
    createdAt: agora,
    updatedAt: agora,
  };
  const todas = await lerContas();
  todas.push(registro);
  const lista = normalizarPrincipais(todas, registro.dominio, principal ? registro.id : null);
  await gravarContas(lista);
  await garantirSchemaVersion();
  return lista.find((c) => c.id === registro.id);
}

/** Aplica campos comuns (domínio/rótulo/principal) e regrava mantendo a invariante. */
async function gravarContaAtualizada(todas, indice, atualizadoOriginal, principal) {
  const dominioAntigo = todas[indice].dominio;
  const mudouDominio = dominioAntigo !== atualizadoOriginal.dominio;
  // Ao mudar de domínio sem marcar "principal" explicitamente, o registro não
  // pode carregar a flag `principal:true` do domínio antigo para o novo — ela
  // desempataria por idade contra a principal já existente no destino e a
  // desbancaria silenciosamente (ver ia/30: a invariante nunca rouba a
  // principal de quem já tem uma).
  const atualizado =
    mudouDominio && principal !== true
      ? { ...atualizadoOriginal, principal: false }
      : atualizadoOriginal;
  let lista = todas.map((c, i) => (i === indice ? atualizado : c));
  if (mudouDominio) lista = normalizarPrincipais(lista, dominioAntigo);
  lista = normalizarPrincipais(
    lista,
    atualizado.dominio,
    principal === true ? atualizado.id : null,
  );
  await gravarContas(lista);
  return lista.find((c) => c.id === atualizado.id);
}

/**
 * Atualiza uma conta cifrada. `email`/`senha` só são recifrados (novo IV) quando
 * vierem preenchidos — em branco significa "manter o valor atual".
 * @returns o registro atualizado, ou `null` se o id não existir.
 */
export async function atualizarConta(id, { dominio, rotulo, email, senha, principal }, chave) {
  const todas = await lerContas();
  const indice = todas.findIndex((c) => c.id === id);
  if (indice === -1) return null;
  const atual = todas[indice];

  const novoDominio = normalizarCampoDominio(dominio ?? atual.dominio);
  if (novoDominio === null) throw new Error('Site (domínio) da conta é obrigatório.');

  const atualizado = {
    ...atual,
    dominio: novoDominio,
    rotulo: normalizarRotulo(rotulo === undefined ? atual.rotulo : rotulo),
    updatedAt: Date.now(),
  };
  if (typeof email === 'string' && email.trim() !== '') {
    const cifrado = await cripto.criptografar(email.trim(), chave);
    atualizado.emailCriptografado = cifrado.ciphertext;
    atualizado.ivEmail = cifrado.iv;
  }
  if (typeof senha === 'string' && senha !== '') {
    const cifrado = await cripto.criptografar(senha, chave);
    atualizado.senhaCriptografada = cifrado.ciphertext;
    atualizado.ivSenha = cifrado.iv;
  }
  return gravarContaAtualizada(todas, indice, atualizado, principal);
}

/** Atualiza uma conta de localhost sem criptografia, mantendo-a em claro. */
export async function atualizarContaSemCripto(id, { dominio, rotulo, email, senha, principal }) {
  const todas = await lerContas();
  const indice = todas.findIndex((c) => c.id === id);
  if (indice === -1) return null;
  const atual = todas[indice];

  const novoDominio = normalizarCampoDominio(dominio ?? atual.dominio);
  if (novoDominio === null) throw new Error('Site (domínio) da conta é obrigatório.');

  const atualizado = {
    ...atual,
    dominio: novoDominio,
    rotulo: normalizarRotulo(rotulo === undefined ? atual.rotulo : rotulo),
    semCriptografia: true,
    updatedAt: Date.now(),
  };
  if (typeof email === 'string' && email.trim() !== '') atualizado.emailEmClaro = email.trim();
  if (typeof senha === 'string' && senha !== '') atualizado.senhaEmClaro = senha;
  return gravarContaAtualizada(todas, indice, atualizado, principal);
}

/**
 * Converte uma conta de localhost-sem-cripto para criptografada — usada quando
 * o domínio editado deixa de ser localhost. Conversão só nesse sentido; voltar a
 * sem-cripto exige excluir e recadastrar (decisão tomada na criação, task 26).
 */
export async function converterContaParaCriptografada(
  id,
  { dominio, rotulo, email, senha, principal },
  chave,
) {
  const todas = await lerContas();
  const indice = todas.findIndex((c) => c.id === id);
  if (indice === -1) return null;
  const atual = todas[indice];

  const emailFinal = typeof email === 'string' && email.trim() !== '' ? email.trim() : atual.emailEmClaro;
  const senhaFinal = typeof senha === 'string' && senha !== '' ? senha : atual.senhaEmClaro;
  exigirCamposConta({ dominio: dominio ?? atual.dominio, email: emailFinal, senha: senhaFinal });

  const cifradoEmail = await cripto.criptografar(emailFinal, chave);
  const cifradoSenha = await cripto.criptografar(senhaFinal, chave);
  const atualizado = {
    id: atual.id,
    dominio: normalizarCampoDominio(dominio ?? atual.dominio),
    rotulo: normalizarRotulo(rotulo === undefined ? atual.rotulo : rotulo),
    emailCriptografado: cifradoEmail.ciphertext,
    ivEmail: cifradoEmail.iv,
    senhaCriptografada: cifradoSenha.ciphertext,
    ivSenha: cifradoSenha.iv,
    principal: atual.principal === true,
    createdAt: atual.createdAt,
    updatedAt: Date.now(),
  };
  return gravarContaAtualizada(todas, indice, atualizado, principal);
}

/** Marca uma conta como principal do seu domínio (desmarcando as demais). */
export async function definirContaPrincipal(id) {
  const todas = await lerContas();
  const conta = todas.find((c) => c.id === id);
  if (!conta) return null;
  const lista = normalizarPrincipais(todas, conta.dominio, id);
  await gravarContas(lista);
  return lista.find((c) => c.id === id);
}

/**
 * Remove uma conta por id. Se era a principal do domínio, a mais antiga
 * remanescente é promovida. Remover um id inexistente é no-op.
 * @returns {Promise<number>} quantos registros foram removidos (0 ou 1).
 */
export async function removerConta(id) {
  const todas = await lerContas();
  const alvo = todas.find((c) => c.id === id);
  if (!alvo) return 0;
  const restantes = normalizarPrincipais(
    todas.filter((c) => c.id !== id),
    alvo.dominio,
  );
  await gravarContas(restantes);
  return 1;
}
