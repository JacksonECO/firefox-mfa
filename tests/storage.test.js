import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

// `browser` precisa existir antes de o módulo ser usado; storage.js lê o global
// de forma tardia, então basta definir aqui e renovar a cada teste.
globalThis.browser = criarBrowserMock();
const storage = await import('../src/storage.js');

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
});

test('estaInicializado é false em storage vazio', async () => {
  assert.equal(await storage.estaInicializado(), false);
});

test('persiste e lê salt (round-trip de bytes)', async () => {
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  await storage.salvarSalt(salt);
  const lido = await storage.obterSalt();
  assert.deepEqual([...lido], [...salt]);
});

test('persiste e lê o valor de controle', async () => {
  await storage.salvarValorControle({ ciphertext: 'abc', iv: 'def' });
  assert.deepEqual(await storage.obterValorControle(), { ciphertext: 'abc', iv: 'def' });
});

test('estaInicializado vira true só com salt E valor de controle', async () => {
  await storage.salvarSalt(new Uint8Array(16));
  assert.equal(await storage.estaInicializado(), false); // só salt ainda não basta
  await storage.salvarValorControle({ ciphertext: 'a', iv: 'b' });
  assert.equal(await storage.estaInicializado(), true);
});

test('o salt é gravado em base64, nunca como bytes crus', async () => {
  await storage.salvarSalt(new Uint8Array([255, 0, 128]));
  const cru = globalThis.browser._dados.get('cryptoSalt');
  assert.equal(typeof cru, 'string'); // armazenado como string base64
});
