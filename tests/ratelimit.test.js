import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import { calcularAtraso } from '../src/ratelimit.js';

globalThis.browser = criarBrowserMock();
const sessao = await import('../src/sessao.js');
const storage = await import('../src/storage.js');

// Não atrasa de verdade nos testes: captura os valores pedidos.
const semEspera = { esperar: async () => {} };

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
  sessao.bloquear();
});

test('calcularAtraso cobre as quatro faixas da tabela', () => {
  assert.equal(calcularAtraso(0), 0);
  assert.equal(calcularAtraso(2), 0); // 1ª–3ª livres
  assert.equal(calcularAtraso(3), 1000); // 4ª–6ª
  assert.equal(calcularAtraso(5), 1000);
  assert.equal(calcularAtraso(6), 5000); // 7ª–10ª
  assert.equal(calcularAtraso(9), 5000);
  assert.equal(calcularAtraso(10), 30000); // 11ª+
  assert.equal(calcularAtraso(50), 30000);
});

test('tentativa errada incrementa o contador; o atraso segue a tabela', async () => {
  await sessao.definirSenhaMestra('correta');
  sessao.bloquear();

  const atrasos = [];
  const esperar = async (ms) => atrasos.push(ms);

  for (let i = 0; i < 4; i++) {
    assert.equal(await sessao.desbloquear('errada', { esperar }), false);
  }
  // contadores vistos antes de cada tentativa: 0,1,2,3 → atrasos 0,0,0,1000
  assert.deepEqual(atrasos, [0, 0, 0, 1000]);
  assert.equal(await storage.obterTentativas(), 4);
});

test('acerto no meio da sequência zera o contador', async () => {
  await sessao.definirSenhaMestra('correta');
  sessao.bloquear();

  await sessao.desbloquear('errada', semEspera);
  await sessao.desbloquear('errada', semEspera);
  assert.equal(await storage.obterTentativas(), 2);

  assert.equal(await sessao.desbloquear('correta', semEspera), true);
  assert.equal(await storage.obterTentativas(), 0);
});

test('o contador persiste no storage entre "reaberturas" do popup', async () => {
  await sessao.definirSenhaMestra('correta');
  sessao.bloquear();

  await sessao.desbloquear('errada', semEspera);
  await sessao.desbloquear('errada', semEspera);
  // "reabre o popup" = nova checagem, sem reset: o contador continua no storage
  assert.equal(await storage.obterTentativas(), 2);
});
