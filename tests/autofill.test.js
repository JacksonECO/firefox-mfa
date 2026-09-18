import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import { LOGIN_PADRAO } from '../src/autofilllogin.js';
import {
  normalizarConfigAutofill,
  resolverSeletor,
  SELETOR_OTP_PADRAO,
  AUTOFILL_PADRAO,
} from '../src/autofill.js';

test('AUTOFILL_PADRAO vem desligado (opt-in) com o seletor OTP padrão', () => {
  assert.equal(AUTOFILL_PADRAO.habilitado, false);
  assert.equal(AUTOFILL_PADRAO.seletorPadrao, SELETOR_OTP_PADRAO);
  assert.equal(AUTOFILL_PADRAO.fecharAoPreencher, false);
  assert.deepEqual(AUTOFILL_PADRAO.porDominio, {});
});

test('normalizarConfigAutofill coage habilitado e usa o padrão p/ seletor vazio', () => {
  assert.deepEqual(normalizarConfigAutofill({ habilitado: 1, seletorPadrao: '  ' }), {
    habilitado: true,
    seletorPadrao: SELETOR_OTP_PADRAO,
    fecharAoPreencher: false,
    porDominio: {},
    login: { ...LOGIN_PADRAO },
  });
});

test('normalizarConfigAutofill coage fecharAoPreencher para booleano', () => {
  assert.equal(normalizarConfigAutofill({ fecharAoPreencher: 1 }).fecharAoPreencher, true);
  assert.equal(normalizarConfigAutofill({ fecharAoPreencher: 0 }).fecharAoPreencher, false);
  assert.equal(normalizarConfigAutofill({}).fecharAoPreencher, false);
});

test('migra o formato antigo `seletor` para `seletorPadrao`', () => {
  const c = normalizarConfigAutofill({ habilitado: true, seletor: '#otp' });
  assert.equal(c.seletorPadrao, '#otp');
});

test('normaliza domínios (minúsculo/trim) e descarta entradas vazias', () => {
  const c = normalizarConfigAutofill({
    porDominio: { ' GitHub.com ': ' #code ', 'vazio.com': '', '': '#x' },
  });
  assert.deepEqual(c.porDominio, { 'github.com': '#code' });
});

test('resolverSeletor: override por domínio, senão o padrão', () => {
  const config = {
    habilitado: true,
    seletorPadrao: '#padrao',
    porDominio: { 'github.com': '#gh' },
  };
  assert.equal(resolverSeletor(config, 'github.com'), '#gh');
  assert.equal(resolverSeletor(config, 'outro.com'), '#padrao');
  assert.equal(resolverSeletor(config, null), '#padrao');
});

/* ------------------------- integração no background ------------------------- */

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
});

test('GET_CONFIG inclui autofill (padrão na 1ª vez)', async () => {
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.deepEqual(r.autofill, {
    habilitado: false,
    seletorPadrao: SELETOR_OTP_PADRAO,
    fecharAoPreencher: false,
    porDominio: {},
    login: { ...LOGIN_PADRAO },
  });
});

test('SET_AUTOFILL persiste seletor padrão e por domínio', async () => {
  await bg.rotear({
    type: 'SET_AUTOFILL',
    config: { habilitado: true, seletorPadrao: '#code', porDominio: { 'a.com': '.x' } },
  });
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.deepEqual(r.autofill, {
    habilitado: true,
    seletorPadrao: '#code',
    fecharAoPreencher: false,
    porDominio: { 'a.com': '.x' },
    login: { ...LOGIN_PADRAO },
  });
});

test('SET_AUTOFILL persiste fecharAoPreencher', async () => {
  await bg.rotear({
    type: 'SET_AUTOFILL',
    config: { habilitado: true, fecharAoPreencher: true },
  });
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.equal(r.autofill.fecharAoPreencher, true);
});

test('SET_AUTOFILL exige sessão desbloqueada', async () => {
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await bg.rotear({ type: 'SET_AUTOFILL', config: {} })).erro, 'SESSAO_BLOQUEADA');
});
