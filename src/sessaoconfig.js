// Configuração do tempo de expiração da sessão (ver ia/21). Puro.
//
// Tempo de inatividade após o qual a senha mestra é exigida de novo. Padrão de
// 2 minutos; ajustável dentro de limites sãos (não permitir desligar a
// expiração nem valores absurdos).

export const TIMEOUT_PADRAO_MS = 2 * 60 * 1000;
export const TIMEOUT_MIN_MS = 15 * 1000; // 15s
export const TIMEOUT_MAX_MS = 60 * 60 * 1000; // 60 min

/** Sanitiza o timeout (ms): inteiro, dentro de [MIN, MAX]; inválido → padrão. */
export function normalizarTimeout(ms) {
  const n = Math.trunc(Number(ms));
  if (!Number.isFinite(n)) return TIMEOUT_PADRAO_MS;
  return Math.min(Math.max(n, TIMEOUT_MIN_MS), TIMEOUT_MAX_MS);
}
