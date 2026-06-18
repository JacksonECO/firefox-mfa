// Popup da extensão (tasks 01 e 04).
//
// Arquitetura (ver CLAUDE.md / ia/02): este script NUNCA manipula a senha
// mestra persistida, a CryptoKey ou o segredo em claro de um MFA salvo. Ele
// só envia mensagens ao background e renderiza dados com a DOM API (sem
// innerHTML). A senha digitada transita uma única vez na mensagem e é limpa
// do campo logo em seguida.
//
// Importa apenas módulos PUROS de validação (sem crypto/storage), usados para
// dar feedback inline; a verdade (criptografia/persistência) está no background.

import { extrairDominioDaAba } from '../src/dominio.js';
import { validarCadastro } from '../src/cadastro.js';

const VIEWS = ['view-criar-senha', 'view-desbloquear', 'view-cadastro'];

const $ = (id) => document.getElementById(id);
const enviar = (mensagem) => browser.runtime.sendMessage(mensagem);
const limpar = (el) => {
  el.textContent = '';
};
const dizer = (el, texto) => {
  el.textContent = texto;
};

function mostrarVista(nome) {
  for (const id of VIEWS) $(id).hidden = id !== `view-${nome}`;
}

/* ------------------------------ inicialização ------------------------------ */

async function iniciar() {
  ligarFormularios();
  await rotearVistaInicial();
}

async function rotearVistaInicial() {
  let inicializado = false;
  try {
    ({ inicializado } = await enviar({ type: 'IS_INITIALIZED' }));
  } catch {
    /* background ainda indisponível: trata como não inicializado */
  }
  if (!inicializado) {
    mostrarVista('criar-senha');
    return;
  }
  let desbloqueado = false;
  try {
    ({ desbloqueado } = await enviar({ type: 'SESSION_STATUS' }));
  } catch {
    /* ignora; mostra desbloqueio */
  }
  if (desbloqueado) await abrirCadastro();
  else mostrarVista('desbloquear');
}

async function abrirCadastro() {
  mostrarVista('cadastro');
  await preencherDominio();
}

async function preencherDominio() {
  const campo = $('cadastro-dominio');
  if (campo.value !== '') return;
  try {
    const [aba] = await browser.tabs.query({ active: true, currentWindow: true });
    const dominio = extrairDominioDaAba(aba);
    if (dominio) campo.value = dominio;
  } catch {
    /* sem activeTab/aba utilizável: campo fica vazio, sem travar o cadastro */
  }
}

function ligarFormularios() {
  $('form-criar-senha').addEventListener('submit', aoCriarSenha);
  $('form-desbloquear').addEventListener('submit', aoDesbloquear);
  $('form-cadastro').addEventListener('submit', aoCadastrar);
  $('cadastro-secret-toggle').addEventListener('click', alternarSecret);
}

/* ------------------------------- senha mestra ------------------------------ */

async function aoCriarSenha(evento) {
  evento.preventDefault();
  const input = $('criar-senha-input');
  const erro = $('criar-senha-erro');
  limpar(erro);
  const senha = input.value;
  if (senha === '') {
    dizer(erro, 'Informe uma senha.');
    return;
  }
  const resp = await enviar({ type: 'SET_MASTER_PASSWORD', senha });
  input.value = ''; // descarta a senha do campo imediatamente
  if (resp?.ok) await abrirCadastro();
  else dizer(erro, resp?.erro ?? 'Não foi possível criar a senha.');
}

async function aoDesbloquear(evento) {
  evento.preventDefault();
  const input = $('desbloquear-input');
  const erro = $('desbloquear-erro');
  limpar(erro);
  const senha = input.value;
  if (senha === '') {
    dizer(erro, 'Informe a senha.');
    return;
  }
  const resp = await enviar({ type: 'UNLOCK', senha });
  input.value = '';
  if (resp?.ok) await abrirCadastro();
  else dizer(erro, 'Senha incorreta.');
}

/* --------------------------------- cadastro -------------------------------- */

function alternarSecret() {
  const input = $('cadastro-secret');
  const botao = $('cadastro-secret-toggle');
  const revelar = input.type === 'password';
  input.type = revelar ? 'text' : 'password';
  botao.textContent = revelar ? 'Ocultar' : 'Mostrar';
}

function ocultarSecret() {
  $('cadastro-secret').type = 'password';
  $('cadastro-secret-toggle').textContent = 'Mostrar';
}

async function aoCadastrar(evento) {
  evento.preventDefault();
  const nomeErro = $('cadastro-nome-erro');
  const secretErro = $('cadastro-secret-erro');
  const status = $('cadastro-status');
  limpar(nomeErro);
  limpar(secretErro);
  limpar(status);

  const nome = $('cadastro-nome').value;
  const dominio = $('cadastro-dominio').value;
  const secret = $('cadastro-secret').value;

  const validacao = validarCadastro({ nome, dominio, secret });
  if (!validacao.valido) {
    if (validacao.erros.nome) dizer(nomeErro, validacao.erros.nome);
    if (validacao.erros.secret) dizer(secretErro, validacao.erros.secret);
    return;
  }

  const resp = await enviar({ type: 'SAVE_MFA', nome, dominio, secret });
  $('cadastro-secret').value = ''; // descarta o segredo da UI imediatamente
  ocultarSecret();

  if (resp?.ok) {
    $('cadastro-nome').value = '';
    dizer(status, 'MFA cadastrado com sucesso.');
  } else if (resp?.erros) {
    if (resp.erros.nome) dizer(nomeErro, resp.erros.nome);
    if (resp.erros.secret) dizer(secretErro, resp.erros.secret);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(status, 'Sessão expirada. Feche e reabra para desbloquear.');
  } else {
    dizer(status, resp?.erro ?? 'Não foi possível salvar.');
  }
}

// Script de módulo (deferido): a DOM já está pronta quando ele executa.
iniciar();
