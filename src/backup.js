// Exportar/importar dados (ver ia/14). Reaproveita o esquema de criptografia
// da task 02 (PBKDF2 + AES-GCM), mas com uma SENHA DE EXPORTAÇÃO própria e um
// salt gerado só para o arquivo — independente da senha mestra do cofre.
//
// O arquivo exportado NUNCA contém segredo em claro: os registros vão dentro de
// um payload criptografado. Roda no background (recebe os segredos em claro só
// no momento de exportar, vindos da descriptografia local).

import * as cripto from './crypto.js';

const FORMATO = 'firefox-mfa-export';
const VERSAO = 2; // v2 acrescentou as contas do site (e-mail + senha)

/**
 * Filtro da exportação (task 31): o usuário escolhe QUAIS domínios e QUAIS
 * tipos de dado saem no arquivo. `dominios: null` significa "todos"; um array
 * seleciona domínios exatos e aceita `null` para os MFAs sem domínio.
 */
export const FILTRO_PADRAO = Object.freeze({
  incluirMfas: true,
  incluirContas: true,
  incluirConfig: true,
  dominios: null,
});

export function normalizarFiltroExport(parcial = {}) {
  const origem = parcial && typeof parcial === 'object' ? parcial : {};
  const marcado = (valor) => valor !== false; // ausente ⇒ incluir
  let dominios = null;
  if (Array.isArray(origem.dominios)) {
    dominios = origem.dominios.map((d) =>
      typeof d === 'string' && d.trim() !== '' ? d.trim().toLowerCase() : null,
    );
  }
  return {
    incluirMfas: marcado(origem.incluirMfas),
    incluirContas: marcado(origem.incluirContas),
    incluirConfig: marcado(origem.incluirConfig),
    dominios,
  };
}

/** Este domínio foi selecionado para exportar? */
export function dominioSelecionado(filtro, dominio) {
  if (!filtro || filtro.dominios === null) return true;
  return filtro.dominios.includes(dominio ?? null);
}

/**
 * Gera o objeto de backup (serializável em JSON) a partir do conteúdo já em
 * claro — MFAs, contas do site e, opcionalmente, as configurações.
 * @param {{mfas?: Array, contas?: Array, configuracoes?: object|null}} conteudo
 * @param {string} senhaExport
 * @returns {Promise<object>} arquivo de backup criptografado.
 */
export async function exportarDados(
  { mfas = [], contas = [], configuracoes = null } = {},
  senhaExport,
) {
  if (typeof senhaExport !== 'string' || senhaExport === '') {
    throw new Error('Senha de exportação obrigatória.');
  }
  const salt = cripto.gerarBytesAleatorios(cripto.TAMANHO_SALT);
  const chave = await cripto.derivarChave(senhaExport, salt);

  const controle = await cripto.criptografar(cripto.VALOR_CONTROLE, chave);
  const payload = { mfas, contas, configuracoes: configuracoes ?? null };
  const dados = await cripto.criptografar(JSON.stringify(payload), chave);

  return {
    formato: FORMATO,
    versao: VERSAO,
    exportadoEm: Date.now(),
    salt: cripto.bytesParaBase64(salt),
    controle,
    dados,
  };
}

/**
 * Decifra um arquivo de backup com a senha de exportação.
 * @param {object} arquivo objeto de backup (já parseado de JSON)
 * @param {string} senhaExport
 * @returns {Promise<{mfas: Array, contas: Array, configuracoes: object|null}>}
 * @throws se a senha estiver errada ou o arquivo for inválido.
 */
export async function importarDados(arquivo, senhaExport) {
  if (!arquivo || arquivo.formato !== FORMATO || typeof arquivo.salt !== 'string') {
    throw new Error('Arquivo de backup inválido.');
  }
  if (typeof senhaExport !== 'string' || senhaExport === '') {
    throw new Error('Senha de exportação obrigatória.');
  }
  const salt = cripto.base64ParaBytes(arquivo.salt);
  const chave = await cripto.derivarChave(senhaExport, salt);

  // Valida a senha pelo valor de controle (decrypt falha = senha errada), sem
  // tocar no payload — não corrompe nada se a senha estiver incorreta.
  try {
    await cripto.descriptografar(arquivo.controle.ciphertext, arquivo.controle.iv, chave);
  } catch {
    throw new Error('Senha de exportação incorreta.');
  }

  const json = await cripto.descriptografar(arquivo.dados.ciphertext, arquivo.dados.iv, chave);
  const conteudo = JSON.parse(json);

  // Compat: o formato mais antigo guardava só um array de MFAs; a v1 tinha
  // MFAs + configurações, sem contas.
  if (Array.isArray(conteudo)) return { mfas: conteudo, contas: [], configuracoes: null };
  if (conteudo && Array.isArray(conteudo.mfas)) {
    return {
      mfas: conteudo.mfas,
      contas: Array.isArray(conteudo.contas) ? conteudo.contas : [],
      configuracoes: conteudo.configuracoes ?? null,
    };
  }
  throw new Error('Conteúdo de backup inválido.');
}
