// Lógica pura da tela de desbloqueio/cadastro de senha mestra (ver ia/05).
// Sem estado, sem browser.* — testável isoladamente.

// Único requisito OBRIGATÓRIO da senha mestra: 3 caracteres no mínimo. Os demais
// fatores (maiúscula, minúscula, número, especial, comprimento) são apenas
// informativos — ver avaliarForcaSenha.
export const TAMANHO_MINIMO_SENHA = 3;

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

// Critérios de força avaliados (na ordem de exibição). São puramente informativos.
export const CRITERIOS_FORCA = Object.freeze([
  { chave: 'comprimento', rotulo: '8+ caracteres' },
  { chave: 'minuscula', rotulo: 'Letra minúscula' },
  { chave: 'maiuscula', rotulo: 'Letra maiúscula' },
  { chave: 'numero', rotulo: 'Número' },
  { chave: 'especial', rotulo: 'Caractere especial' },
]);

/**
 * Avalia a força da senha de forma puramente INFORMATIVA (não bloqueia o cadastro;
 * o único requisito obrigatório é o tamanho mínimo, validado em validarCadastroSenha).
 * Classifica cada fator e dá um nível/rótulo geral para feedback na UI.
 * @param {string} senha
 * @returns {{
 *   comprimento: number,
 *   atendeMinimo: boolean,
 *   criterios: {comprimento: boolean, minuscula: boolean, maiuscula: boolean, numero: boolean, especial: boolean},
 *   pontos: number,
 *   nivel: number,
 *   rotulo: string,
 * }}
 */
export function avaliarForcaSenha(senha = '') {
  const s = typeof senha === 'string' ? senha : '';
  const criterios = {
    comprimento: s.length >= 8,
    minuscula: /\p{Ll}/u.test(s),
    maiuscula: /\p{Lu}/u.test(s),
    numero: /\p{Nd}/u.test(s),
    especial: /[^\p{L}\p{N}]/u.test(s),
  };
  const pontos = Object.values(criterios).filter(Boolean).length;
  const atendeMinimo = s.length >= TAMANHO_MINIMO_SENHA;

  let nivel;
  let rotulo;
  if (s.length === 0) {
    nivel = 0;
    rotulo = '';
  } else if (!atendeMinimo) {
    nivel = 0;
    rotulo = 'Muito curta';
  } else if (pontos <= 1) {
    nivel = 1;
    rotulo = 'Fraca';
  } else if (pontos <= 3) {
    nivel = 2;
    rotulo = 'Média';
  } else if (pontos === 4) {
    nivel = 3;
    rotulo = 'Forte';
  } else {
    nivel = 4;
    rotulo = 'Muito forte';
  }

  return { comprimento: s.length, atendeMinimo, criterios, pontos, nivel, rotulo };
}
