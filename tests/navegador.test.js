// Testa o shim de compatibilidade browser/chrome (src/navegador.js).
//
// O shim roda seu efeito uma única vez por módulo carregado; para exercitar os
// três cenários reavaliamos o módulo com uma query-string distinta a cada import
// (o ESM do Node trata `?n` como um módulo novo).

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let browserOriginal;
let chromeOriginal;

beforeEach(() => {
  browserOriginal = globalThis.browser;
  chromeOriginal = globalThis.chrome;
});

afterEach(() => {
  // Restaura o ambiente para não vazar estado para outros testes da suíte.
  if (browserOriginal === undefined) delete globalThis.browser;
  else globalThis.browser = browserOriginal;
  if (chromeOriginal === undefined) delete globalThis.chrome;
  else globalThis.chrome = chromeOriginal;
});

test('no Chrome (só `chrome`): cria o alias browser → chrome', async () => {
  delete globalThis.browser;
  const sentinela = { _chrome: true };
  globalThis.chrome = sentinela;

  await import('../src/navegador.js?cenario=chrome');

  assert.equal(globalThis.browser, sentinela);
});

test('no Firefox (`browser` já existe): não sobrescreve', async () => {
  const oBrowser = { _firefox: true };
  const oChrome = { _chrome: true };
  globalThis.browser = oBrowser;
  globalThis.chrome = oChrome;

  await import('../src/navegador.js?cenario=firefox');

  assert.equal(globalThis.browser, oBrowser, 'browser existente deve ser preservado');
});

test('sem `browser` nem `chrome` (Node puro): não lança e não cria browser', async () => {
  delete globalThis.browser;
  delete globalThis.chrome;

  await import('../src/navegador.js?cenario=node');

  assert.equal(globalThis.browser, undefined);
});
