// Camada única de acesso a `browser.storage.local` (ver CLAUDE.md / ia/03).
// NENHUM outro módulo deve tocar o storage diretamente.
//
// Fatia da task 02: persistência dos metadados de criptografia (salt + valor
// de controle criptografado). Nada sensível em claro entra aqui — a senha
// mestra e a CryptoKey nunca são persistidas. A task 03 estende este módulo
// com o CRUD dos registros de MFA e o `schemaVersion`.

import { bytesParaBase64, base64ParaBytes } from './crypto.js';

const CHAVE_SALT = 'cryptoSalt';
const CHAVE_CONTROLE = 'cryptoControle';

// Acesso tardio ao `browser` global: existe no Firefox e é injetado como mock
// nos testes. Lê a referência a cada chamada para respeitar troca de mock.
function area() {
  return globalThis.browser.storage.local;
}

/** @returns {Promise<Uint8Array|null>} o salt salvo, ou null se ausente. */
export async function obterSalt() {
  const dados = await area().get(CHAVE_SALT);
  const salt = dados[CHAVE_SALT];
  return typeof salt === 'string' ? base64ParaBytes(salt) : null;
}

export async function salvarSalt(saltBytes) {
  await area().set({ [CHAVE_SALT]: bytesParaBase64(saltBytes) });
}

/** @returns {Promise<{ciphertext:string, iv:string}|null>} */
export async function obterValorControle() {
  const dados = await area().get(CHAVE_CONTROLE);
  return dados[CHAVE_CONTROLE] ?? null;
}

export async function salvarValorControle(controle) {
  await area().set({ [CHAVE_CONTROLE]: controle });
}

/**
 * Há senha mestra definida? (existem salt + valor de controle no storage).
 * Usado pela UI para decidir entre a tela de "criar senha" e a de "desbloquear".
 */
export async function estaInicializado() {
  const dados = await area().get([CHAVE_SALT, CHAVE_CONTROLE]);
  return Boolean(dados[CHAVE_SALT] && dados[CHAVE_CONTROLE]);
}
