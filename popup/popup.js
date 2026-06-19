// Popup da extensão (tasks 01–09): máquina de estados de telas, senha mestra,
// listagem por domínio, formulário de criar/editar e exclusão.
//
// Arquitetura (CLAUDE.md / ia/02): o popup NUNCA detém a CryptoKey nem segredos
// persistidos; só troca mensagens com o background e renderiza com a DOM API
// (textContent, nunca innerHTML). A única exceção é o REVEAL_SECRET pontual do
// fluxo de edição, descartado do campo ao sair.

import { extrairDominioDaAba, ehLocalhost } from '../src/dominio.js';
import { validarCadastro } from '../src/cadastro.js';
import { validarCadastroSenha, decidirTela } from '../src/senha.js';
import { decidirListagem, filtrarPorDominio } from '../src/listagem.js';
import { codigoParaCopia } from '../src/codigo.js';
import { resolverSeletor } from '../src/autofill.js';
import { renderizarLista, pararTicker, copiarParaClipboard } from './cards.js';

const VIEWS = [
  'view-criar-senha',
  'view-desbloquear',
  'view-principal',
  'view-formulario',
  'view-config',
  'view-localhost',
];

const $ = (id) => document.getElementById(id);
const enviar = (mensagem) => browser.runtime.sendMessage(mensagem);
const limpar = (el) => {
  el.textContent = '';
};
const dizer = (el, texto) => {
  el.textContent = texto;
};

// Estado da sessão do popup (não persiste).
let verTodos = false;
let dominioAtual = null;
let mfasCache = [];
let edicaoId = null; // null = modo criar; id = modo editar

/* ------------------------------ navegação ------------------------------ */

function mostrarVista(nome) {
  // O ticker é usado pela tela principal e pela tela localhost (ambas têm cards).
  if (nome !== 'principal' && nome !== 'localhost') pararTicker();
  $('dialog-excluir').hidden = true; // o diálogo é transitório: nunca persiste entre telas
  for (const id of VIEWS) $(id).hidden = id !== `view-${nome}`;
}

async function iniciar() {
  ligarEventos();
  await rotearVistaInicial();
}

async function rotearVistaInicial() {
  let temSenha = false;
  let sessaoAtiva = false;
  try {
    ({ inicializado: temSenha } = await enviar({ type: 'IS_INITIALIZED' }));
    if (temSenha) ({ desbloqueado: sessaoAtiva } = await enviar({ type: 'SESSION_STATUS' }));
  } catch {
    /* background indisponível: trata como primeiro acesso */
  }
  dominioAtual = await obterDominioAtual();

  if (sessaoAtiva) {
    await abrirPrincipal({ autoCopiar: true });
    return;
  }

  // Fluxo localhost sem senha mestra (task 26): só se houver MFAs locais sem cripto.
  if (ehLocalhost(dominioAtual)) {
    const locais = await enviar({ type: 'LIST_LOCALHOST', dominio: dominioAtual }).catch(() => null);
    if (locais?.ok && locais.mfas.length > 0) {
      abrirLocalhost(dominioAtual, locais.mfas);
      return;
    }
  }

  mostrarVista(decidirTela({ temSenha, sessaoAtiva })); // criar-senha ou desbloquear
}

function abrirLocalhost(dominio, mfas) {
  mostrarVista('localhost');
  dizer($('localhost-contexto'), `MFAs locais de ${dominio} (sem criptografia)`);
  renderizarLista($('localhost-lista'), mfas, {
    obterCodigo: (id) => enviar({ type: 'GET_CODE_LOCALHOST', id }),
    aoEditar: null, // sem edição sem login
  });
}

function ligarEventos() {
  $('form-criar-senha').addEventListener('submit', aoCriarSenha);
  $('form-desbloquear').addEventListener('submit', aoDesbloquear);
  $('desbloquear-toggle').addEventListener('click', () =>
    alternarVisibilidade('desbloquear-senha', 'desbloquear-toggle'),
  );

  $('btn-adicionar').addEventListener('click', () => abrirFormulario(null));
  $('btn-ver-todos').addEventListener('click', alternarVerTodos);
  $('localhost-entrar').addEventListener('click', () => mostrarVista('desbloquear'));
  $('mfa-dominio').addEventListener('input', atualizarOpcaoSemCripto);

  // Backup abre uma aba dedicada: o seletor de arquivos fecharia o popup (task 20).
  $('btn-backup').addEventListener('click', abrirBackup);

  $('btn-config').addEventListener('click', abrirConfig);
  $('config-voltar').addEventListener('click', abrirPrincipal);
  $('form-geral').addEventListener('submit', aoSalvarGeral);
  $('form-sessao').addEventListener('submit', aoSalvarTimeout);
  $('form-ratelimit').addEventListener('submit', aoSalvarRateLimit);
  $('form-trocar-senha').addEventListener('submit', aoTrocarSenha);
  $('form-autofill').addEventListener('submit', aoSalvarAutofill);
  $('af-add-dominio').addEventListener('click', () => adicionarLinhaDominio('', ''));

  $('form-mfa').addEventListener('submit', aoSalvarFormulario);
  $('form-voltar').addEventListener('click', abrirPrincipal);
  $('mfa-secret-toggle').addEventListener('click', () =>
    alternarVisibilidade('mfa-secret', 'mfa-secret-toggle'),
  );
  $('btn-excluir').addEventListener('click', abrirDialogoExclusao);
  $('dialog-cancelar').addEventListener('click', fecharDialogoExclusao);
  $('dialog-confirmar').addEventListener('click', confirmarExclusao);
}

function alternarVisibilidade(idInput, idBotao) {
  const input = $(idInput);
  const botao = $(idBotao);
  const revelar = input.type === 'password';
  input.type = revelar ? 'text' : 'password';
  botao.textContent = revelar ? 'Ocultar' : 'Mostrar';
}

/* ------------------------------ senha mestra ------------------------------ */

async function aoCriarSenha(evento) {
  evento.preventDefault();
  const senhaErro = $('criar-senha-erro');
  const confErro = $('criar-senha-conf-erro');
  limpar(senhaErro);
  limpar(confErro);

  const senha = $('criar-senha').value;
  const confirmacao = $('criar-senha-conf').value;
  const validacao = validarCadastroSenha({ senha, confirmacao });
  if (!validacao.valido) {
    if (validacao.erros.senha) dizer(senhaErro, validacao.erros.senha);
    if (validacao.erros.confirmacao) dizer(confErro, validacao.erros.confirmacao);
    return;
  }

  const resp = await enviar({ type: 'SET_MASTER_PASSWORD', senha });
  $('criar-senha').value = '';
  $('criar-senha-conf').value = '';
  if (resp?.ok) await abrirPrincipal({ autoCopiar: true });
  else dizer(senhaErro, resp?.erro ?? 'Não foi possível criar a senha.');
}

async function aoDesbloquear(evento) {
  evento.preventDefault();
  const erro = $('desbloquear-erro');
  const botao = $('desbloquear-btn');
  limpar(erro);

  const senha = $('desbloquear-senha').value;
  if (senha === '') {
    dizer(erro, 'Informe a senha.');
    return;
  }
  // Estado de carregando: cobre também o atraso do rate limiting (task 10).
  botao.disabled = true;
  dizer(botao, 'Verificando…');
  let resp;
  try {
    resp = await enviar({ type: 'UNLOCK', senha });
  } finally {
    botao.disabled = false;
    dizer(botao, 'Desbloquear');
  }
  $('desbloquear-senha').value = '';
  if (resp?.ok) await abrirPrincipal({ autoCopiar: true });
  else dizer(erro, 'Senha incorreta.');
}

/* ------------------------------ tela principal ------------------------------ */

async function abrirPrincipal({ autoCopiar = false } = {}) {
  edicaoId = null;
  mostrarVista('principal');
  dominioAtual = await obterDominioAtual();

  const resp = await enviar({ type: 'LIST_MFAS' });
  if (!resp?.ok) {
    // sessão expirou enquanto o popup estava aberto
    mostrarVista('desbloquear');
    return;
  }
  mfasCache = resp.mfas;
  const decisao = renderizarPrincipal();
  if (autoCopiar) await autocopiarSeUnico(decisao);
}

// Autocópia (task 15) + autopreenchimento (task 18): só na abertura do popup e
// só com 1 MFA do domínio.
async function autocopiarSeUnico(decisao) {
  if (decisao.modo !== 'dominio' || decisao.itens.length !== 1) return;
  let config = {};
  try {
    config = (await enviar({ type: 'GET_CONFIG' })) ?? {};
  } catch {
    /* ignora; usa padrões */
  }
  const resp = await enviar({ type: 'GET_CODE', id: decisao.itens[0].id });
  if (!resp?.ok) return;

  let copiou = false;
  if (config.autocopiar !== false) {
    // padrão: ligado (task 24)
    try {
      await copiarParaClipboard(resp.codigo);
      copiou = true;
    } catch {
      /* clipboard indisponível: silencioso, o usuário ainda pode clicar */
    }
  }
  const preencheu = await preencherNaAba(config.autofill, resp.codigo);
  if (preencheu && copiou) dizer($('principal-aviso'), 'Código copiado e preenchido na página ✓');
  else if (preencheu) dizer($('principal-aviso'), 'Código preenchido na página ✓');
  else if (copiou) dizer($('principal-aviso'), 'Código copiado automaticamente ✓');
}

// Função INJETADA na página (roda no contexto da aba, não no popup). Precisa ser
// autocontida — sem closures/imports. Insere o código no(s) campo(s) do seletor
// e tenta disparar Enter para continuar.
function preencherCamposOtp(seletor, codigo) {
  let campos;
  try {
    campos = document.querySelectorAll(seletor);
  } catch {
    return { ok: false, motivo: 'seletor' };
  }
  if (!campos || campos.length === 0) return { ok: false, motivo: 'nao_encontrado' };

  const disparar = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Vários inputs (um por dígito) vs. um único campo.
  if (campos.length > 1 && campos.length >= codigo.length) {
    for (let i = 0; i < codigo.length; i++) {
      campos[i].value = codigo[i];
      disparar(campos[i]);
    }
  } else {
    campos[0].value = codigo;
    disparar(campos[0]);
  }

  const ultimo = campos[Math.min(campos.length, codigo.length) - 1] || campos[0];
  ultimo.focus();
  for (const tipo of ['keydown', 'keypress', 'keyup']) {
    ultimo.dispatchEvent(
      new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    );
  }
  return { ok: true };
}

/** Injeta o código na aba ativa, se o autopreenchimento estiver habilitado. */
async function preencherNaAba(cfg, codigo) {
  if (!cfg?.habilitado || !browser.scripting?.executeScript) return false;
  const seletor = resolverSeletor(cfg, dominioAtual);
  if (!seletor) return false;
  try {
    const [aba] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!aba?.id) return false;
    const [res] = await browser.scripting.executeScript({
      target: { tabId: aba.id },
      func: preencherCamposOtp,
      args: [seletor, codigoParaCopia(codigo)],
    });
    return res?.result?.ok === true;
  } catch {
    return false; // sem permissão na aba / página restrita: silencioso
  }
}

function renderizarPrincipal() {
  limpar($('principal-aviso'));
  const decisao = decidirListagem({ todos: mfasCache, dominioAtual, verTodos });
  const lista = $('lista-mfas');
  const vazio = $('principal-vazio');
  const contexto = $('principal-contexto');
  const botaoVerTodos = $('btn-ver-todos');

  // Estado vazio (nenhum MFA cadastrado)
  if (decisao.modo === 'vazio') {
    pararTicker();
    lista.replaceChildren();
    lista.hidden = true;
    vazio.hidden = false;
    dizer($('vazio-msg'), 'Nenhum MFA cadastrado ainda. Adicione o primeiro abaixo.');
    botaoVerTodos.hidden = true;
    dizer(contexto, '');
    return decisao;
  }

  lista.hidden = false;
  vazio.hidden = true;

  // Texto de contexto + botão de alternância
  if (decisao.modo === 'dominio') {
    dizer(contexto, `Códigos para ${dominioAtual}`);
    botaoVerTodos.hidden = false;
    dizer(botaoVerTodos, 'Ver todos');
  } else if (decisao.modo === 'todos-fallback') {
    dizer(contexto, `Nenhum código para ${dominioAtual}. Mostrando todos.`);
    botaoVerTodos.hidden = true;
  } else {
    dizer(contexto, 'Todos os códigos');
    // Só oferece "ver deste site" se houver itens do domínio atual.
    const temDoDominio = dominioAtual && filtrarPorDominio(mfasCache, dominioAtual).length > 0;
    botaoVerTodos.hidden = !temDoDominio;
    dizer(botaoVerTodos, 'Ver deste site');
  }

  renderizarLista(lista, decisao.itens, {
    obterCodigo: (id) => enviar({ type: 'GET_CODE', id }),
    aoEditar: (id) => abrirFormulario(id),
  });
  return decisao;
}

function alternarVerTodos() {
  verTodos = !verTodos;
  renderizarPrincipal();
}

async function obterDominioAtual() {
  try {
    const [aba] = await browser.tabs.query({ active: true, currentWindow: true });
    return extrairDominioDaAba(aba);
  } catch {
    return null;
  }
}

/* --------------------------- formulário criar/editar --------------------------- */

async function abrirFormulario(id) {
  edicaoId = id;
  limpar($('mfa-nome-erro'));
  limpar($('mfa-secret-erro'));
  limpar($('mfa-status'));
  $('mfa-secret').type = 'password';
  $('mfa-secret-toggle').textContent = 'Mostrar';
  $('mfa-sem-cripto').checked = false;
  $('mfa-sem-cripto').disabled = false;
  mostrarVista('formulario');

  if (id === null) {
    // modo criar
    dizer($('form-titulo'), 'Cadastrar novo MFA');
    $('btn-excluir').hidden = true;
    $('mfa-nome').value = '';
    $('mfa-secret').value = '';
    $('mfa-dominio').value = (await obterDominioAtual()) ?? '';
    atualizarOpcaoSemCripto();
    return;
  }

  // modo editar
  dizer($('form-titulo'), 'Editar MFA');
  $('btn-excluir').hidden = false;
  const mfa = mfasCache.find((m) => m.id === id);
  $('mfa-nome').value = mfa?.nome ?? '';
  $('mfa-dominio').value = mfa?.dominio ?? '';
  // O modo de criptografia é definido na criação e preservado: checkbox só informativo.
  $('mfa-sem-cripto').checked = mfa?.semCriptografia === true;
  $('mfa-sem-cripto').disabled = true;
  atualizarOpcaoSemCripto();
  // Pré-preenche o segredo (exceção REVEAL_SECRET da ia/02; em claro p/ localhost).
  const resp = await enviar({ type: 'REVEAL_SECRET', id });
  $('mfa-secret').value = resp?.ok ? resp.secret : '';
}

// Mostra a opção "sem criptografia" apenas quando o domínio é localhost (task 26).
function atualizarOpcaoSemCripto() {
  const local = ehLocalhost($('mfa-dominio').value);
  $('mfa-sem-cripto-campo').hidden = !local;
  if (!local && edicaoId === null) $('mfa-sem-cripto').checked = false;
}

async function aoSalvarFormulario(evento) {
  evento.preventDefault();
  const nomeErro = $('mfa-nome-erro');
  const secretErro = $('mfa-secret-erro');
  const status = $('mfa-status');
  limpar(nomeErro);
  limpar(secretErro);
  limpar(status);

  const nome = $('mfa-nome').value;
  const dominio = $('mfa-dominio').value;
  const secret = $('mfa-secret').value;

  const validacao = validarCadastro({ nome, dominio, secret });
  if (!validacao.valido) {
    if (validacao.erros.nome) dizer(nomeErro, validacao.erros.nome);
    if (validacao.erros.secret) dizer(secretErro, validacao.erros.secret);
    return;
  }

  const tipo = edicaoId === null ? 'SAVE_MFA' : 'UPDATE_MFA';
  const semCriptografia = $('mfa-sem-cripto').checked && ehLocalhost(dominio);
  const resp = await enviar({ type: tipo, id: edicaoId, nome, dominio, secret, semCriptografia });
  $('mfa-secret').value = ''; // descarta o segredo da UI

  if (resp?.ok) {
    await abrirPrincipal();
  } else if (resp?.erros) {
    if (resp.erros.nome) dizer(nomeErro, resp.erros.nome);
    if (resp.erros.secret) dizer(secretErro, resp.erros.secret);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(status, 'Sessão expirada. Feche e reabra para desbloquear.');
  } else if (resp?.erro === 'SEM_CRIPTO_SO_LOCALHOST') {
    dizer(status, 'A opção sem criptografia só vale para localhost.');
  } else {
    dizer(status, resp?.erro ?? 'Não foi possível salvar.');
  }
}

/* -------------------------------- exclusão -------------------------------- */

function abrirDialogoExclusao() {
  $('dialog-excluir').hidden = false;
}

function fecharDialogoExclusao() {
  $('dialog-excluir').hidden = true;
}

async function confirmarExclusao() {
  fecharDialogoExclusao();
  if (edicaoId === null) return;
  const resp = await enviar({ type: 'DELETE_MFA', id: edicaoId });
  if (resp?.ok) await abrirPrincipal();
  else dizer($('mfa-status'), 'Não foi possível excluir.');
}

/* --------------------------------- backup --------------------------------- */

function abrirBackup() {
  // Página dedicada em aba: o seletor de arquivos não destrói o contexto.
  browser.tabs.create({ url: browser.runtime.getURL('popup/backup.html') });
}

/* ------------------------------ configurações ------------------------------ */

async function abrirConfig() {
  mostrarVista('config');
  limpar($('ratelimit-status'));
  limpar($('ts-status'));
  limpar($('ts-nova-erro'));
  limpar($('ts-conf-erro'));
  $('ts-atual').value = '';
  $('ts-nova').value = '';
  $('ts-conf').value = '';
  limpar($('af-status'));
  limpar($('sessao-status'));
  limpar($('geral-status'));
  const resp = await enviar({ type: 'GET_CONFIG' });
  if (!resp?.ok) return;
  $('geral-autocopiar').checked = resp.autocopiar !== false;
  $('sessao-minutos').value = (resp.sessaoTimeoutMs / 60000).toString();
  const c = resp.rateLimit;
  $('rl-livres').value = c.livres;
  $('rl-limite1').value = c.limite1;
  $('rl-atraso1').value = Math.round(c.atraso1Ms / 1000);
  $('rl-limite2').value = c.limite2;
  $('rl-atraso2').value = Math.round(c.atraso2Ms / 1000);
  $('rl-atrasomax').value = Math.round(c.atrasoMaxMs / 1000);

  const af = resp.autofill ?? {};
  $('af-habilitado').checked = Boolean(af.habilitado);
  $('af-seletor-padrao').value = af.seletorPadrao ?? '';
  $('af-dominios').replaceChildren();
  for (const [dominio, seletor] of Object.entries(af.porDominio ?? {})) {
    adicionarLinhaDominio(dominio, seletor);
  }
}

// Cria uma linha editável de "domínio → seletor". Tudo via DOM API (sem innerHTML).
function adicionarLinhaDominio(dominio, seletor) {
  const linha = document.createElement('div');
  linha.className = 'af-linha';

  const inputDom = document.createElement('input');
  inputDom.type = 'text';
  inputDom.className = 'field__input af-linha__dom';
  inputDom.placeholder = 'domínio (ex: github.com)';
  inputDom.spellcheck = false;
  inputDom.value = dominio;

  const inputSel = document.createElement('input');
  inputSel.type = 'text';
  inputSel.className = 'field__input af-linha__sel';
  inputSel.placeholder = 'seletor CSS';
  inputSel.spellcheck = false;
  inputSel.value = seletor;

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'btn-link af-linha__rm';
  remover.textContent = 'remover';
  remover.addEventListener('click', () => linha.remove());

  linha.append(inputDom, inputSel, remover);
  $('af-dominios').append(linha);
}

async function aoSalvarAutofill(evento) {
  evento.preventDefault();
  const status = $('af-status');
  limpar(status);

  const porDominio = {};
  for (const linha of $('af-dominios').querySelectorAll('.af-linha')) {
    const dom = linha.querySelector('.af-linha__dom').value.trim().toLowerCase();
    const sel = linha.querySelector('.af-linha__sel').value.trim();
    if (dom !== '' && sel !== '') porDominio[dom] = sel;
  }

  const config = {
    habilitado: $('af-habilitado').checked,
    seletorPadrao: $('af-seletor-padrao').value,
    porDominio,
  };
  const resp = await enviar({ type: 'SET_AUTOFILL', config });
  if (resp?.ok) {
    $('af-seletor-padrao').value = resp.autofill.seletorPadrao;
    $('af-dominios').replaceChildren();
    for (const [d, s] of Object.entries(resp.autofill.porDominio)) adicionarLinhaDominio(d, s);
    dizer(status, 'Autopreenchimento salvo.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoSalvarGeral(evento) {
  evento.preventDefault();
  const status = $('geral-status');
  limpar(status);
  const resp = await enviar({ type: 'SET_AUTOCOPY', habilitado: $('geral-autocopiar').checked });
  dizer(status, resp?.ok ? 'Configuração salva.' : 'Não foi possível salvar.');
}

async function aoSalvarTimeout(evento) {
  evento.preventDefault();
  const status = $('sessao-status');
  limpar(status);
  const ms = Math.round(Number($('sessao-minutos').value) * 60000);
  const resp = await enviar({ type: 'SET_SESSION_TIMEOUT', ms });
  if (resp?.ok) {
    $('sessao-minutos').value = (resp.sessaoTimeoutMs / 60000).toString();
    dizer(status, 'Tempo de sessão salvo.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoSalvarRateLimit(evento) {
  evento.preventDefault();
  const status = $('ratelimit-status');
  limpar(status);
  const seg = (id) => Number($(id).value) * 1000;
  const config = {
    livres: Number($('rl-livres').value),
    limite1: Number($('rl-limite1').value),
    atraso1Ms: seg('rl-atraso1'),
    limite2: Number($('rl-limite2').value),
    atraso2Ms: seg('rl-atraso2'),
    atrasoMaxMs: seg('rl-atrasomax'),
  };
  const resp = await enviar({ type: 'SET_RATE_LIMIT', config });
  if (resp?.ok) {
    // Reaplica os valores normalizados (caso tenham sido ajustados).
    const c = resp.rateLimit;
    $('rl-livres').value = c.livres;
    $('rl-limite1').value = c.limite1;
    $('rl-atraso1').value = Math.round(c.atraso1Ms / 1000);
    $('rl-limite2').value = c.limite2;
    $('rl-atraso2').value = Math.round(c.atraso2Ms / 1000);
    $('rl-atrasomax').value = Math.round(c.atrasoMaxMs / 1000);
    dizer(status, 'Configuração salva.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoTrocarSenha(evento) {
  evento.preventDefault();
  const novaErro = $('ts-nova-erro');
  const confErro = $('ts-conf-erro');
  const status = $('ts-status');
  limpar(novaErro);
  limpar(confErro);
  limpar(status);

  const senhaAtual = $('ts-atual').value;
  const senhaNova = $('ts-nova').value;
  const confirmacao = $('ts-conf').value;

  if (senhaAtual === '') {
    dizer(status, 'Informe a senha atual.');
    return;
  }
  const validacao = validarCadastroSenha({ senha: senhaNova, confirmacao });
  if (!validacao.valido) {
    if (validacao.erros.senha) dizer(novaErro, validacao.erros.senha);
    if (validacao.erros.confirmacao) dizer(confErro, validacao.erros.confirmacao);
    return;
  }

  const resp = await enviar({ type: 'CHANGE_MASTER_PASSWORD', senhaAtual, senhaNova });
  $('ts-atual').value = '';
  $('ts-nova').value = '';
  $('ts-conf').value = '';
  if (resp?.ok) {
    dizer(status, 'Senha alterada com sucesso.');
  } else if (resp?.erro === 'SENHA_ATUAL_INCORRETA') {
    dizer(status, 'Senha atual incorreta.');
  } else if (resp?.erro === 'SENHA_NOVA_INVALIDA') {
    dizer(novaErro, 'A nova senha não atende aos requisitos.');
  } else {
    dizer(status, 'Não foi possível trocar a senha.');
  }
}

// Script de módulo (deferido): a DOM já está pronta quando ele executa.
iniciar();
