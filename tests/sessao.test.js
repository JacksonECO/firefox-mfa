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
  sessao.marcarPopupFechado(); // garante popupAberto=false entre testes
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

test('com o popup aberto a sessão NÃO expira, mesmo após muito tempo', () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    sessao.ativarSessao({}); // t = 0
    sessao.marcarPopupAberto(); // popup aberto: keep-alive

    mock.timers.tick(10 * 60_000); // 10 min sem nenhuma interação
    assert.equal(
      sessao.estaDesbloqueado(),
      true,
      'enquanto o popup está aberto, a inatividade não expira a sessão',
    );
  } finally {
    mock.timers.reset();
  }
});

test('ao fechar o popup a janela de inatividade recomeça do zero', () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    sessao.ativarSessao({});
    sessao.marcarPopupAberto();
    mock.timers.tick(10 * 60_000); // muito tempo com o popup aberto
    sessao.marcarPopupFechado(); // fecha: o relógio reinicia agora

    mock.timers.tick(119_000); // 1m59s após fechar
    assert.equal(sessao.estaDesbloqueado(), true, 'ainda dentro dos 2 min após fechar');

    mock.timers.tick(2_000); // 2m01s após fechar
    assert.equal(sessao.estaDesbloqueado(), false, 'expira 2 min depois de fechar o popup');
  } finally {
    mock.timers.reset();
  }
});

test('keep-alive: heartbeat para quando faltam <=30s (não mantém o worker além do timeout)', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const heartbeat = mock.fn(async () => ({ os: 'linux' }));
  globalThis.browser.runtime = { getPlatformInfo: heartbeat };
  try {
    sessao.ativarSessao({}); // t = 0; janela de 2 min, margem de 30s ⇒ bate só até ~90s

    mock.timers.tick(80_000); // 80s (restam 40s > 30) ⇒ bateu enquanto havia folga
    const antesDaMargem = heartbeat.mock.callCount();
    assert.ok(antesDaMargem >= 1, 'bate enquanto faltam mais de 30s');

    mock.timers.tick(20_000); // 100s (restam 20s <= 30): para de bater, sessão ainda válida
    assert.equal(sessao.estaDesbloqueado(), true, 'a sessão ainda é válida nos últimos 30s');
    const naMargem = heartbeat.mock.callCount();

    mock.timers.tick(15_000); // 115s, ainda dentro da janela
    assert.equal(
      heartbeat.mock.callCount(),
      naMargem,
      'não há heartbeat nos últimos 30s (deixa o worker suspender ~no fim da janela)',
    );

    mock.timers.tick(30_000); // 145s, passou o timeout
    assert.equal(sessao.estaDesbloqueado(), false, 'expira ao fim da janela configurada');
  } finally {
    mock.timers.reset();
    delete globalThis.browser.runtime;
  }
});

test('keep-alive: não dispara heartbeat com o popup aberto (a porta já segura o worker)', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const heartbeat = mock.fn(async () => ({ os: 'linux' }));
  globalThis.browser.runtime = { getPlatformInfo: heartbeat };
  try {
    sessao.ativarSessao({});
    sessao.marcarPopupAberto(); // popup aberto: a porta mantém o worker vivo
    mock.timers.tick(60_000); // 3 ciclos de 20s
    assert.equal(heartbeat.mock.callCount(), 0, 'com popup aberto, sem heartbeat redundante');
    assert.equal(sessao.estaDesbloqueado(), true, 'e a sessão segue ativa');
  } finally {
    mock.timers.reset();
    delete globalThis.browser.runtime;
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
