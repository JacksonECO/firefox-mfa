import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairDominioDaAba, normalizarDominio } from '../src/dominio.js';

test('URL https/http normal retorna o hostname', () => {
  assert.equal(extrairDominioDaAba({ url: 'https://github.com/login' }), 'github.com');
  assert.equal(extrairDominioDaAba({ url: 'http://example.com/' }), 'example.com');
});

test('hostname já vem minúsculo (spec WHATWG URL)', () => {
  assert.equal(extrairDominioDaAba({ url: 'https://GitHub.com/' }), 'github.com');
});

test('about:/file:/sem url retornam null sem lançar', () => {
  assert.equal(extrairDominioDaAba({ url: 'about:debugging' }), null);
  assert.equal(extrairDominioDaAba({ url: 'file:///home/user/x.html' }), null);
  assert.equal(extrairDominioDaAba({ url: 'moz-extension://abc/popup.html' }), null);
  assert.equal(extrairDominioDaAba({}), null);
  assert.equal(extrairDominioDaAba(null), null);
  assert.equal(extrairDominioDaAba(undefined), null);
});

test('URL malformada retorna null', () => {
  assert.equal(extrairDominioDaAba({ url: 'isto não é uma url' }), null);
});

test('porta é descartada; IP literal e subdomínio preservados', () => {
  assert.equal(extrairDominioDaAba({ url: 'http://localhost:3000/x' }), 'localhost');
  assert.equal(extrairDominioDaAba({ url: 'http://192.168.1.1/login' }), '192.168.1.1');
  assert.equal(extrairDominioDaAba({ url: 'https://app.exemplo.com/' }), 'app.exemplo.com');
});

test('normalizarDominio: trim + minúsculo, vazio vira null', () => {
  assert.equal(normalizarDominio('  GitHub.com '), 'github.com');
  assert.equal(normalizarDominio(''), null);
  assert.equal(normalizarDominio('   '), null);
  assert.equal(normalizarDominio(null), null);
  assert.equal(normalizarDominio(undefined), null);
});
