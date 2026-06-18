// Configuração do autopreenchimento na página (ver ia/18). Puro.
//
// O autopreenchimento é OPT-IN (desligado por padrão), pois injeta o código na
// página da aba ativa. Só o código de 6 dígitos é inserido — nunca o segredo.
// O seletor padrão cobre o atributo padronizado de campos OTP.

export const SELETOR_OTP_PADRAO = 'input[autocomplete="one-time-code"]';

export const AUTOFILL_PADRAO = Object.freeze({
  habilitado: false,
  seletor: SELETOR_OTP_PADRAO,
});

/** Sanitiza a config de autofill vinda da UI. */
export function normalizarConfigAutofill(parcial = {}) {
  const seletor =
    typeof parcial.seletor === 'string' && parcial.seletor.trim() !== ''
      ? parcial.seletor.trim()
      : SELETOR_OTP_PADRAO;
  return { habilitado: Boolean(parcial.habilitado), seletor };
}
