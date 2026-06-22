import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirTela,
  validarCadastroSenha,
  avaliarForcaSenha,
  TAMANHO_MINIMO_SENHA,
} from '../src/senha.js';

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

test('validarCadastroSenha: senha curta (< 3) é rejeitada', () => {
  assert.equal(TAMANHO_MINIMO_SENHA, 3);
  const r = validarCadastroSenha({ senha: 'ab', confirmacao: 'ab' });
  assert.equal(r.valido, false);
  assert.ok(r.erros.senha);
});

test('validarCadastroSenha: 3 caracteres já são aceitos (único requisito)', () => {
  const r = validarCadastroSenha({ senha: 'abc', confirmacao: 'abc' });
  assert.equal(r.valido, true);
  assert.deepEqual(r.erros, {});
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

test('avaliarForcaSenha: vazia não tem nível nem rótulo', () => {
  const a = avaliarForcaSenha('');
  assert.equal(a.comprimento, 0);
  assert.equal(a.atendeMinimo, false);
  assert.equal(a.pontos, 0);
  assert.equal(a.rotulo, '');
});

test('avaliarForcaSenha: abaixo do mínimo é "Muito curta" mesmo com variedade', () => {
  const a = avaliarForcaSenha('A1'); // 2 chars
  assert.equal(a.atendeMinimo, false);
  assert.equal(a.nivel, 0);
  assert.equal(a.rotulo, 'Muito curta');
});

test('avaliarForcaSenha: detecta cada fator independentemente', () => {
  const a = avaliarForcaSenha('Ab1$xyz9'); // 8 chars, minúscula, maiúscula, número, especial
  assert.deepEqual(a.criterios, {
    comprimento: true,
    minuscula: true,
    maiuscula: true,
    numero: true,
    especial: true,
  });
  assert.equal(a.pontos, 5);
  assert.equal(a.rotulo, 'Muito forte');
});

test('avaliarForcaSenha: só minúsculas curtas é "Fraca"', () => {
  const a = avaliarForcaSenha('abcd'); // só minúscula, < 8
  assert.deepEqual(a.criterios, {
    comprimento: false,
    minuscula: true,
    maiuscula: false,
    numero: false,
    especial: false,
  });
  assert.equal(a.pontos, 1);
  assert.equal(a.rotulo, 'Fraca');
});
