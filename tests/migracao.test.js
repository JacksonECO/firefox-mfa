import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const storage = await import('../src/storage.js');

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
});

test('instalação nova grava a schemaVersion atual', async () => {
  assert.equal(await storage.obterSchemaVersion(), null);
  assert.equal(await storage.migrarSeNecessario(), storage.SCHEMA_ATUAL);
  assert.equal(await storage.obterSchemaVersion(), storage.SCHEMA_ATUAL);
});

test('no-op quando já está na versão atual (não altera dados)', async () => {
  globalThis.browser._dados.set('schemaVersion', storage.SCHEMA_ATUAL);
  globalThis.browser._dados.set('mfaItems', [{ id: '1', nome: 'A' }]);
  assert.equal(await storage.migrarSeNecessario(), storage.SCHEMA_ATUAL);
  assert.deepEqual(globalThis.browser._dados.get('mfaItems'), [{ id: '1', nome: 'A' }]);
});

test('schemaVersion ausente com dados existentes → grava a atual sem perder MFAs', async () => {
  globalThis.browser._dados.set('mfaItems', [{ id: '1', nome: 'A' }]);
  assert.equal(await storage.obterSchemaVersion(), null);
  await storage.migrarSeNecessario();
  assert.equal(await storage.obterSchemaVersion(), storage.SCHEMA_ATUAL);
  assert.deepEqual(globalThis.browser._dados.get('mfaItems'), [{ id: '1', nome: 'A' }]);
});

test('v1 → v2: cria credItems vazio e preserva os MFAs', async () => {
  globalThis.browser._dados.set('schemaVersion', 1);
  globalThis.browser._dados.set('mfaItems', [{ id: '1', nome: 'A' }]);
  assert.equal(await storage.migrarSeNecessario(), 2);
  assert.equal(await storage.obterSchemaVersion(), 2);
  assert.deepEqual(globalThis.browser._dados.get('credItems'), []);
  assert.deepEqual(globalThis.browser._dados.get('mfaItems'), [{ id: '1', nome: 'A' }]);
});

test('v1 → v2 não descarta contas já existentes', async () => {
  globalThis.browser._dados.set('schemaVersion', 1);
  globalThis.browser._dados.set('credItems', [{ id: 'c1', dominio: 'x.com' }]);
  await storage.migrarSeNecessario();
  assert.deepEqual(globalThis.browser._dados.get('credItems'), [{ id: 'c1', dominio: 'x.com' }]);
});
