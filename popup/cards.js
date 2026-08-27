// Componente de card de MFA: código, cronômetro e copiar (ver ia/07 e ia/08).
//
// Segurança: `nome` e `dominio` (texto livre do usuário) são inseridos SEMPRE
// via textContent — nunca innerHTML. O segredo nunca é manuseado aqui; o card
// só conhece o código de 6 dígitos que o background devolve.

import { codigoParaCopia, formatarCodigoExibicao } from '../src/codigo.js';
import { segundosRestantes, janelaAtual, PASSO_PADRAO } from '../src/totp.js';

const RAIO = 16;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const DURACAO_FEEDBACK_MS = 1500;

let ticker = null;
let controladores = [];

/**
 * Copia um código para a área de transferência. `clipboard` é injetável para
 * teste; em runtime usa `navigator.clipboard`.
 * @returns {Promise<string>} o valor efetivamente copiado (só dígitos).
 */
export async function copiarParaClipboard(codigo, clipboard = globalThis.navigator?.clipboard) {
  const valor = codigoParaCopia(codigo);
  if (valor === '') throw new Error('Código vazio.');
  if (!clipboard?.writeText) throw new Error('Clipboard indisponível.');
  await clipboard.writeText(valor);
  return valor;
}

/** Para o ticker e descarta os controladores (ao sair da tela principal). */
export function pararTicker() {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
  controladores = [];
}

/**
 * Renderiza a lista de cards dentro de `container`.
 * @param {HTMLElement} container
 * @param {Array} itens metadados dos MFAs (id, nome, dominio)
 * @param {{obterCodigo: (id:string)=>Promise<any>, aoEditar: (id:string)=>void,
 *         contasPorDominio?: Record<string, number>,
 *         aoPreencherLogin?: (dominio:string)=>Promise<boolean>}} cbs
 *   `contasPorDominio` só informa a CONTAGEM de contas por domínio — o card
 *   nunca vê e-mail nem senha; ele apenas mostra o ícone e pede o preenchimento.
 * @returns {Promise<Array>} os controladores criados (cada um expõe `.codigo`).
 */
export async function renderizarLista(
  container,
  itens,
  { obterCodigo, aoEditar, contasPorDominio = {}, aoPreencherLogin = null },
) {
  pararTicker();
  container.replaceChildren();

  const template = document.getElementById('tpl-card');
  controladores = itens.map((mfa) =>
    criarCard(template, mfa, { obterCodigo, aoEditar, contasPorDominio, aoPreencherLogin }),
  );
  for (const c of controladores) container.append(c.el);

  await Promise.all(controladores.map((c) => c.atualizarCodigo()));
  tique();
  ticker = setInterval(tique, 1000);
  return controladores;
}

function tique() {
  const agora = Date.now();
  const restante = segundosRestantes(agora, PASSO_PADRAO);
  const janela = janelaAtual(agora, PASSO_PADRAO);
  for (const c of controladores) {
    c.atualizarCronometro(restante);
    if (c.janela !== janela) {
      c.janela = janela;
      c.atualizarCodigo(); // virou a janela: re-busca o código (sem reabrir o popup)
    }
  }
}

function criarCard(template, mfa, { obterCodigo, aoEditar, contasPorDominio, aoPreencherLogin }) {
  const fragmento = template.content.cloneNode(true);
  const el = fragmento.querySelector('.card');

  el.querySelector('.card__nome').textContent = mfa.nome; // textContent: seguro
  const dominioEl = el.querySelector('.card__dominio');
  if (mfa.dominio) dominioEl.textContent = mfa.dominio;
  else dominioEl.hidden = true;

  const codigoBtn = el.querySelector('.card__codigo');
  const codigoTexto = el.querySelector('.card__codigo-texto');
  const feedback = el.querySelector('.card__feedback');
  const segundosEl = el.querySelector('.card__segundos');
  const ringFg = el.querySelector('.ring__fg');
  ringFg.style.strokeDasharray = String(CIRCUNFERENCIA);

  let codigoAtual = '';

  const controlador = {
    el,
    janela: null,
    // Último código buscado, para as ações "ao abrir" (task 28) reaproveitarem
    // o valor já renderizado em vez de refazer GET_CODE / GET_CODE_LOCALHOST.
    get codigo() {
      return codigoAtual;
    },
    async atualizarCodigo() {
      const resp = await obterCodigo(mfa.id);
      if (resp?.ok && typeof resp.codigo === 'string') {
        codigoAtual = resp.codigo;
        codigoTexto.textContent = formatarCodigoExibicao(codigoAtual);
        this.janela = janelaAtual(Date.now(), PASSO_PADRAO);
      } else {
        codigoAtual = '';
        codigoTexto.textContent = '------';
      }
    },
    atualizarCronometro(restante) {
      segundosEl.textContent = String(restante);
      const fracao = restante / PASSO_PADRAO;
      ringFg.style.strokeDashoffset = String(CIRCUNFERENCIA * (1 - fracao));
    },
  };

  codigoBtn.addEventListener('click', async () => {
    // Captura SÍNCRONA do código exibido no instante do clique — evita copiar
    // um valor "futuro" caso o ticker vire a janela logo depois.
    const instantaneo = codigoAtual;
    try {
      await copiarParaClipboard(instantaneo);
      sinalizar(feedback, 'Copiado!', 'card__feedback--ok');
    } catch {
      sinalizar(feedback, 'Falha ao copiar', 'card__feedback--erro');
    }
  });

  // Ícone indicativo: este site tem e-mail e senha salvos. Clicar preenche na
  // página (a senha nunca passa por aqui — quem injeta é o background).
  const botaoContas = el.querySelector('.card__contas');
  if (mfa.dominio && (contasPorDominio?.[mfa.dominio] ?? 0) > 0) {
    botaoContas.hidden = false;
    if (typeof aoPreencherLogin === 'function') {
      botaoContas.addEventListener('click', () => aoPreencherLogin(mfa.dominio));
    }
  }

  const botaoEditar = el.querySelector('.card__editar');
  if (typeof aoEditar === 'function') {
    botaoEditar.addEventListener('click', () => aoEditar(mfa.id));
  } else {
    botaoEditar.hidden = true; // sem edição (ex: fluxo localhost sem login)
  }
  return controlador;
}

function sinalizar(feedback, texto, classe) {
  feedback.textContent = texto;
  feedback.classList.add(classe);
  feedback.hidden = false;
  setTimeout(() => {
    feedback.hidden = true;
    feedback.classList.remove('card__feedback--ok', 'card__feedback--erro');
  }, DURACAO_FEEDBACK_MS);
}
