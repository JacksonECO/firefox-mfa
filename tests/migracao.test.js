import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const storage = await import('../src/storage.js');

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
});

test('instalação nova grava schemaVersion = 1', async () => {
  assert.equal(await storage.obterSchemaVersion(), null);
  assert.equal(await storage.migrarSeNecessario(), 1);
  assert.equal(await storage.obterSchemaVersion(), 1);
});

test('no-op quando já está na versão atual (não altera dados)', async () => {
  globalThis.browser._dados.set('schemaVersion', 1);
  globalThis.browser._dados.set('mfaItems', [{ id: '1', nome: 'A' }]);
  assert.equal(await storage.migrarSeNecessario(), 1);
  assert.deepEqual(globalThis.browser._dados.get('mfaItems'), [{ id: '1', nome: 'A' }]);
});

test('schemaVersion ausente com dados existentes → migra p/ 1 sem perder MFAs', async () => {
  globalThis.browser._dados.set('mfaItems', [{ id: '1', nome: 'A' }]);
  assert.equal(await storage.obterSchemaVersion(), null);
  await storage.migrarSeNecessario();
  assert.equal(await storage.obterSchemaVersion(), 1);
  assert.deepEqual(globalThis.browser._dados.get('mfaItems'), [{ id: '1', nome: 'A' }]);
});
