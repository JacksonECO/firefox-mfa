import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

// Mock do `browser` antes de qualquer uso (sessao.js / storage.js leem o global
// tardiamente). Renovado a cada teste para isolar o storage e os alarmes.
globalThis.browser = criarBrowserMock();
const sessao = await import('../src/sessao.js');

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
  sessao.bloquear(); // zera o estado em memória do módulo entre testes
});

test('primeiro acesso: definir senha mestra inicializa e desbloqueia', async () => {
  assert.equal(await sessao.estaInicializado(), false);
  assert.equal(await sessao.definirSenhaMestra('minha-senha-mestra'), true);
  assert.equal(await sessao.estaInicializado(), true);
  assert.equal(sessao.estaDesbloqueado(), true);
});

test('definir senha mestra duas vezes é rejeitado', async () => {
  await sessao.definirSenhaMestra('primeira');
  await assert.rejects(() => sessao.definirSenhaMestra('segunda'), /já foi definida/);
});

test('desbloquear: senha errada falha, senha certa libera', async () => {
  await sessao.definirSenhaMestra('correta');
  sessao.bloquear();
  assert.equal(sessao.estaDesbloqueado(), false);

  assert.equal(await sessao.desbloquear('errada'), false);
  assert.equal(sessao.estaDesbloqueado(), false); // continua bloqueado

  assert.equal(await sessao.desbloquear('correta'), true);
  assert.equal(sessao.estaDesbloqueado(), true);
});

test('desbloquear sem inicialização retorna false', async () => {
  assert.equal(await sessao.desbloquear('qualquer'), false);
});

test('a senha mestra nunca é persistida em claro no storage', async () => {
  await sessao.definirSenhaMestra('s3nh4-secreta');
  for (const valor of globalThis.browser._dados.values()) {
    assert.ok(!JSON.stringify(valor).includes('s3nh4-secreta'));
  }
});

test('sessão expira após 2 min; interação reseta o timer', () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    const chaveFake = { tipo: 'chave-fake-para-teste-de-timer' };

    sessao.ativarSessao(chaveFake); // t = 0
    mock.timers.tick(119_000); // 1m59s
    assert.equal(sessao.estaDesbloqueado(), true, 'não deve expirar em 1m59s');

    mock.timers.tick(2_000); // 2m01s sem interação
    assert.equal(sessao.estaDesbloqueado(), false, 'deve expirar passados 2 min');

    // reset por interação: ativa de novo e interage antes do limite
    sessao.ativarSessao(chaveFake);
    mock.timers.tick(110_000); // +1m50s
    sessao.registrarAtividade(); // interação reseta o relógio
    mock.timers.tick(90_000); // +1m30s desde a última interação
    assert.equal(
      sessao.estaDesbloqueado(),
      true,
      'só 1m30s desde a última interação ⇒ não expira',
    );
  } finally {
    mock.timers.reset();
  }
});

test('checagens/interações repetidas não duplicam o agendamento do alarme', () => {
  sessao.ativarSessao({});
  sessao.registrarAtividade();
  sessao.registrarAtividade();
  sessao.estaDesbloqueado();
  sessao.estaDesbloqueado();

  // todo agendamento usa o mesmo nome fixo ⇒ substituição, nunca duplicação
  const nomes = new Set(globalThis.browser._alarmesCriados.map((a) => a.nome));
  assert.equal(nomes.size, 1);
  assert.equal([...nomes][0], sessao.NOME_ALARME);

  // estado consistente entre múltiplas checagens
  assert.equal(sessao.estaDesbloqueado(), true);
  assert.equal(sessao.estaDesbloqueado(), true);
});

test('o alarme de expiração é agendado para 2 minutos', () => {
  sessao.ativarSessao({});
  const ultimo = globalThis.browser._alarmesCriados.at(-1);
  assert.equal(ultimo.info.delayInMinutes, 2);
});
