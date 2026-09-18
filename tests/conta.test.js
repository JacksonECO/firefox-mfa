import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarConta, mascararEmail, TAMANHO_MAXIMO_EMAIL } from '../src/conta.js';

const validos = { dominio: 'GitHub.com', email: ' eu@exemplo.com ', senha: 'abc123', rotulo: ' Pessoal ' };

test('campos válidos passam e são normalizados', () => {
  const r = validarConta(validos);
  assert.equal(r.valido, true);
  assert.deepEqual(r.normalizado, {
    dominio: 'github.com',
    email: 'eu@exemplo.com',
    senha: 'abc123',
    rotulo: 'Pessoal',
  });
});

test('domínio é obrigatório (a conta é sempre de um site)', () => {
  const r = validarConta({ ...validos, dominio: '   ' });
  assert.equal(r.valido, false);
  assert.match(r.erros.dominio, /site/i);
});

test('e-mail e senha são obrigatórios', () => {
  assert.match(validarConta({ ...validos, email: '' }).erros.email, /e-mail|usuário/i);
  assert.match(validarConta({ ...validos, senha: '' }).erros.senha, /senha/i);
});

test('aceita usuário que não é e-mail (login por CPF, apelido, etc.)', () => {
  const r = validarConta({ ...validos, email: '123.456.789-00' });
  assert.equal(r.valido, true);
  assert.equal(r.normalizado.email, '123.456.789-00');
});

test('senha não tem regra de força (é a senha do site, não a mestra)', () => {
  assert.equal(validarConta({ ...validos, senha: 'a' }).valido, true);
});

test('na edição a senha em branco é aceita (significa "manter a atual")', () => {
  const r = validarConta({ ...validos, senha: '' }, { exigirSenha: false });
  assert.equal(r.valido, true);
  assert.equal(r.normalizado.senha, '');
});

test('limites de tamanho de e-mail e rótulo', () => {
  assert.equal(validarConta({ ...validos, email: 'a'.repeat(TAMANHO_MAXIMO_EMAIL + 1) }).valido, false);
  assert.equal(validarConta({ ...validos, rotulo: 'r'.repeat(61) }).valido, false);
});

test('rótulo vazio vira null; markup é preservado como texto', () => {
  assert.equal(validarConta({ ...validos, rotulo: '  ' }).normalizado.rotulo, null);
  const r = validarConta({ ...validos, rotulo: '<script>alert(1)</script>' });
  assert.equal(r.valido, true);
  assert.equal(r.normalizado.rotulo, '<script>alert(1)</script>');
});

test('entrada ausente não lança', () => {
  assert.equal(validarConta().valido, false);
  assert.equal(validarConta(undefined).normalizado.email, '');
});

test('mascararEmail esconde o usuário e mantém o domínio', () => {
  assert.equal(mascararEmail('jackson@gmail.com'), 'j•••@gmail.com');
  assert.equal(mascararEmail('usuario123'), 'u•••3');
  assert.equal(mascararEmail('ab'), 'a•••');
  assert.equal(mascararEmail(''), '');
  assert.equal(mascararEmail(null), '');
});
