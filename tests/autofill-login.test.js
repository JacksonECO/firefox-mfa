// Autopreenchimento de login (task 30): normalização da config, resolução de
// seletores por domínio e a função injetada na página, exercitada com um
// `document` falso (o duplo cobre a NOSSA lógica: visibilidade, fallback,
// eventos e Enter — não o motor de seletores do navegador).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import {
  normalizarConfigLogin,
  resolverSeletorLogin,
  preencherLogin,
  LOGIN_PADRAO,
  SELETOR_EMAIL_PADRAO,
  SELETOR_SENHA_PADRAO,
} from '../src/autofilllogin.js';
import { normalizarConfigAutofill } from '../src/autofill.js';

/* ------------------------------ configuração ------------------------------ */

test('padrão vem desligado e sem enviar o formulário (opt-in duplo)', () => {
  assert.equal(LOGIN_PADRAO.habilitado, false);
  assert.equal(LOGIN_PADRAO.submeter, false);
  assert.deepEqual(LOGIN_PADRAO.porDominio, {});
});

test('config antiga (sem bloco login) recebe os padrões', () => {
  const c = normalizarConfigAutofill({ habilitado: true, seletorPadrao: '#otp' });
  assert.deepEqual(c.login, { ...LOGIN_PADRAO });
});

test('normaliza domínios e descarta entradas sem seletor', () => {
  const c = normalizarConfigLogin({
    porDominio: {
      '  GitHub.com ': { email: ' #u ', senha: '#p' },
      'vazio.com': { email: '  ', senha: '' },
      'so-senha.com': { senha: '#p2' },
      '': { email: '#x' },
    },
  });
  assert.deepEqual(c.porDominio, {
    'github.com': { email: '#u', senha: '#p' },
    'so-senha.com': { senha: '#p2' },
  });
});

test('seletores vazios caem no padrão; flags são coagidas', () => {
  const c = normalizarConfigLogin({ habilitado: 1, submeter: 'sim', seletorEmailPadrao: '   ' });
  assert.equal(c.habilitado, true);
  assert.equal(c.submeter, true);
  assert.equal(c.seletorEmailPadrao, SELETOR_EMAIL_PADRAO);
  assert.equal(c.seletorSenhaPadrao, SELETOR_SENHA_PADRAO);
});

test('resolverSeletorLogin usa o override do domínio, campo a campo', () => {
  const config = { login: { porDominio: { 'a.com': { email: '#u' } } } };
  assert.deepEqual(resolverSeletorLogin(config, 'a.com'), {
    email: '#u',
    senha: SELETOR_SENHA_PADRAO, // sem override: padrão
  });
  assert.deepEqual(resolverSeletorLogin(config, 'b.com'), {
    email: SELETOR_EMAIL_PADRAO,
    senha: SELETOR_SENHA_PADRAO,
  });
  assert.deepEqual(resolverSeletorLogin(undefined, null), {
    email: SELETOR_EMAIL_PADRAO,
    senha: SELETOR_SENHA_PADRAO,
  });
});

/* ---------------------------- DOM falso p/ injeção ---------------------------- */

// Node não tem KeyboardEvent: um duplo mínimo basta (só o tipo importa aqui).
globalThis.KeyboardEvent = class extends Event {
  constructor(tipo, opcoes = {}) {
    super(tipo, opcoes);
    this.key = opcoes.key;
    this.code = opcoes.code;
  }
};

function campo(opcoes = {}) {
  const { type = 'text', disabled = false, readOnly = false, visivel = true, form = null } = opcoes;
  const el = {
    type,
    disabled,
    readOnly,
    form,
    value: '',
    eventos: [],
    focado: false,
    getClientRects: () => (visivel ? [{}] : []),
    dispatchEvent(evento) {
      el.eventos.push(evento.type);
      return true;
    },
    focus() {
      el.focado = true;
    },
  };
  return el;
}

/** `mapa` associa seletor → elementos; 'input' devolve todos, em ordem do DOM. */
function montarDocumento(mapa, todos = []) {
  globalThis.document = {
    querySelectorAll(seletor) {
      if (seletor === ':invalido(') throw new SyntaxError('seletor inválido');
      if (seletor === 'input') return todos;
      return mapa[seletor] ?? [];
    },
  };
}

beforeEach(() => {
  delete globalThis.document;
});

test('preenche e-mail e senha e dispara input/change', () => {
  const email = campo({ type: 'email' });
  const senha = campo({ type: 'password' });
  montarDocumento({ '#u': [email], '#p': [senha] }, [email, senha]);

  const r = preencherLogin('#u', '#p', 'eu@x.com', 'segredo', false);
  assert.deepEqual(r, { ok: true, email: true, senha: true, motivo: null });
  assert.equal(email.value, 'eu@x.com');
  assert.equal(senha.value, 'segredo');
  assert.deepEqual(email.eventos, ['input', 'change']);
  assert.deepEqual(senha.eventos, ['input', 'change']);
});

test('não envia o formulário por padrão; só com submeter dispara Enter', () => {
  const senha = campo({ type: 'password' });
  montarDocumento({ '#p': [senha] }, [senha]);
  preencherLogin('#u', '#p', 'eu@x.com', 'segredo', false);
  assert.deepEqual(senha.eventos, ['input', 'change']);
  assert.equal(senha.focado, false);

  senha.eventos.length = 0;
  preencherLogin('#u', '#p', 'eu@x.com', 'segredo', true);
  assert.deepEqual(senha.eventos, ['input', 'change', 'keydown', 'keypress', 'keyup']);
  assert.equal(senha.focado, true);
});

test('ignora campos invisíveis, desabilitados, somente-leitura e hidden', () => {
  const escondido = campo({ visivel: false });
  const desabilitado = campo({ disabled: true });
  const somenteLeitura = campo({ readOnly: true });
  const oculto = campo({ type: 'hidden' });
  const bom = campo();
  const senha = campo({ type: 'password' });
  montarDocumento(
    { '#u': [escondido, desabilitado, somenteLeitura, oculto, bom], '#p': [senha] },
    [],
  );

  preencherLogin('#u', '#p', 'eu@x.com', 'segredo', false);
  assert.equal(bom.value, 'eu@x.com');
  for (const el of [escondido, desabilitado, somenteLeitura, oculto]) assert.equal(el.value, '');
});

test('sem seletor de e-mail, usa o campo de texto anterior ao de senha no form', () => {
  const form = {};
  const ruido = campo({ type: 'checkbox', form });
  const usuario = campo({ type: 'text', form });
  const senha = campo({ type: 'password', form });
  form.querySelectorAll = (sel) => (sel === 'input' ? [ruido, usuario, senha] : []);
  senha.form = form;
  montarDocumento({ '#p': [senha] }, [ruido, usuario, senha]);

  const r = preencherLogin('#nao-existe', '#p', 'eu@x.com', 'segredo', false);
  assert.equal(r.ok, true);
  assert.equal(usuario.value, 'eu@x.com');
  assert.equal(ruido.value, '', 'checkbox não serve de campo de usuário');
});

test('fallback fora de um form usa o document', () => {
  const usuario = campo({ type: 'text' });
  const senha = campo({ type: 'password' });
  montarDocumento({ '#p': [senha] }, [usuario, senha]);
  preencherLogin('#nada', '#p', 'eu@x.com', 'segredo', false);
  assert.equal(usuario.value, 'eu@x.com');
});

test('página sem campos: não preenche nada e informa o motivo', () => {
  montarDocumento({}, []);
  assert.deepEqual(preencherLogin('#u', '#p', 'eu@x.com', 'segredo', false), {
    ok: false,
    email: false,
    senha: false,
    motivo: 'nao_encontrado',
  });
});

test('seletor CSS inválido não quebra o preenchimento do outro campo', () => {
  const senha = campo({ type: 'password' });
  montarDocumento({ '#p': [senha] }, [senha]);
  const r = preencherLogin(':invalido(', '#p', 'eu@x.com', 'segredo', false);
  assert.equal(r.senha, true);
  assert.equal(senha.value, 'segredo');
});

test('só a senha preenche quando a página não tem campo de usuário visível', () => {
  const senha = campo({ type: 'password' });
  montarDocumento({ '#p': [senha] }, [senha]);
  const r = preencherLogin('#u', '#p', '', 'segredo', false);
  assert.deepEqual(r, { ok: true, email: false, senha: true, motivo: null });
});

/* --------------------------- injeção pelo background --------------------------- */

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

function comScripting() {
  const mock = criarBrowserMock();
  mock._injecoes = [];
  mock.scripting = {
    executeScript(opcoes) {
      mock._injecoes.push(opcoes);
      return Promise.resolve([{ result: { ok: true, email: true, senha: true } }]);
    },
  };
  globalThis.browser = mock;
  return mock;
}

const contaGithub = {
  type: 'SAVE_CONTA',
  dominio: 'github.com',
  email: 'eu@exemplo.com',
  senha: 'senha-do-site',
};

test('AUTOFILL_LOGIN injeta a senha na aba a partir do background', async () => {
  const mock = comScripting();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  await bg.rotear(contaGithub);
  await bg.rotear({ type: 'SET_AUTOFILL', config: { login: { habilitado: true } } });

  const r = await bg.rotear({ type: 'AUTOFILL_LOGIN', dominio: 'github.com', tabId: 7 });
  assert.deepEqual(r, { ok: true, preencheu: true });
  assert.equal(mock._injecoes.length, 1);
  const injecao = mock._injecoes[0];
  assert.deepEqual(injecao.target, { tabId: 7 });
  assert.equal(injecao.args[2], 'eu@exemplo.com');
  assert.equal(injecao.args[3], 'senha-do-site');
  assert.equal(injecao.args[4], false, 'submeter desligado por padrão');
});

test('AUTOFILL_LOGIN usa a conta principal do domínio', async () => {
  const mock = comScripting();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  await bg.rotear(contaGithub);
  const segunda = await bg.rotear({ ...contaGithub, email: 'b@x.com', senha: 'senha-b' });
  await bg.rotear({ type: 'SET_CONTA_PRINCIPAL', id: segunda.conta.id });

  await bg.rotear({ type: 'AUTOFILL_LOGIN', dominio: 'github.com', tabId: 1, manual: true });
  assert.equal(mock._injecoes[0].args[2], 'b@x.com');
  assert.equal(mock._injecoes[0].args[3], 'senha-b');
});

test('AUTOFILL_LOGIN desligado não injeta, mas o pedido manual injeta', async () => {
  const mock = comScripting();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  await bg.rotear(contaGithub);

  const auto = await bg.rotear({ type: 'AUTOFILL_LOGIN', dominio: 'github.com', tabId: 1 });
  assert.deepEqual(auto, { ok: false, erro: 'DESABILITADO' });
  assert.equal(mock._injecoes.length, 0);

  const manual = await bg.rotear({
    type: 'AUTOFILL_LOGIN',
    dominio: 'github.com',
    tabId: 1,
    manual: true,
  });
  assert.equal(manual.ok, true);
});

test('AUTOFILL_LOGIN exige sessão e não injeta com o cofre bloqueado', async () => {
  const mock = comScripting();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  await bg.rotear(contaGithub);
  await bg.rotear({ type: 'LOCK' });

  const r = await bg.rotear({
    type: 'AUTOFILL_LOGIN',
    dominio: 'github.com',
    tabId: 1,
    manual: true,
  });
  assert.deepEqual(r, { ok: false, erro: 'SESSAO_BLOQUEADA' });
  assert.equal(mock._injecoes.length, 0);
});

test('AUTOFILL_LOGIN sem conta para o domínio não injeta', async () => {
  const mock = comScripting();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  const r = await bg.rotear({
    type: 'AUTOFILL_LOGIN',
    dominio: 'sem-conta.com',
    tabId: 1,
    manual: true,
  });
  assert.deepEqual(r, { ok: false, erro: 'SEM_CONTA' });
  assert.equal(mock._injecoes.length, 0);
});

test('AUTOFILL_LOGIN_LOCALHOST só atende conta local sem criptografia', async () => {
  const mock = comScripting();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  await bg.rotear({ ...contaGithub, dominio: 'localhost', semCriptografia: true });
  await bg.rotear({ ...contaGithub, dominio: 'localhost', email: 'cripto@x.com' });
  await bg.rotear({ type: 'LOCK' });

  const fora = await bg.rotear({
    type: 'AUTOFILL_LOGIN_LOCALHOST',
    dominio: 'github.com',
    tabId: 1,
    manual: true,
  });
  assert.deepEqual(fora, { ok: false, erro: 'NAO_PERMITIDO' });

  const local = await bg.rotear({
    type: 'AUTOFILL_LOGIN_LOCALHOST',
    dominio: 'localhost',
    tabId: 1,
    manual: true,
  });
  assert.equal(local.ok, true);
  assert.equal(mock._injecoes.length, 1);
  assert.equal(mock._injecoes[0].args[2], 'eu@exemplo.com');
});
