import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
});

test('autocópia vem DESLIGADA por padrão (task 29)', async () => {
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.equal(r.autocopiar, false);
});

test('GET_CONFIG_PUBLICO devolve autocopiar/autofill sem exigir sessão (task 28)', async () => {
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({ type: 'GET_CONFIG_PUBLICO' });
  assert.equal(r.ok, true);
  assert.equal(r.autocopiar, false); // padrão desligado
  assert.ok(r.autofill && typeof r.autofill === 'object');
  // não expõe config sensível/extra sem sessão
  assert.equal(r.rateLimit, undefined);
  assert.equal(r.sessaoTimeoutMs, undefined);
});

test('GET_CONFIG_PUBLICO reflete o que foi salvo (task 28)', async () => {
  await bg.rotear({ type: 'SET_AUTOCOPY', habilitado: true });
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({ type: 'GET_CONFIG_PUBLICO' });
  assert.equal(r.autocopiar, true);
});

test('SET_AUTOCOPY desliga e GET_CONFIG reflete', async () => {
  await bg.rotear({ type: 'SET_AUTOCOPY', habilitado: false });
  assert.equal((await bg.rotear({ type: 'GET_CONFIG' })).autocopiar, false);
  await bg.rotear({ type: 'SET_AUTOCOPY', habilitado: true });
  assert.equal((await bg.rotear({ type: 'GET_CONFIG' })).autocopiar, true);
});

test('SET_AUTOCOPY exige sessão desbloqueada', async () => {
  await bg.rotear({ type: 'LOCK' });
  assert.equal(
    (await bg.rotear({ type: 'SET_AUTOCOPY', habilitado: false })).erro,
    'SESSAO_BLOQUEADA',
  );
});
