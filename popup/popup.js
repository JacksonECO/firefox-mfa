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
import { renderizarLista, pararTicker, copiarParaClipboard } from './cards.js';

const VIEWS = [
  'view-criar-senha',
  'view-desbloquear',
  'view-principal',
  'view-formulario',
  'view-exportar',
  'view-importar',
  'view-config',
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
  if (tela === 'principal') await abrirPrincipal({ autoCopiar: true });
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

  $('btn-exportar').addEventListener('click', () => mostrarVista('exportar'));
  $('btn-importar').addEventListener('click', () => mostrarVista('importar'));
  $('exportar-voltar').addEventListener('click', abrirPrincipal);
  $('importar-voltar').addEventListener('click', abrirPrincipal);
  $('form-exportar').addEventListener('submit', aoExportar);
  $('form-importar').addEventListener('submit', aoImportar);

  $('btn-config').addEventListener('click', abrirConfig);
  $('config-voltar').addEventListener('click', abrirPrincipal);
  $('form-ratelimit').addEventListener('submit', aoSalvarRateLimit);

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

// Autocópia (task 15): só na abertura do popup e só com 1 MFA do domínio.
async function autocopiarSeUnico(decisao) {
  if (decisao.modo !== 'dominio' || decisao.itens.length !== 1) return;
  const resp = await enviar({ type: 'GET_CODE', id: decisao.itens[0].id });
  if (!resp?.ok) return;
  try {
    await copiarParaClipboard(resp.codigo);
    dizer($('principal-aviso'), 'Código copiado automaticamente ✓');
  } catch {
    /* clipboard indisponível: silencioso, o usuário ainda pode clicar */
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

/* --------------------------- exportar / importar --------------------------- */

async function aoExportar(evento) {
  evento.preventDefault();
  const erro = $('exportar-erro');
  const status = $('exportar-status');
  limpar(erro);
  limpar(status);

  const senha = $('exportar-senha').value;
  if (senha === '') {
    dizer(erro, 'Informe uma senha de exportação.');
    return;
  }
  const resp = await enviar({ type: 'EXPORT_DATA', senha });
  $('exportar-senha').value = '';
  if (!resp?.ok) {
    dizer(erro, resp?.erro === 'SESSAO_BLOQUEADA' ? 'Sessão expirada.' : 'Falha ao exportar.');
    return;
  }
  baixarJson(resp.arquivo, 'firefox-mfa-backup.json');
  dizer(status, 'Backup baixado.');
}

function baixarJson(objeto, nomeArquivo) {
  const blob = new Blob([JSON.stringify(objeto)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

async function aoImportar(evento) {
  evento.preventDefault();
  const erro = $('importar-erro');
  const status = $('importar-status');
  limpar(erro);
  limpar(status);

  const arquivoInput = $('importar-arquivo');
  const senha = $('importar-senha').value;
  if (!arquivoInput.files || arquivoInput.files.length === 0) {
    dizer(erro, 'Selecione um arquivo de backup.');
    return;
  }
  if (senha === '') {
    dizer(erro, 'Informe a senha de exportação.');
    return;
  }

  let arquivo;
  try {
    arquivo = JSON.parse(await arquivoInput.files[0].text());
  } catch {
    dizer(erro, 'Arquivo inválido (não é um JSON válido).');
    return;
  }

  const resp = await enviar({ type: 'IMPORT_DATA', arquivo, senha });
  $('importar-senha').value = '';
  if (resp?.ok) {
    dizer(status, `Importado(s) ${resp.importados} MFA(s).`);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(erro, 'Sessão expirada.');
  } else {
    dizer(erro, 'Senha incorreta ou arquivo inválido.');
  }
}

/* ------------------------------ configurações ------------------------------ */

async function abrirConfig() {
  mostrarVista('config');
  limpar($('ratelimit-status'));
  const resp = await enviar({ type: 'GET_CONFIG' });
  if (!resp?.ok) return;
  const c = resp.rateLimit;
  $('rl-livres').value = c.livres;
  $('rl-limite1').value = c.limite1;
  $('rl-atraso1').value = Math.round(c.atraso1Ms / 1000);
  $('rl-limite2').value = c.limite2;
  $('rl-atraso2').value = Math.round(c.atraso2Ms / 1000);
  $('rl-atrasomax').value = Math.round(c.atrasoMaxMs / 1000);
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

// Script de módulo (deferido): a DOM já está pronta quando ele executa.
iniciar();
