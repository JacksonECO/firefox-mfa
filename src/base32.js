// Validação/normalização de segredo Base32 (ver ia/04). Módulo puro.
//
// Segredos TOTP usam o alfabeto Base32 (RFC 4648): A–Z e 2–7, com `=` opcional
// de padding ao final. Aqui validamos só o formato no cadastro; a decodificação
// efetiva para gerar o código fica na task 07 (TOTP).

const RE_BASE32 = /^[A-Z2-7]+=*$/;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Normaliza um segredo para o formato canônico: remove espaços (comuns ao
 * copiar de QR codes, agrupados de 4 em 4) e passa para maiúsculas.
 * @param {unknown} valor
 * @returns {string}
 */
export function normalizarSegredo(valor) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/\s+/g, '').toUpperCase();
}

/**
 * Indica se `valor` (após normalização) é um Base32 válido e não vazio.
 * @param {unknown} valor
 * @returns {boolean}
 */
export function ehBase32Valido(valor) {
  const normalizado = normalizarSegredo(valor);
  if (normalizado === '') return false;
  return RE_BASE32.test(normalizado);
}

/**
 * Decodifica um segredo Base32 (RFC 4648) em bytes. Não é primitiva
 * criptográfica — é só uma codificação; a parte cripto do TOTP (HMAC) usa a
 * Web Crypto nativa (task 07).
 * @param {string} valor segredo Base32 (espaços/minúsculas tolerados)
 * @returns {Uint8Array}
 * @throws se houver caractere fora do alfabeto Base32.
 */
export function decodificarBase32(valor) {
  const limpo = normalizarSegredo(valor).replace(/=+$/, '');
  if (limpo === '') return new Uint8Array(0);

  const bytes = [];
  let acumulador = 0;
  let bits = 0;
  for (const caractere of limpo) {
    const indice = ALFABETO.indexOf(caractere);
    if (indice === -1) throw new Error('Caractere Base32 inválido.');
    acumulador = (acumulador << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acumulador >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
