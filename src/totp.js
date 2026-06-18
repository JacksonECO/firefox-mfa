// Geração de código TOTP (RFC 6238) e utilitários de janela de tempo (ver ia/07).
//
// Decisão técnica: NÃO vendorizamos uma lib de TOTP de terceiros. Em vez disso
// usamos o HMAC-SHA1 NATIVO da Web Crypto (`crypto.subtle`), e implementamos
// apenas a construção não-criptográfica do TOTP (codificação do contador +
// truncamento dinâmico do RFC 4226 §5.3). Isso respeita melhor as regras do
// projeto (Web Crypto nativa para toda a cripto; nunca reimplementar primitiva
// à mão; superfície de ataque mínima) do que importar uma lib que normalmente
// traz a sua própria implementação de SHA-1/HMAC.
//
// `gerarTOTP` precisa do segredo em claro e por isso roda só no background
// (task 02). Os utilitários de relógio (segundosRestantes/janelaAtual) são
// puros e podem ser usados no popup para o cronômetro, sem nunca tocar o segredo.

import { decodificarBase32 } from './base32.js';

const PASSO_PADRAO = 30; // segundos por janela (RFC 6238)
const DIGITOS_PADRAO = 6; // o produto trunca para 6 dígitos

export { PASSO_PADRAO, DIGITOS_PADRAO };

/** Índice da janela de tempo atual: floor(epochSeg / passo). */
export function janelaAtual(epochMs, passo = PASSO_PADRAO) {
  return Math.floor(epochMs / 1000 / passo);
}

/**
 * Segundos restantes até a próxima janela. No instante exato em que uma nova
 * janela começa, retorna `passo` (ex: 30), nunca 0.
 */
export function segundosRestantes(epochMs, passo = PASSO_PADRAO) {
  return passo - (Math.floor(epochMs / 1000) % passo);
}

/** Codifica o contador como 8 bytes big-endian (usa BigInt p/ não estourar 32 bits). */
function contadorParaBytes(contador) {
  const buffer = new Uint8Array(8);
  let n = BigInt(contador);
  for (let i = 7; i >= 0; i--) {
    buffer[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return buffer;
}

/**
 * Gera o código TOTP de `digitos` dígitos para o instante `epochMs`.
 * @param {string} segredoBase32 segredo em Base32 (em claro, só no background)
 * @param {{epochMs?: number, passo?: number, digitos?: number}} [opcoes]
 * @returns {Promise<string>} código com zeros à esquerda preservados.
 */
export async function gerarTOTP(segredoBase32, opcoes = {}) {
  const {
    epochMs = Date.now(),
    passo = PASSO_PADRAO,
    digitos = DIGITOS_PADRAO,
  } = opcoes;

  const chaveBytes = decodificarBase32(segredoBase32);
  if (chaveBytes.length === 0) throw new Error('Segredo TOTP vazio.');

  const contadorBytes = contadorParaBytes(Math.floor(epochMs / 1000 / passo));
  const chave = await crypto.subtle.importKey(
    'raw',
    chaveBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, contadorBytes));

  // Truncamento dinâmico (RFC 4226 §5.3).
  const offset = assinatura[assinatura.length - 1] & 0x0f;
  const binario =
    ((assinatura[offset] & 0x7f) << 24) |
    ((assinatura[offset + 1] & 0xff) << 16) |
    ((assinatura[offset + 2] & 0xff) << 8) |
    (assinatura[offset + 3] & 0xff);

  const codigo = (binario % 10 ** digitos).toString().padStart(digitos, '0');
  chaveBytes.fill(0); // zeroing best-effort do material do segredo
  return codigo;
}
