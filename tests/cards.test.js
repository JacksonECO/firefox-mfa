import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiarParaClipboard } from '../popup/cards.js';

function clipboardMock() {
  const chamadas = [];
  return {
    chamadas,
    writeText(valor) {
      chamadas.push(valor);
      return Promise.resolve();
    },
  };
}

test('copia exatamente o código exibido, sem espaços', async () => {
  const cb = clipboardMock();
  const valor = await copiarParaClipboard('007 123', cb);
  assert.equal(valor, '007123');
  assert.deepEqual(cb.chamadas, ['007123']);
});

test('código vazio não chama o clipboard e rejeita', async () => {
  const cb = clipboardMock();
  await assert.rejects(() => copiarParaClipboard('', cb));
  assert.equal(cb.chamadas.length, 0);
});

test('falha do clipboard propaga (caller não mostra "copiado")', async () => {
  const cb = {
    writeText() {
      return Promise.reject(new Error('permissão negada'));
    },
  };
  await assert.rejects(() => copiarParaClipboard('123456', cb));
});
