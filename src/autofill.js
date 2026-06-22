// Configuração do autopreenchimento na página (ver ia/18 e ia/23). Puro.
//
// O autopreenchimento é OPT-IN (desligado por padrão), pois injeta o código na
// página da aba ativa. Só o código de 6 dígitos é inserido — nunca o segredo.
//
// Suporta um seletor padrão (global) e seletores por domínio (overrides). Cada
// seletor pode casar um único input ou vários (um por dígito), e pode conter
// múltiplos seletores separados por vírgula (querySelectorAll).

export const SELETOR_OTP_PADRAO = 'input[autocomplete="one-time-code"]';

export const AUTOFILL_PADRAO = Object.freeze({
  habilitado: false,
  seletorPadrao: SELETOR_OTP_PADRAO,
  fecharAoPreencher: false,
  porDominio: {},
});

const ehTexto = (v) => typeof v === 'string';

/**
 * Sanitiza a config de autofill. Aceita o formato antigo (`seletor`) e migra
 * para `seletorPadrao`. Normaliza domínios (minúsculo, sem espaços) e descarta
 * entradas vazias.
 */
export function normalizarConfigAutofill(parcial = {}) {
  let seletorPadrao = SELETOR_OTP_PADRAO;
  if (ehTexto(parcial.seletorPadrao) && parcial.seletorPadrao.trim() !== '') {
    seletorPadrao = parcial.seletorPadrao.trim();
  } else if (ehTexto(parcial.seletor) && parcial.seletor.trim() !== '') {
    seletorPadrao = parcial.seletor.trim(); // migração do formato antigo
  }

  const porDominio = {};
  const origem =
    parcial.porDominio && typeof parcial.porDominio === 'object' ? parcial.porDominio : {};
  for (const [dom, sel] of Object.entries(origem)) {
    const dominio = String(dom).trim().toLowerCase();
    if (dominio !== '' && ehTexto(sel) && sel.trim() !== '') {
      porDominio[dominio] = sel.trim();
    }
  }

  return {
    habilitado: Boolean(parcial.habilitado),
    seletorPadrao,
    fecharAoPreencher: Boolean(parcial.fecharAoPreencher),
    porDominio,
  };
}

/**
 * Resolve qual seletor usar para um domínio: o override do domínio, se houver;
 * senão o seletor padrão.
 */
export function resolverSeletor(config, dominio) {
  const c = normalizarConfigAutofill(config ?? {});
  if (dominio && c.porDominio[dominio]) return c.porDominio[dominio];
  return c.seletorPadrao;
}
