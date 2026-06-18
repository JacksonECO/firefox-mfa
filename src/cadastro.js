// Validação pura do formulário de cadastro de MFA (ver ia/04).
// Usada tanto no popup (erros inline) quanto no background (defesa em
// profundidade), garantindo a mesma regra dos dois lados.

import { normalizarSegredo, ehBase32Valido } from './base32.js';
import { normalizarDominio } from './dominio.js';

/**
 * Valida e normaliza os campos do cadastro.
 * - `nome`: obrigatório (texto não vazio).
 * - `dominio`: opcional (vazio ⇒ null).
 * - `secret`: obrigatório e em formato Base32 válido.
 *
 * @param {{nome?: string, dominio?: string, secret?: string}} campos
 * @returns {{valido: boolean, erros: {nome?: string, secret?: string},
 *            normalizado: {nome: string, dominio: string|null, secret: string}}}
 */
export function validarCadastro({ nome, dominio, secret } = {}) {
  const erros = {};

  if (typeof nome !== 'string' || nome.trim() === '') {
    erros.nome = 'Informe um nome.';
  }

  if (typeof secret !== 'string' || secret.trim() === '') {
    erros.secret = 'Informe a chave (segredo).';
  } else if (!ehBase32Valido(secret)) {
    erros.secret = 'Chave inválida: use apenas letras A–Z e dígitos 2–7 (Base32).';
  }

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    normalizado: {
      nome: typeof nome === 'string' ? nome.trim() : '',
      dominio: normalizarDominio(dominio),
      secret: normalizarSegredo(secret),
    },
  };
}
