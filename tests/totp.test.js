import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarTOTP, segundosRestantes, janelaAtual, PASSO_PADRAO } from '../src/totp.js';

// Vetores oficiais do RFC 6238, Apêndice B (HMAC-SHA1, segredo ASCII
// "12345678901234567890"). O RFC mostra 8 dígitos; o produto trunca para 6
// (= os 6 últimos dígitos do valor de 8).
const SEGREDO = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const VETORES = [
  [59, '287082'], // RFC: 94287082
  [1111111109, '081804'], // RFC: 07081804
  [1111111111, '050471'], // RFC: 14050471
  [1234567890, '005924'], // RFC: 89005924
  [2000000000, '279037'], // RFC: 69279037
];

for (const [t, esperado] of VETORES) {
  test(`TOTP RFC 6238 em T=${t} → ${esperado}`, async () => {
    assert.equal(await gerarTOTP(SEGREDO, { epochMs: t * 1000 }), esperado);
  });
}

test('código sempre tem 6 dígitos (zeros à esquerda preservados)', async () => {
  for (const [t] of VETORES) {
    const codigo = await gerarTOTP(SEGREDO, { epochMs: t * 1000 });
    assert.match(codigo, /^\d{6}$/);
  }
});

test('robustez: segredo em minúsculas/espaços gera o mesmo código', async () => {
  const a = await gerarTOTP(SEGREDO, { epochMs: 59000 });
  const b = await gerarTOTP('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', { epochMs: 59000 });
  assert.equal(a, b);
});

test('fronteira exata da janela de 30s: códigos diferentes nos dois lados', async () => {
  const antes = await gerarTOTP(SEGREDO, { epochMs: 29_999 }); // janela 0
  const depois = await gerarTOTP(SEGREDO, { epochMs: 30_001 }); // janela 1
  assert.notEqual(antes, depois);
});

test('janelaAtual muda exatamente na fronteira de 30s', () => {
  assert.equal(janelaAtual(29_999, PASSO_PADRAO), 0);
  assert.equal(janelaAtual(30_001, PASSO_PADRAO), 1);
  assert.equal(janelaAtual(59_000, PASSO_PADRAO), 1);
  assert.equal(janelaAtual(60_000, PASSO_PADRAO), 2);
});

test('segundosRestantes: fórmula e fronteira (início de janela = 30, não 0)', () => {
  assert.equal(segundosRestantes(0), 30); // início de janela
  assert.equal(segundosRestantes(1000), 29);
  assert.equal(segundosRestantes(29_000), 1);
  assert.equal(segundosRestantes(30_000), 30); // nova janela: volta a 30
});

test('segredo vazio lança erro', async () => {
  await assert.rejects(() => gerarTOTP(''));
});
