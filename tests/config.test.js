import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import {
  normalizarConfigRateLimit,
  calcularAtraso,
  RATE_LIMIT_PADRAO,
} from '../src/ratelimit.js';

test('normalizarConfigRateLimit corrige faixas incoerentes', () => {
  // limite2 < limite1 < livres → reordenado para faixas válidas
  const c = normalizarConfigRateLimit({ livres: 5, limite1: 2, limite2: 1 });
  assert.ok(c.livres < c.limite1);
  assert.ok(c.limite1 < c.limite2);
});

test('normalizarConfigRateLimit cai no padrão para campos ausentes/inválidos', () => {
  const c = normalizarConfigRateLimit({ atraso1Ms: 'abc' });
  assert.equal(c.atraso1Ms, RATE_LIMIT_PADRAO.atraso1Ms);
  assert.equal(c.livres, RATE_LIMIT_PADRAO.livres);
});

test('normalizarConfigRateLimit limita atrasos negativos a 0', () => {
  const c = normalizarConfigRateLimit({ atraso1Ms: -500 });
  assert.equal(c.atraso1Ms, 0);
});

test('calcularAtraso respeita uma config customizada', () => {
  const config = normalizarConfigRateLimit({
    livres: 1,
    limite1: 2,
    atraso1Ms: 2000,
    limite2: 3,
    atraso2Ms: 4000,
    atrasoMaxMs: 60000,
  });
  assert.equal(calcularAtraso(0, config), 0); // < livres
  assert.equal(calcularAtraso(1, config), 2000); // faixa 1
  assert.equal(calcularAtraso(2, config), 4000); // faixa 2
  assert.equal(calcularAtraso(3, config), 60000); // máximo
});

test('calcularAtraso sem config usa os padrões', () => {
  assert.equal(calcularAtraso(0), 0);
  assert.equal(calcularAtraso(3), 1000);
  assert.equal(calcularAtraso(6), 5000);
  assert.equal(calcularAtraso(10), 30000);
});

/* ------------------- integração no background (GET/SET) ------------------- */

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
});

test('GET_CONFIG devolve os padrões na primeira vez', async () => {
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rateLimit, RATE_LIMIT_PADRAO);
});

test('SET_RATE_LIMIT persiste e GET_CONFIG reflete', async () => {
  const config = { livres: 1, limite1: 2, atraso1Ms: 2000, limite2: 3, atraso2Ms: 4000, atrasoMaxMs: 60000 };
  const set = await bg.rotear({ type: 'SET_RATE_LIMIT', config });
  assert.equal(set.ok, true);
  const get = await bg.rotear({ type: 'GET_CONFIG' });
  assert.equal(get.rateLimit.livres, 1);
  assert.equal(get.rateLimit.atrasoMaxMs, 60000);
});

test('GET_CONFIG/SET_RATE_LIMIT exigem sessão desbloqueada', async () => {
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await bg.rotear({ type: 'GET_CONFIG' })).erro, 'SESSAO_BLOQUEADA');
  assert.equal(
    (await bg.rotear({ type: 'SET_RATE_LIMIT', config: {} })).erro,
    'SESSAO_BLOQUEADA',
  );
});
