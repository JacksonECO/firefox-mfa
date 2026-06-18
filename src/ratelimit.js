// Rate limiting de tentativas de senha mestra (ver ia/10). Puro.
//
// Atraso progressivo aplicado ANTES de processar a próxima tentativa, em função
// de quantas tentativas erradas consecutivas já foram registradas. Não há
// bloqueio permanente — só fricção crescente contra força bruta local.

/**
 * Atraso (ms) antes de processar a próxima tentativa, dado o número de
 * tentativas erradas consecutivas já acumuladas:
 *   0–2  → 0s   (1ª, 2ª e 3ª tentativas livres)
 *   3–5  → 1s   (4ª–6ª)
 *   6–9  → 5s   (7ª–10ª)
 *   ≥10  → 30s  (11ª em diante; teto, não cresce mais)
 */
export function calcularAtraso(tentativasErradas) {
  if (tentativasErradas < 3) return 0;
  if (tentativasErradas < 6) return 1000;
  if (tentativasErradas < 10) return 5000;
  return 30000;
}
