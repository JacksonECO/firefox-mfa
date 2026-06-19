import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
});

test('autocópia vem habilitada por padrão', async () => {
  const r = await bg.rotear({ type: 'GET_CONFIG' });
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
