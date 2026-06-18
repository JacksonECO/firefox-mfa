// Validação/normalização de segredo Base32 (ver ia/04). Módulo puro.
//
// Segredos TOTP usam o alfabeto Base32 (RFC 4648): A–Z e 2–7, com `=` opcional
// de padding ao final. Aqui validamos só o formato no cadastro; a decodificação
// efetiva para gerar o código fica na task 07 (TOTP).

const RE_BASE32 = /^[A-Z2-7]+=*$/;

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
