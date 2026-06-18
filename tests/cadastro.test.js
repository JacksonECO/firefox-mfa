import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarCadastro } from '../src/cadastro.js';

const SEGREDO = 'JBSWY3DPEHPK3PXP';

test('válido: nome + segredo, domínio opcional', () => {
  const r = validarCadastro({ nome: 'GitHub', dominio: 'github.com', secret: SEGREDO });
  assert.equal(r.valido, true);
  assert.deepEqual(r.erros, {});
  assert.equal(r.normalizado.nome, 'GitHub');
  assert.equal(r.normalizado.dominio, 'github.com');
  assert.equal(r.normalizado.secret, SEGREDO);
});

test('válido sem domínio (vazio vira null)', () => {
  const r = validarCadastro({ nome: 'X', dominio: '', secret: SEGREDO });
  assert.equal(r.valido, true);
  assert.equal(r.normalizado.dominio, null);
});

test('nome é obrigatório', () => {
  const r = validarCadastro({ nome: '   ', dominio: '', secret: SEGREDO });
  assert.equal(r.valido, false);
  assert.ok(r.erros.nome);
});

test('segredo é obrigatório', () => {
  const r = validarCadastro({ nome: 'X', dominio: '', secret: '' });
  assert.equal(r.valido, false);
  assert.ok(r.erros.secret);
});

test('segredo fora do Base32 é rejeitado', () => {
  const r = validarCadastro({ nome: 'X', dominio: '', secret: '0189!!' });
  assert.equal(r.valido, false);
  assert.ok(r.erros.secret);
});

test('normaliza segredo (espaços/minúsculas) e domínio (caixa)', () => {
  const r = validarCadastro({
    nome: '  Conta  ',
    dominio: 'Site.COM',
    secret: 'jbsw y3dp ehpk 3pxp',
  });
  assert.equal(r.valido, true);
  assert.equal(r.normalizado.nome, 'Conta');
  assert.equal(r.normalizado.secret, SEGREDO);
  assert.equal(r.normalizado.dominio, 'site.com');
});

test('aceita caracteres especiais no nome (defesa XSS é na renderização)', () => {
  const r = validarCadastro({ nome: '<script>alert(1)</script>', secret: SEGREDO });
  assert.equal(r.valido, true);
  assert.equal(r.normalizado.nome, '<script>alert(1)</script>');
});
