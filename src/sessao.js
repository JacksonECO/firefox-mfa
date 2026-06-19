// Sessão em memória + operações de senha mestra (ver CLAUDE.md / ia/02).
//
// É o ÚNICO detentor da CryptoKey em memória. Importado apenas pelo
// background.js — roda exclusivamente no service worker, nunca no popup.
// A chave nunca é persistida nem sai deste contexto; o popup só recebe
// respostas (códigos, metadados), nunca a chave ou o segredo bruto.

import * as cripto from './crypto.js';
import * as storage from './storage.js';
import { calcularAtraso, normalizarConfigRateLimit } from './ratelimit.js';
import { TAMANHO_MINIMO_SENHA } from './senha.js';
import { TIMEOUT_PADRAO_MS, normalizarTimeout } from './sessaoconfig.js';

const NOME_ALARME = 'firefox-mfa-expiracao-sessao';

// Timeout de inatividade (configurável, task 21). Carregado do storage ao
// desbloquear; mantido em memória para que `estaDesbloqueado` (síncrono) o use.
let timeoutMs = TIMEOUT_PADRAO_MS;

/** Espera real (sobreponível nos testes para não atrasar de verdade). */
const esperaReal = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// Estado em memória do worker. Some se o worker for descarregado/reiniciado —
// comportamento aceitável e até desejável (equivale a expirar a sessão).
let chaveEmMemoria = null;
let ultimaAtividade = 0;

export { NOME_ALARME };

/** Define o timeout de inatividade em memória (chamado ao salvar a config). */
export function definirTimeoutMs(ms) {
  timeoutMs = normalizarTimeout(ms);
}

/** Carrega o timeout salvo (ou o padrão) para a memória. */
async function carregarTimeout() {
  timeoutMs = normalizarTimeout((await storage.obterTimeoutSessao()) ?? TIMEOUT_PADRAO_MS);
}

/** Há senha mestra já cadastrada? (delega ao storage). */
export async function estaInicializado() {
  return storage.estaInicializado();
}

/**
 * Primeiro acesso: define a senha mestra, gera salt, deriva a chave, salva o
 * valor de controle criptografado e já deixa a sessão desbloqueada.
 */
export async function definirSenhaMestra(senha) {
  if (await storage.estaInicializado()) {
    throw new Error('A senha mestra já foi definida.');
  }
  if (typeof senha !== 'string' || senha.length === 0) {
    throw new Error('Senha mestra inválida.');
  }
  const salt = cripto.gerarBytesAleatorios(cripto.TAMANHO_SALT);
  const chave = await cripto.derivarChave(senha, salt);
  const controle = await cripto.criptografar(cripto.VALOR_CONTROLE, chave);
  await storage.salvarSalt(salt);
  await storage.salvarValorControle(controle);
  await carregarTimeout();
  ativarSessao(chave);
  return true;
}

/**
 * Desbloqueio em acessos seguintes. A validade da senha é decidida
 * EXCLUSIVAMENTE pelo sucesso/falha do decrypt do valor de controle (a tag
 * AES-GCM é verificada em tempo constante pelo navegador). Sem comparação
 * manual de strings — isso reintroduziria risco de timing attack.
 *
 * Rate limiting (task 10): antes de processar, aplica um atraso progressivo em
 * função das tentativas erradas consecutivas (contador persistido). Acerto
 * zera o contador; erro o incrementa. Toda a lógica vive aqui no background.
 *
 * @param {string} senha
 * @param {{esperar?: (ms:number)=>Promise<void>}} [opcoes] `esperar` é
 *   sobreponível nos testes para não atrasar de verdade.
 * @returns {Promise<boolean>} true se a senha estava correta.
 */
export async function desbloquear(senha, { esperar = esperaReal } = {}) {
  if (typeof senha !== 'string' || senha.length === 0) return false;
  const salt = await storage.obterSalt();
  const controle = await storage.obterValorControle();
  if (!salt || !controle) return false; // ainda não inicializado

  const tentativas = await storage.obterTentativas();
  const config = normalizarConfigRateLimit((await storage.obterConfigRateLimit()) ?? {});
  await esperar(calcularAtraso(tentativas, config));

  const chave = await cripto.derivarChave(senha, salt);
  try {
    await cripto.descriptografar(controle.ciphertext, controle.iv, chave);
  } catch {
    await storage.salvarTentativas(tentativas + 1); // senha incorreta
    return false;
  }
  await storage.resetarTentativas(); // acerto: zera a fricção
  await carregarTimeout();
  ativarSessao(chave);
  return true;
}

/**
 * Troca a senha mestra (task 17): valida a senha atual, deriva uma nova chave
 * (novo salt) e RECRIPTOGRAFA todos os segredos com ela (novos IVs), tudo em
 * uma escrita atômica. Mantém a sessão aberta com a nova chave.
 * @returns {Promise<{ok: boolean, erro?: string}>}
 */
export async function trocarSenhaMestra(senhaAtual, senhaNova) {
  if (typeof senhaNova !== 'string' || senhaNova.length < TAMANHO_MINIMO_SENHA) {
    return { ok: false, erro: 'SENHA_NOVA_INVALIDA' };
  }
  const salt = await storage.obterSalt();
  const controle = await storage.obterValorControle();
  if (!salt || !controle) return { ok: false, erro: 'NAO_INICIALIZADO' };

  // Confirma a senha atual pelo decrypt do valor de controle (timing-safe).
  const chaveAtual = await cripto.derivarChave(senhaAtual, salt);
  try {
    await cripto.descriptografar(controle.ciphertext, controle.iv, chaveAtual);
  } catch {
    return { ok: false, erro: 'SENHA_ATUAL_INCORRETA' };
  }

  const novoSalt = cripto.gerarBytesAleatorios(cripto.TAMANHO_SALT);
  const novaChave = await cripto.derivarChave(senhaNova, novoSalt);

  // Recifra cada segredo: decripta com a chave antiga, cifra com a nova (novo IV).
  // Registros de localhost SEM criptografia (task 26) não dependem da chave —
  // mantém-se como estão (não têm secretCriptografado/iv para decifrar).
  const todos = await storage.listarMfas();
  const agora = Date.now();
  const recifrados = [];
  for (const mfa of todos) {
    if (mfa.semCriptografia) {
      recifrados.push(mfa);
      continue;
    }
    const segredo = await cripto.descriptografar(mfa.secretCriptografado, mfa.iv, chaveAtual);
    const { ciphertext, iv } = await cripto.criptografar(segredo, novaChave);
    recifrados.push({ ...mfa, secretCriptografado: ciphertext, iv, updatedAt: agora });
  }
  const novoControle = await cripto.criptografar(cripto.VALOR_CONTROLE, novaChave);

  await storage.aplicarTrocaSenha({ saltBytes: novoSalt, controle: novoControle, mfas: recifrados });
  ativarSessao(novaChave);
  return { ok: true };
}

/** Ativa a sessão com uma chave já derivada e (re)inicia o timer. */
export function ativarSessao(chave) {
  chaveEmMemoria = chave;
  registrarAtividade();
}

/** Marca atividade: atualiza o relógio de inatividade e reagenda a expiração. */
export function registrarAtividade() {
  ultimaAtividade = Date.now();
  agendarExpiracao();
}

/** A sessão está ativa e dentro da janela de 2 minutos? Não conta como interação. */
export function estaDesbloqueado() {
  if (!chaveEmMemoria) return false;
  if (Date.now() - ultimaAtividade > timeoutMs) {
    bloquear();
    return false;
  }
  return true;
}

/**
 * Retorna a CryptoKey para uso interno do background (gerar TOTP, salvar, etc.)
 * ou null se a sessão expirou. Usar a chave conta como interação.
 * NUNCA expor o retorno desta função fora do background.
 */
export function obterChave() {
  if (!estaDesbloqueado()) return null;
  registrarAtividade();
  return chaveEmMemoria;
}

/** Apaga a chave da memória e cancela a expiração. */
export function bloquear() {
  chaveEmMemoria = null;
  ultimaAtividade = 0;
  cancelarExpiracao();
}

function agendarExpiracao() {
  // Nome de alarme fixo ⇒ recriar substitui o agendamento anterior. Garante
  // que múltiplas interações/checagens não acumulem alarmes duplicados.
  globalThis.browser?.alarms?.create(NOME_ALARME, {
    delayInMinutes: timeoutMs / 60_000,
  });
}

function cancelarExpiracao() {
  globalThis.browser?.alarms?.clear(NOME_ALARME);
}
