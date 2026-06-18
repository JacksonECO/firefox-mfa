// Primitivas criptográficas puras, sem estado (ver CLAUDE.md / ia/02).
//
// Toda a criptografia do produto passa por aqui: derivação de chave (PBKDF2),
// criptografia/descriptografia (AES-GCM) e utilitários de bytes/base64.
// Nunca reimplementar primitiva à mão — só Web Crypto API nativa.
//
// Este módulo roda no background.js (Firefox) e, idêntico, sob o Web Crypto
// global do Node nos testes. Não importa nada de browser.* — é puro.

const TAMANHO_SALT = 16; // bytes
const TAMANHO_IV = 12; // bytes (recomendado para AES-GCM)
const ITERACOES_PBKDF2 = 600_000; // OWASP Password Storage Cheat Sheet
const HASH_PBKDF2 = 'SHA-256';
const TAMANHO_CHAVE_BITS = 256;

// Plaintext fixo e conhecido, criptografado no cadastro da senha mestra e
// usado depois só para verificar a senha (decrypt bem-sucedido = senha certa).
// Não é segredo e não revela nada sobre os segredos reais dos usuários.
const VALOR_CONTROLE = 'firefox-mfa::valor-de-controle::v1';

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

export {
  TAMANHO_SALT,
  TAMANHO_IV,
  ITERACOES_PBKDF2,
  HASH_PBKDF2,
  TAMANHO_CHAVE_BITS,
  VALOR_CONTROLE,
};

/** Gera `tamanho` bytes aleatórios criptograficamente fortes. */
export function gerarBytesAleatorios(tamanho) {
  return crypto.getRandomValues(new Uint8Array(tamanho));
}

/**
 * Parâmetros da derivação PBKDF2. Exposto para que os testes verifiquem a
 * configuração (hash, iterações, salt) sobre o MESMO objeto que `derivarChave`
 * passa para a Web Crypto — não só sobre constantes soltas.
 */
export function paramsDerivacao(salt) {
  return { name: 'PBKDF2', salt, iterations: ITERACOES_PBKDF2, hash: HASH_PBKDF2 };
}

/**
 * Deriva uma CryptoKey AES-GCM **não-extraível** a partir da senha mestra e do
 * salt. Não-extraível garante que a chave nunca pode ser lida/serializada nem
 * atravessar runtime.sendMessage.
 */
export async function derivarChave(senha, salt) {
  if (typeof senha !== 'string' || senha.length === 0) {
    throw new Error('Senha inválida para derivação de chave.');
  }
  const senhaBytes = codificador.encode(senha);
  const material = await crypto.subtle.importKey(
    'raw',
    senhaBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const chave = await crypto.subtle.deriveKey(
    paramsDerivacao(salt),
    material,
    { name: 'AES-GCM', length: TAMANHO_CHAVE_BITS },
    false, // não-extraível
    ['encrypt', 'decrypt'],
  );
  senhaBytes.fill(0); // zeroing best-effort do material da senha
  return chave;
}

/**
 * Criptografa `textoEmClaro` com AES-GCM, gerando um IV aleatório de 12 bytes
 * nesta chamada (nunca reusar IV com a mesma chave).
 * @returns {{ ciphertext: string, iv: string }} ambos em base64.
 */
export async function criptografar(textoEmClaro, chave) {
  if (typeof textoEmClaro !== 'string' || textoEmClaro.length === 0) {
    throw new Error('Texto em claro vazio ou inválido para criptografia.');
  }
  const iv = gerarBytesAleatorios(TAMANHO_IV);
  const dados = codificador.encode(textoEmClaro);
  const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados);
  dados.fill(0); // zeroing best-effort do plaintext
  return {
    ciphertext: bytesParaBase64(new Uint8Array(cifrado)),
    iv: bytesParaBase64(iv),
  };
}

/**
 * Descriptografa um ciphertext AES-GCM (base64) com o IV (base64) daquele
 * registro. Lança se a tag de autenticação não bater (chave/IV errados ou
 * dado adulterado) — a validação é em tempo constante, feita pelo navegador.
 * @returns {string} o texto em claro.
 */
export async function descriptografar(ciphertextB64, ivB64, chave) {
  const ciphertext = base64ParaBytes(ciphertextB64);
  const iv = base64ParaBytes(ivB64);
  const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chave, ciphertext);
  const bytes = new Uint8Array(aberto);
  const texto = decodificador.decode(bytes);
  bytes.fill(0); // zeroing best-effort do buffer descriptografado
  return texto;
}

/** Zeroing best-effort de um buffer com dado sensível após o uso. */
export function zerar(buffer) {
  if (buffer instanceof Uint8Array) buffer.fill(0);
  else if (buffer instanceof ArrayBuffer) new Uint8Array(buffer).fill(0);
}

/** Uint8Array → base64. */
export function bytesParaBase64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

/** base64 → Uint8Array. */
export function base64ParaBytes(base64) {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
