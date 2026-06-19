import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import {
  normalizarTimeout,
  TIMEOUT_PADRAO_MS,
  TIMEOUT_MIN_MS,
  TIMEOUT_MAX_MS,
} from '../src/sessaoconfig.js';

test('normalizarTimeout respeita limites e fallback', () => {
  assert.equal(normalizarTimeout(60000), 60000);
  assert.equal(normalizarTimeout(1), TIMEOUT_MIN_MS); // abaixo do mínimo
  assert.equal(normalizarTimeout(99999999), TIMEOUT_MAX_MS); // acima do máximo
  assert.equal(normalizarTimeout('abc'), TIMEOUT_PADRAO_MS); // inválido
});

/* ------------------------- integração com a sessão ------------------------- */

globalThis.browser = criarBrowserMock();
const sessao = await import('../src/sessao.js');

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
  sessao.bloquear();
  sessao.definirTimeoutMs(TIMEOUT_PADRAO_MS);
});

test('a sessão expira no tempo configurado (definirTimeoutMs)', () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    sessao.definirTimeoutMs(60000); // 1 min
    sessao.ativarSessao({ fake: true });
    mock.timers.tick(59000);
    assert.equal(sessao.estaDesbloqueado(), true, 'não expira antes de 1 min');
    mock.timers.tick(2000);
    assert.equal(sessao.estaDesbloqueado(), false, 'expira passado o tempo configurado');
  } finally {
    mock.timers.reset();
  }
});

/* ------------------------------- background ------------------------------- */

const bg = await import('../src/background.js');

test('GET_CONFIG inclui sessaoTimeoutMs (padrão na 1ª vez)', async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
  const r = await bg.rotear({ type: 'GET_CONFIG' });
  assert.equal(r.sessaoTimeoutMs, TIMEOUT_PADRAO_MS);
});

test('SET_SESSION_TIMEOUT persiste, normaliza e exige desbloqueio', async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });

  const set = await bg.rotear({ type: 'SET_SESSION_TIMEOUT', ms: 1 }); // abaixo do mínimo
  assert.equal(set.sessaoTimeoutMs, TIMEOUT_MIN_MS);
  assert.equal((await bg.rotear({ type: 'GET_CONFIG' })).sessaoTimeoutMs, TIMEOUT_MIN_MS);

  await bg.rotear({ type: 'LOCK' });
  assert.equal(
    (await bg.rotear({ type: 'SET_SESSION_TIMEOUT', ms: 60000 })).erro,
    'SESSAO_BLOQUEADA',
  );
});
