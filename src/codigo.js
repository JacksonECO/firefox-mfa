// Formatação do código TOTP para exibição e cópia (ver ia/08). Puro.

/**
 * Valor exato para copiar: só dígitos, sem espaços, zeros à esquerda
 * preservados (ex: "007 123" → "007123").
 */
export function codigoParaCopia(codigo) {
  return String(codigo ?? '').replace(/\D/g, '');
}

/**
 * Formatação para leitura no card: agrupa 6 dígitos em "NNN NNN".
 * Comprimentos diferentes são exibidos como estão (apenas sem não-dígitos).
 */
export function formatarCodigoExibicao(codigo) {
  const limpo = codigoParaCopia(codigo);
  if (limpo.length === 6) return `${limpo.slice(0, 3)} ${limpo.slice(3)}`;
  return limpo;
}
