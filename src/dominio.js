// Utilitário compartilhado de domínio (ver ia/04). Criado nesta task e
// reaproveitado pela tela principal (task 06) para o filtro por domínio.
// Módulo puro — sem browser.*, sem DOM. Roda no popup, no background e nos testes.

/**
 * Extrai o domínio (hostname) da aba ativa. Retorna `null` quando não há um
 * domínio http(s) utilizável: aba sem `url`, páginas `about:`/`chrome:`/`file:`/
 * `moz-extension:`/`chrome-extension:`, ou URL ausente por restrição de permissão.
 * Nunca lança.
 * @param {{url?: string}|null|undefined} aba
 * @returns {string|null} hostname (já minúsculo pelo parser nativo) ou null.
 */
export function extrairDominioDaAba(aba) {
  const url = aba?.url;
  if (typeof url !== 'string' || url === '') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.hostname || null;
}

/**
 * Normaliza um domínio digitado/pré-preenchido para o mesmo formato usado no
 * filtro (minúsculo, sem espaços nas bordas). String vazia vira `null`.
 * @param {unknown} valor
 * @returns {string|null}
 */
export function normalizarDominio(valor) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim().toLowerCase();
  return limpo === '' ? null : limpo;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * É um domínio de loopback/localhost? Usado para liberar o fluxo de MFAs sem
 * criptografia (task 26), estritamente isolado a esses hosts.
 * @param {unknown} dominio
 * @returns {boolean}
 */
export function ehLocalhost(dominio) {
  if (typeof dominio !== 'string') return false;
  const d = dominio.trim().toLowerCase();
  return LOOPBACK.has(d) || d.endsWith('.localhost');
}
