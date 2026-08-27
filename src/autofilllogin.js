// Autopreenchimento de login na página: e-mail/usuário + senha (ver ia/30).
// Módulo puro — sem browser.*, sem estado. Roda no background, no popup (só a
// parte de configuração) e nos testes.
//
// Diferença importante em relação ao autofill de MFA (ia/18): ali só trafega o
// código de 6 dígitos; aqui trafega a SENHA do site. Por isso a injeção é feita
// pelo background (dono da chave) — a senha em claro nunca entra no popup.
//
// Como o de MFA, é OPT-IN e nunca envia o formulário por padrão.

export const SELETOR_EMAIL_PADRAO =
  'input[autocomplete="username"], input[type="email"], input[name*="email" i], ' +
  'input[name*="user" i], input[name*="login" i], input[id*="email" i], input[id*="user" i]';

export const SELETOR_SENHA_PADRAO = 'input[type="password"]';

export const LOGIN_PADRAO = Object.freeze({
  habilitado: false,
  seletorEmailPadrao: SELETOR_EMAIL_PADRAO,
  seletorSenhaPadrao: SELETOR_SENHA_PADRAO,
  submeter: false, // enviar com Enter depois de preencher — desligado por padrão
  porDominio: {},
});

const ehTexto = (v) => typeof v === 'string';
const limpo = (v, padrao) => (ehTexto(v) && v.trim() !== '' ? v.trim() : padrao);

/**
 * Sanitiza a sub-config de login. Ausente ⇒ padrões (retrocompatível com
 * configurações salvas antes desta funcionalidade). Domínios são normalizados
 * (minúsculo, sem espaços) e entradas sem nenhum seletor são descartadas.
 */
export function normalizarConfigLogin(parcial = {}) {
  const origem = parcial && typeof parcial === 'object' ? parcial : {};

  const porDominio = {};
  const mapa =
    origem.porDominio && typeof origem.porDominio === 'object' ? origem.porDominio : {};
  for (const [dom, valor] of Object.entries(mapa)) {
    const dominio = String(dom).trim().toLowerCase();
    if (dominio === '' || !valor || typeof valor !== 'object') continue;
    const entrada = {};
    if (ehTexto(valor.email) && valor.email.trim() !== '') entrada.email = valor.email.trim();
    if (ehTexto(valor.senha) && valor.senha.trim() !== '') entrada.senha = valor.senha.trim();
    if (Object.keys(entrada).length > 0) porDominio[dominio] = entrada;
  }

  return {
    habilitado: Boolean(origem.habilitado),
    seletorEmailPadrao: limpo(origem.seletorEmailPadrao, SELETOR_EMAIL_PADRAO),
    seletorSenhaPadrao: limpo(origem.seletorSenhaPadrao, SELETOR_SENHA_PADRAO),
    submeter: Boolean(origem.submeter),
    porDominio,
  };
}

/**
 * Resolve os seletores de login de um domínio: o override do domínio, quando
 * houver, senão o seletor padrão — campo a campo.
 * @param {object} configAutofill config completa de autofill (com `.login`)
 * @returns {{email: string, senha: string}}
 */
export function resolverSeletorLogin(configAutofill, dominio) {
  const login = normalizarConfigLogin(configAutofill?.login ?? {});
  const override = (dominio && login.porDominio[dominio]) || {};
  return {
    email: limpo(override.email, login.seletorEmailPadrao),
    senha: limpo(override.senha, login.seletorSenhaPadrao),
  };
}

/**
 * Função INJETADA na página (roda no contexto da aba, não na extensão). Precisa
 * ser autocontida — sem closures/imports — porque é serializada para o
 * `scripting.executeScript`. Exportada só para o background referenciá-la e
 * para os testes exercitarem a lógica com um `document` falso.
 *
 * Regras: ignora campos invisíveis/desabilitados; se o seletor de e-mail não
 * casar, usa o campo de texto visível imediatamente anterior ao de senha no
 * mesmo formulário; grava pelo setter nativo de `value` antes de disparar
 * input/change (formulários React só reconhecem a mudança assim); e só dispara
 * Enter quando `submeter` for verdadeiro.
 */
export function preencherLogin(seletorEmail, seletorSenha, email, senha, submeter) {
  const utilizavel = (el) => {
    if (!el || el.disabled === true || el.readOnly === true) return false;
    const tipo = String(el.type || 'text').toLowerCase();
    if (tipo === 'hidden') return false;
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
    return true;
  };

  const primeiro = (seletor) => {
    if (typeof seletor !== 'string' || seletor.trim() === '') return null;
    let achados;
    try {
      achados = document.querySelectorAll(seletor);
    } catch {
      return null; // seletor CSS inválido
    }
    for (const el of Array.from(achados || [])) {
      if (utilizavel(el)) return el;
    }
    return null;
  };

  const definir = (el, valor) => {
    const proto = globalThis.HTMLInputElement && globalThis.HTMLInputElement.prototype;
    const descritor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (descritor && typeof descritor.set === 'function') descritor.set.call(el, valor);
    else el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const campoSenha = primeiro(seletorSenha);
  let campoEmail = primeiro(seletorEmail);

  if (!campoEmail && campoSenha) {
    const escopo = campoSenha.form || document;
    const candidatos = Array.from(escopo.querySelectorAll('input')).filter(utilizavel);
    for (let i = candidatos.indexOf(campoSenha) - 1; i >= 0; i--) {
      const tipo = String(candidatos[i].type || 'text').toLowerCase();
      if (tipo === 'text' || tipo === 'email' || tipo === 'tel') {
        campoEmail = candidatos[i];
        break;
      }
    }
  }

  const preencheuEmail = Boolean(campoEmail && email);
  const preencheuSenha = Boolean(campoSenha && senha);
  if (preencheuEmail) definir(campoEmail, email);
  if (preencheuSenha) definir(campoSenha, senha);

  if (submeter === true && preencheuSenha) {
    campoSenha.focus();
    for (const tipo of ['keydown', 'keypress', 'keyup']) {
      campoSenha.dispatchEvent(
        new KeyboardEvent(tipo, {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
        }),
      );
    }
  }

  return {
    ok: preencheuEmail || preencheuSenha,
    email: preencheuEmail,
    senha: preencheuSenha,
    motivo: preencheuEmail || preencheuSenha ? null : 'nao_encontrado',
  };
}
