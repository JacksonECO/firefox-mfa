import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

// O background lê `browser` de forma tardia; basta defini-lo antes de usar.
globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

const SEGREDO = 'JBSWY3DPEHPK3PXP';
const OUTRO_SEGREDO = 'GEZDGNBVGY3TQOJQ';

const lerMfa = (id) =>
  (globalThis.browser._dados.get('mfaItems') ?? []).find((m) => m.id === id);

async function salvar(nome, dominio, secret = SEGREDO) {
  const r = await bg.rotear({ type: 'SAVE_MFA', nome, dominio, secret });
  return r.mfa;
}

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
});

/* --------------------------------- task 06 --------------------------------- */

test('LIST_MFAS devolve só metadados (sem segredo)', async () => {
  await salvar('GitHub', 'github.com');
  const r = await bg.rotear({ type: 'LIST_MFAS' });
  assert.equal(r.ok, true);
  assert.equal(r.mfas.length, 1);
  assert.equal(r.mfas[0].nome, 'GitHub');
  assert.ok(!JSON.stringify(r).includes('secretCriptografado'));
  assert.ok(!JSON.stringify(r).includes(SEGREDO));
});

test('LIST_MFAS bloqueado quando a sessão expira', async () => {
  await bg.rotear({ type: 'LOCK' });
  assert.deepEqual(await bg.rotear({ type: 'LIST_MFAS' }), {
    ok: false,
    erro: 'SESSAO_BLOQUEADA',
  });
});

/* --------------------------------- task 07 --------------------------------- */

test('GET_CODE devolve um código de 6 dígitos (e nunca o segredo)', async () => {
  const mfa = await salvar('Conta', 'site.com');
  const r = await bg.rotear({ type: 'GET_CODE', id: mfa.id });
  assert.equal(r.ok, true);
  assert.match(r.codigo, /^\d{6}$/);
  assert.equal(typeof r.segundosRestantes, 'number');
  assert.ok(!JSON.stringify(r).includes(SEGREDO));
});

test('GET_CODE de id inexistente → NAO_ENCONTRADO', async () => {
  const r = await bg.rotear({ type: 'GET_CODE', id: 'nada' });
  assert.equal(r.ok, false);
  assert.equal(r.erro, 'NAO_ENCONTRADO');
});

/* --------------------------------- task 09 --------------------------------- */

test('REVEAL_SECRET devolve o segredo original (exceção do fluxo de edição)', async () => {
  const mfa = await salvar('Conta', 'site.com');
  const r = await bg.rotear({ type: 'REVEAL_SECRET', id: mfa.id });
  assert.equal(r.ok, true);
  assert.equal(r.secret, SEGREDO);
});

test('UPDATE_MFA sem mudar o segredo NÃO recriptografa (mantém IV/ciphertext)', async () => {
  const mfa = await salvar('Velho', 'site.com');
  const antes = lerMfa(mfa.id);
  const r = await bg.rotear({
    type: 'UPDATE_MFA',
    id: mfa.id,
    nome: 'Novo',
    dominio: 'site.com',
    secret: SEGREDO,
  });
  const depois = lerMfa(mfa.id);
  assert.equal(r.ok, true);
  assert.equal(r.mfa.nome, 'Novo');
  assert.equal(depois.secretCriptografado, antes.secretCriptografado);
  assert.equal(depois.iv, antes.iv);
});

test('UPDATE_MFA com novo segredo gera um IV diferente', async () => {
  const mfa = await salvar('Conta', 'site.com');
  const antes = lerMfa(mfa.id);
  await bg.rotear({
    type: 'UPDATE_MFA',
    id: mfa.id,
    nome: 'Conta',
    dominio: 'site.com',
    secret: OUTRO_SEGREDO,
  });
  const depois = lerMfa(mfa.id);
  assert.notEqual(depois.iv, antes.iv);
  assert.notEqual(depois.secretCriptografado, antes.secretCriptografado);
});

test('UPDATE_MFA com novo segredo: o código passa a bater com o novo segredo', async () => {
  const mfa = await salvar('Conta', 'site.com', SEGREDO);
  await bg.rotear({
    type: 'UPDATE_MFA',
    id: mfa.id,
    nome: 'Conta',
    dominio: 'site.com',
    secret: OUTRO_SEGREDO,
  });
  const r = await bg.rotear({ type: 'REVEAL_SECRET', id: mfa.id });
  assert.equal(r.secret, OUTRO_SEGREDO);
});

test('DELETE_MFA remove o registro', async () => {
  const mfa = await salvar('Conta', 'site.com');
  assert.equal((await bg.rotear({ type: 'LIST_MFAS' })).mfas.length, 1);
  const r = await bg.rotear({ type: 'DELETE_MFA', id: mfa.id });
  assert.equal(r.ok, true);
  assert.equal(r.removidos, 1);
  assert.equal((await bg.rotear({ type: 'LIST_MFAS' })).mfas.length, 0);
});

test('operações sensíveis exigem sessão desbloqueada', async () => {
  const mfa = await salvar('Conta', 'site.com');
  await bg.rotear({ type: 'LOCK' });
  for (const type of ['GET_CODE', 'REVEAL_SECRET', 'UPDATE_MFA', 'DELETE_MFA']) {
    const r = await bg.rotear({ type, id: mfa.id, nome: 'X', secret: SEGREDO });
    assert.equal(r.erro, 'SESSAO_BLOQUEADA', `${type} deveria exigir desbloqueio`);
  }
});
