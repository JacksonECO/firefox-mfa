// Validação pura do formulário de conta do site — e-mail/usuário + senha por
// domínio (ver ia/30). Usada no popup (erros inline) e no background (defesa em
// profundidade), garantindo a mesma regra dos dois lados — igual a `cadastro.js`.

import { normalizarDominio } from './dominio.js';

export const TAMANHO_MAXIMO_EMAIL = 255;
export const TAMANHO_MAXIMO_ROTULO = 60;

/**
 * Valida e normaliza os campos de uma conta.
 * - `dominio`: obrigatório — a conta existe sempre vinculada a um site.
 * - `email`: obrigatório. NÃO é validado como e-mail: muitos sites usam usuário,
 *   CPF ou telefone no mesmo campo. Só exigimos algo não vazio e um limite.
 * - `senha`: obrigatória. Sem regra de força: é a senha do site, definida por ele
 *   — a senha forte que protege o cofre é a mestra (ver `senha.js`).
 * - `rotulo`: opcional, para distinguir várias contas do mesmo site.
 * - `exigirSenha`: false na edição, onde o campo em branco significa "manter".
 *
 * @param {{dominio?:string, email?:string, senha?:string, rotulo?:string}} campos
 * @param {{exigirSenha?: boolean}} [opcoes]
 */
export function validarConta({ dominio, email, senha, rotulo } = {}, { exigirSenha = true } = {}) {
  const erros = {};

  if (normalizarDominio(dominio) === null) {
    erros.dominio = 'Informe o site (domínio) desta conta.';
  }

  if (typeof email !== 'string' || email.trim() === '') {
    erros.email = 'Informe o e-mail ou usuário.';
  } else if (email.trim().length > TAMANHO_MAXIMO_EMAIL) {
    erros.email = `Máximo de ${TAMANHO_MAXIMO_EMAIL} caracteres.`;
  }

  if (exigirSenha && (typeof senha !== 'string' || senha === '')) {
    erros.senha = 'Informe a senha.';
  }

  if (typeof rotulo === 'string' && rotulo.trim().length > TAMANHO_MAXIMO_ROTULO) {
    erros.rotulo = `Máximo de ${TAMANHO_MAXIMO_ROTULO} caracteres.`;
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    normalizado: {
      dominio: normalizarDominio(dominio),
      email: typeof email === 'string' ? email.trim() : '',
      senha: typeof senha === 'string' ? senha : '',
      rotulo: typeof rotulo === 'string' && rotulo.trim() !== '' ? rotulo.trim() : null,
    },
  };
}

/**
 * Mascara um e-mail/usuário para exibição na lista de contas: mostra o primeiro
 * caractere (e o domínio, quando é um e-mail) e esconde o resto. Puro — a UI
 * usa `textContent` para renderizar o resultado.
 */
export function mascararEmail(valor) {
  if (typeof valor !== 'string' || valor === '') return '';
  const arroba = valor.lastIndexOf('@');
  if (arroba <= 0) {
    return valor.length <= 2 ? `${valor[0]}•••` : `${valor[0]}•••${valor[valor.length - 1]}`;
  }
  const usuario = valor.slice(0, arroba);
  const host = valor.slice(arroba);
  return `${usuario[0]}•••${host}`;
}
