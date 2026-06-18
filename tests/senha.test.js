import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirTela, validarCadastroSenha } from '../src/senha.js';

test('decidirTela cobre os três estados', () => {
  assert.equal(decidirTela({ temSenha: false, sessaoAtiva: false }), 'criar-senha');
  assert.equal(decidirTela({ temSenha: true, sessaoAtiva: false }), 'desbloquear');
  assert.equal(decidirTela({ temSenha: true, sessaoAtiva: true }), 'principal');
});

test('validarCadastroSenha: senha vazia', () => {
  const r = validarCadastroSenha({ senha: '', confirmacao: '' });
  assert.equal(r.valido, false);
  assert.ok(r.erros.senha);
});

test('validarCadastroSenha: senha curta (< 8)', () => {
  const r = validarCadastroSenha({ senha: 'abc', confirmacao: 'abc' });
  assert.equal(r.valido, false);
  assert.ok(r.erros.senha);
});

test('validarCadastroSenha: confirmação divergente', () => {
  const r = validarCadastroSenha({ senha: 'senha-boa-123', confirmacao: 'outra-coisa' });
  assert.equal(r.valido, false);
  assert.ok(r.erros.confirmacao);
});

test('validarCadastroSenha: válida', () => {
  const r = validarCadastroSenha({ senha: 'senha-boa-123', confirmacao: 'senha-boa-123' });
  assert.equal(r.valido, true);
  assert.deepEqual(r.erros, {});
});
