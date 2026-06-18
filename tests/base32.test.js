import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarSegredo, ehBase32Valido, decodificarBase32 } from '../src/base32.js';

test('normalizarSegredo remove espaços e passa a maiúsculas', () => {
  assert.equal(normalizarSegredo('jbsw y3dp ehpk 3pxp'), 'JBSWY3DPEHPK3PXP');
  assert.equal(normalizarSegredo('  abcdef  '), 'ABCDEF');
  assert.equal(normalizarSegredo(123), ''); // não-string vira string vazia
});

test('Base32 válido (com e sem espaços/minúsculas)', () => {
  assert.equal(ehBase32Valido('JBSWY3DPEHPK3PXP'), true);
  assert.equal(ehBase32Valido('jbsw y3dp ehpk 3pxp'), true);
  assert.equal(ehBase32Valido('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), true);
});

test('padding "=" é aceito', () => {
  assert.equal(ehBase32Valido('MFRGG==='), true);
});

test('caracteres fora do alfabeto Base32 são inválidos', () => {
  assert.equal(ehBase32Valido('JBSW0189'), false); // 0,1,8,9 não existem em Base32
  assert.equal(ehBase32Valido('hello!'), false);
  assert.equal(ehBase32Valido(''), false);
  assert.equal(ehBase32Valido('===='), false); // só padding, sem dados
});

test('decodificarBase32 do segredo do RFC 6238 dá os 20 bytes ASCII', () => {
  const bytes = decodificarBase32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(bytes.length, 20);
  assert.equal(new TextDecoder().decode(bytes), '12345678901234567890');
});

test('decodificarBase32 tolera minúsculas, espaços e padding', () => {
  const a = decodificarBase32('gezd gnbv gy3t qojq');
  const b = decodificarBase32('GEZDGNBVGY3TQOJQ');
  assert.deepEqual([...a], [...b]);
  assert.deepEqual([...decodificarBase32('MFRGG===')], [...decodificarBase32('MFRGG')]);
});

test('decodificarBase32 lança em caractere inválido e vazio dá 0 bytes', () => {
  assert.throws(() => decodificarBase32('JBSW0189'));
  assert.equal(decodificarBase32('').length, 0);
});
