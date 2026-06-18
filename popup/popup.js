// Popup da extensão (tasks 01–09): máquina de estados de telas, senha mestra,
// listagem por domínio, formulário de criar/editar e exclusão.
//
// Arquitetura (CLAUDE.md / ia/02): o popup NUNCA detém a CryptoKey nem segredos
// persistidos; só troca mensagens com o background e renderiza com a DOM API
// (textContent, nunca innerHTML). A única exceção é o REVEAL_SECRET pontual do
// fluxo de edição, descartado do campo ao sair.

import { extrairDominioDaAba } from '../src/dominio.js';
import { validarCadastro } from '../src/cadastro.js';
import { validarCadastroSenha, decidirTela } from '../src/senha.js';
import { decidirListagem, filtrarPorDominio } from '../src/listagem.js';
import { renderizarLista, pararTicker } from './cards.js';

const VIEWS = ['view-criar-senha', 'view-desbloquear', 'view-principal', 'view-formulario'];

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
  if (nome !== 'principal') pararTicker(); // só a tela principal usa o ticker
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
  const tela = decidirTela({ temSenha, sessaoAtiva });
  if (tela === 'principal') await abrirPrincipal();
  else mostrarVista(tela);
}

function ligarEventos() {
  $('form-criar-senha').addEventListener('submit', aoCriarSenha);
  $('form-desbloquear').addEventListener('submit', aoDesbloquear);
  $('desbloquear-toggle').addEventListener('click', () =>
    alternarVisibilidade('desbloquear-senha', 'desbloquear-toggle'),
  );

  $('btn-adicionar').addEventListener('click', () => abrirFormulario(null));
  $('btn-ver-todos').addEventListener('click', alternarVerTodos);

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
  if (resp?.ok) await abrirPrincipal();
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
  if (resp?.ok) await abrirPrincipal();
  else dizer(erro, 'Senha incorreta.');
}

/* ------------------------------ tela principal ------------------------------ */

async function abrirPrincipal() {
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
  renderizarPrincipal();
}

function renderizarPrincipal() {
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
    return;
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
  mostrarVista('formulario');

  if (id === null) {
    // modo criar
    dizer($('form-titulo'), 'Cadastrar novo MFA');
    $('btn-excluir').hidden = true;
    $('mfa-nome').value = '';
    $('mfa-secret').value = '';
    $('mfa-dominio').value = (await obterDominioAtual()) ?? '';
    return;
  }

  // modo editar
  dizer($('form-titulo'), 'Editar MFA');
  $('btn-excluir').hidden = false;
  const mfa = mfasCache.find((m) => m.id === id);
  $('mfa-nome').value = mfa?.nome ?? '';
  $('mfa-dominio').value = mfa?.dominio ?? '';
  // Pré-preenche o segredo descriptografado (exceção REVEAL_SECRET da ia/02).
  const resp = await enviar({ type: 'REVEAL_SECRET', id });
  $('mfa-secret').value = resp?.ok ? resp.secret : '';
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
  const resp = await enviar({ type: tipo, id: edicaoId, nome, dominio, secret });
  $('mfa-secret').value = ''; // descarta o segredo da UI

  if (resp?.ok) {
    await abrirPrincipal();
  } else if (resp?.erros) {
    if (resp.erros.nome) dizer(nomeErro, resp.erros.nome);
    if (resp.erros.secret) dizer(secretErro, resp.erros.secret);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(status, 'Sessão expirada. Feche e reabra para desbloquear.');
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

// Script de módulo (deferido): a DOM já está pronta quando ele executa.
iniciar();
