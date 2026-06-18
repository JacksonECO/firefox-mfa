import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cripto from '../src/crypto.js';

test('deriva a mesma chave 2x a partir de senha+salt iguais (round-trip)', async () => {
  const salt = cripto.gerarBytesAleatorios(cripto.TAMANHO_SALT);
  const chaveA = await cripto.derivarChave('senha-correta', salt);
  const chaveB = await cripto.derivarChave('senha-correta', salt);
  const { ciphertext, iv } = await cripto.criptografar('segredo-totp', chaveA);
  // descriptografar com a chave derivada independentemente deve funcionar
  assert.equal(await cripto.descriptografar(ciphertext, iv, chaveB), 'segredo-totp');
});

test('criptografar e descriptografar retorna o valor original', async () => {
  const chave = await cripto.derivarChave('x', cripto.gerarBytesAleatorios(16));
  const original = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const { ciphertext, iv } = await cripto.criptografar(original, chave);
  assert.equal(await cripto.descriptografar(ciphertext, iv, chave), original);
});

test('dois IVs gerados em chamadas sucessivas são diferentes', async () => {
  const chave = await cripto.derivarChave('x', cripto.gerarBytesAleatorios(16));
  const a = await cripto.criptografar('mesma-mensagem', chave);
  const b = await cripto.criptografar('mesma-mensagem', chave);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext); // IV diferente ⇒ ciphertext diferente
});

test('descriptografar com IV trocado (mas válido) falha — AEAD', async () => {
  const chave = await cripto.derivarChave('x', cripto.gerarBytesAleatorios(16));
  const a = await cripto.criptografar('mensagem', chave);
  const b = await cripto.criptografar('mensagem', chave); // outro IV válido
  await assert.rejects(() => cripto.descriptografar(a.ciphertext, b.iv, chave));
});

test('descriptografar com chave de senha errada falha', async () => {
  const salt = cripto.gerarBytesAleatorios(16);
  const chaveCerta = await cripto.derivarChave('certa', salt);
  const chaveErrada = await cripto.derivarChave('errada', salt);
  const { ciphertext, iv } = await cripto.criptografar('mensagem', chaveCerta);
  await assert.rejects(() => cripto.descriptografar(ciphertext, iv, chaveErrada));
});

test('criptografar segredo vazio ou nulo lança erro de validação', async () => {
  const chave = await cripto.derivarChave('x', cripto.gerarBytesAleatorios(16));
  await assert.rejects(() => cripto.criptografar('', chave), /vazio ou inválido/);
  await assert.rejects(() => cripto.criptografar(null, chave), /vazio ou inválido/);
  await assert.rejects(() => cripto.criptografar(undefined, chave), /vazio ou inválido/);
});

test('derivação usa SHA-256, 600.000 iterações e salt de 16 bytes', async () => {
  const salt = cripto.gerarBytesAleatorios(cripto.TAMANHO_SALT);
  const params = cripto.paramsDerivacao(salt);
  assert.equal(params.name, 'PBKDF2');
  assert.equal(params.hash, 'SHA-256');
  assert.equal(params.iterations, 600_000);
  assert.equal(params.salt.length, 16);
  // e as constantes exportadas batem com os valores esperados
  assert.equal(cripto.ITERACOES_PBKDF2, 600_000);
  assert.equal(cripto.HASH_PBKDF2, 'SHA-256');
  assert.equal(cripto.TAMANHO_SALT, 16);
  assert.equal(cripto.TAMANHO_IV, 12);
});

test('base64 faz round-trip de bytes arbitrários', () => {
  const bytes = cripto.gerarBytesAleatorios(40);
  const voltou = cripto.base64ParaBytes(cripto.bytesParaBase64(bytes));
  assert.deepEqual([...voltou], [...bytes]);
});
