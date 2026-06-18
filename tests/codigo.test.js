import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoParaCopia, formatarCodigoExibicao } from '../src/codigo.js';

test('codigoParaCopia remove espaços e preserva zeros à esquerda', () => {
  assert.equal(codigoParaCopia('007 123'), '007123');
  assert.equal(codigoParaCopia('123456'), '123456');
  assert.equal(codigoParaCopia('007123'), '007123'); // continua com 6 dígitos
});

test('formatarCodigoExibicao agrupa 6 dígitos em NNN NNN', () => {
  assert.equal(formatarCodigoExibicao('123456'), '123 456');
  assert.equal(formatarCodigoExibicao('007123'), '007 123');
});

test('formatarCodigoExibicao deixa comprimentos diferentes como estão', () => {
  assert.equal(formatarCodigoExibicao('12345'), '12345');
});
