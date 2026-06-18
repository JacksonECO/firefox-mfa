// Exportar/importar dados (ver ia/14). Reaproveita o esquema de criptografia
// da task 02 (PBKDF2 + AES-GCM), mas com uma SENHA DE EXPORTAÇÃO própria e um
// salt gerado só para o arquivo — independente da senha mestra do cofre.
//
// O arquivo exportado NUNCA contém segredo em claro: os registros vão dentro de
// um payload criptografado. Roda no background (recebe os segredos em claro só
// no momento de exportar, vindos da descriptografia local).

import * as cripto from './crypto.js';

const FORMATO = 'firefox-mfa-export';
const VERSAO = 1;

/**
 * Gera o objeto de backup (serializável em JSON) a partir dos registros com o
 * segredo já em claro.
 * @param {Array<{nome:string, dominio:string|null, secret:string}>} registros
 * @param {string} senhaExport
 * @returns {Promise<object>} arquivo de backup criptografado.
 */
export async function exportarDados(registros, senhaExport) {
  if (typeof senhaExport !== 'string' || senhaExport === '') {
    throw new Error('Senha de exportação obrigatória.');
  }
  const salt = cripto.gerarBytesAleatorios(cripto.TAMANHO_SALT);
  const chave = await cripto.derivarChave(senhaExport, salt);

  const controle = await cripto.criptografar(cripto.VALOR_CONTROLE, chave);
  const dados = await cripto.criptografar(JSON.stringify(registros), chave);

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
 * @returns {Promise<Array<{nome, dominio, secret}>>}
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
  const registros = JSON.parse(json);
  if (!Array.isArray(registros)) throw new Error('Conteúdo de backup inválido.');
  return registros;
}
