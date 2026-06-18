// Sessão em memória + operações de senha mestra (ver CLAUDE.md / ia/02).
//
// É o ÚNICO detentor da CryptoKey em memória. Importado apenas pelo
// background.js — roda exclusivamente no service worker, nunca no popup.
// A chave nunca é persistida nem sai deste contexto; o popup só recebe
// respostas (códigos, metadados), nunca a chave ou o segredo bruto.

import * as cripto from './crypto.js';
import * as storage from './storage.js';
import { calcularAtraso, normalizarConfigRateLimit } from './ratelimit.js';

const TIMEOUT_MS = 2 * 60 * 1000; // expira após 2 min de inatividade
const NOME_ALARME = 'firefox-mfa-expiracao-sessao';

/** Espera real (sobreponível nos testes para não atrasar de verdade). */
const esperaReal = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// Estado em memória do worker. Some se o worker for descarregado/reiniciado —
// comportamento aceitável e até desejável (equivale a expirar a sessão).
let chaveEmMemoria = null;
let ultimaAtividade = 0;

export { TIMEOUT_MS, NOME_ALARME };

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
  ativarSessao(chave);
  return true;
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
  if (Date.now() - ultimaAtividade > TIMEOUT_MS) {
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
    delayInMinutes: TIMEOUT_MS / 60_000,
  });
}

function cancelarExpiracao() {
  globalThis.browser?.alarms?.clear(NOME_ALARME);
}
