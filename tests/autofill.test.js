import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import {
  normalizarConfigAutofill,
  SELETOR_OTP_PADRAO,
  AUTOFILL_PADRAO,
} from '../src/autofill.js';

test('AUTOFILL_PADRAO vem desligado (opt-in) com o seletor OTP padrão', () => {
  assert.equal(AUTOFILL_PADRAO.habilitado, false);
  assert.equal(AUTOFILL_PADRAO.seletor, SELETOR_OTP_PADRAO);
});

test('normalizarConfigAutofill coage habilitado e usa o padrão p/ seletor vazio', () => {
  assert.deepEqual(normalizarConfigAutofill({ habilitado: 1, seletor: '  ' }), {
    habilitado: true,
    seletor: SELETOR_OTP_PADRAO,
  });
  assert.deepEqual(normalizarConfigAutofill({}), {
    habilitado: false,
    seletor: SELETOR_OTP_PADRAO,
  });
});

test('normalizarConfigAutofill preserva um seletor customizado (trim)', () => {
  const c = normalizarConfigAutofill({ habilitado: true, seletor: '  #otp input  ' });
  assert.equal(c.seletor, '#otp input');
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
  assert.deepEqual(r.autofill, { habilitado: false, seletor: SELETOR_OTP_PADRAO });
});

test('SET_AUTOFILL persiste e GET_CONFIG reflete', async () => {
  await bg.rotear({ type: 'SET_AUTOFILL', config: { habilitado: true, seletor: '#code' } });
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.deepEqual(r.autofill, { habilitado: true, seletor: '#code' });
});

test('SET_AUTOFILL exige sessão desbloqueada', async () => {
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await bg.rotear({ type: 'SET_AUTOFILL', config: {} })).erro, 'SESSAO_BLOQUEADA');
});
