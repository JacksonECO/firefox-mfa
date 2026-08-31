// Task 32: reabrir o popup em menos de 3s do último fechamento automático
// (fecharAoPreencher) força a tela a ficar visível dessa vez, ignorando a
// config — sinal de que o clique rápido é intencional (ver a tela).
//
// Tudo num teste só, avançando um relógio falso: o estado de
// `PODE_FECHAR_AUTOMATICO` vive em memória do módulo (não é por sessão), então
// testes separados nesse arquivo veriam o mesmo estado carregado entre si.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

test('PODE_FECHAR_AUTOMATICO: janela de reabertura rápida de 3s', async () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    // Sem sessão desbloqueada — não exige (é só um cronômetro de UX).
    const primeira = await bg.rotear({ type: 'PODE_FECHAR_AUTOMATICO' }); // t=0, "fecha"
    assert.deepEqual(primeira, { ok: true, permitir: true });

    mock.timers.tick(1_000); // t=1s: reabriu rápido (< 3s do fechamento)
    const segunda = await bg.rotear({ type: 'PODE_FECHAR_AUTOMATICO' });
    assert.deepEqual(segunda, { ok: true, permitir: false }, 'reabertura rápida força tela aberta');

    // A janela não empilha: consumida, a abertura seguinte já volta ao normal
    // mesmo ainda dentro dos 3s originais do primeiro fechamento.
    mock.timers.tick(500); // t=1.5s
    const terceira = await bg.rotear({ type: 'PODE_FECHAR_AUTOMATICO' });
    assert.deepEqual(terceira, { ok: true, permitir: true }, 'janela consumida não deve empilhar');

    // Passados 3s do fechamento marcado por `terceira`, volta a permitir fechar.
    mock.timers.tick(3_001);
    const quarta = await bg.rotear({ type: 'PODE_FECHAR_AUTOMATICO' });
    assert.deepEqual(quarta, { ok: true, permitir: true }, 'fora da janela, comportamento normal');
  } finally {
    mock.timers.reset();
  }
});
