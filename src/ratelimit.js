// Rate limiting de tentativas de senha mestra (ver ia/10 e ia/16). Puro.
//
// Atraso progressivo aplicado ANTES de processar a próxima tentativa, em função
// de quantas tentativas erradas consecutivas já foram registradas. Não há
// bloqueio permanente — só fricção crescente contra força bruta local.
// As faixas são configuráveis (task 16); os padrões reproduzem o fluxo original.

export const RATE_LIMIT_PADRAO = Object.freeze({
  livres: 3, // tentativas sem atraso (1ª–3ª)
  limite1: 6, // até aqui (exclusivo) aplica atraso1 (4ª–6ª)
  atraso1Ms: 1000,
  limite2: 10, // "máximo de tentativas": até aqui aplica atraso2 (7ª–10ª)
  atraso2Ms: 5000,
  atrasoMaxMs: 30000, // acima de limite2 (11ª+); teto, não cresce mais
});

const inteiro = (valor, padrao) => {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) ? n : padrao;
};
const limitar = (n, min, max) => Math.min(Math.max(n, min), max);

/**
 * Sanitiza uma configuração parcial vinda da UI, garantindo faixas coerentes
 * (livres < limite1 < limite2) e atrasos não negativos. Campos ausentes ou
 * inválidos caem no padrão.
 */
export function normalizarConfigRateLimit(parcial = {}) {
  const p = RATE_LIMIT_PADRAO;
  const livres = limitar(inteiro(parcial.livres, p.livres), 0, 1000);
  const limite1 = limitar(inteiro(parcial.limite1, p.limite1), livres + 1, 2000);
  const limite2 = limitar(inteiro(parcial.limite2, p.limite2), limite1 + 1, 5000);
  const atraso1Ms = limitar(inteiro(parcial.atraso1Ms, p.atraso1Ms), 0, 600000);
  const atraso2Ms = limitar(inteiro(parcial.atraso2Ms, p.atraso2Ms), 0, 600000);
  const atrasoMaxMs = limitar(inteiro(parcial.atrasoMaxMs, p.atrasoMaxMs), 0, 600000);
  return { livres, limite1, atraso1Ms, limite2, atraso2Ms, atrasoMaxMs };
}

/**
 * Atraso (ms) antes de processar a próxima tentativa, dado o número de
 * tentativas erradas consecutivas já acumuladas e a configuração ativa.
 */
export function calcularAtraso(tentativasErradas, config = RATE_LIMIT_PADRAO) {
  const c = config ?? RATE_LIMIT_PADRAO;
  if (tentativasErradas < c.livres) return 0;
  if (tentativasErradas < c.limite1) return c.atraso1Ms;
  if (tentativasErradas < c.limite2) return c.atraso2Ms;
  return c.atrasoMaxMs;
}
