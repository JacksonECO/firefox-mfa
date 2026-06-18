// Lógica pura da tela de desbloqueio/cadastro de senha mestra (ver ia/05).
// Sem estado, sem browser.* — testável isoladamente.

export const TAMANHO_MINIMO_SENHA = 8;

/**
 * Decide qual tela mostrar ao abrir o popup, a partir do estado consultado no
 * background.
 * @param {{temSenha: boolean, sessaoAtiva: boolean}} estado
 * @returns {'criar-senha'|'desbloquear'|'principal'}
 */
export function decidirTela({ temSenha, sessaoAtiva } = {}) {
  if (!temSenha) return 'criar-senha';
  if (sessaoAtiva) return 'principal';
  return 'desbloquear';
}

/**
 * Valida o formulário de cadastro da senha mestra (primeiro acesso):
 * senha não vazia, com tamanho mínimo, e confirmação coincidente.
 * @param {{senha?: string, confirmacao?: string}} campos
 * @returns {{valido: boolean, erros: {senha?: string, confirmacao?: string}}}
 */
export function validarCadastroSenha({ senha, confirmacao } = {}) {
  const erros = {};

  if (typeof senha !== 'string' || senha === '') {
    erros.senha = 'Informe uma senha.';
  } else if (senha.length < TAMANHO_MINIMO_SENHA) {
    erros.senha = `A senha deve ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }

  if (!erros.senha && senha !== confirmacao) {
    erros.confirmacao = 'As senhas não coincidem.';
  }

  return { valido: Object.keys(erros).length === 0, erros };
}
