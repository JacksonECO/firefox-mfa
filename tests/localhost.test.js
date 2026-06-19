import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

const SEGREDO = 'JBSWY3DPEHPK3PXP';

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-mestra-123' });
});

async function salvarSemCripto(dominio) {
  return bg.rotear({
    type: 'SAVE_MFA',
    nome: 'Local',
    dominio,
    secret: SEGREDO,
    semCriptografia: true,
  });
}

test('cadastrar sem criptografia só é permitido em localhost', async () => {
  const fora = await salvarSemCripto('github.com');
  assert.equal(fora.ok, false);
  assert.equal(fora.erro, 'SEM_CRIPTO_SO_LOCALHOST');

  const local = await salvarSemCripto('localhost');
  assert.equal(local.ok, true);
  assert.equal(local.mfa.semCriptografia, true);
});

test('o segredo de um MFA sem criptografia fica em claro no storage (esperado)', async () => {
  await salvarSemCripto('localhost');
  const cru = JSON.stringify([...globalThis.browser._dados.values()]);
  assert.ok(cru.includes(SEGREDO)); // é o trade-off explícito de localhost
});

test('LIST_LOCALHOST devolve só os locais sem cripto, sem sessão', async () => {
  await salvarSemCripto('localhost');
  // um MFA criptografado normal no mesmo localhost
  await bg.rotear({ type: 'SAVE_MFA', nome: 'Cripto', dominio: 'localhost', secret: SEGREDO });
  await bg.rotear({ type: 'LOCK' });

  const r = await bg.rotear({ type: 'LIST_LOCALHOST', dominio: 'localhost' });
  assert.equal(r.ok, true);
  assert.equal(r.mfas.length, 1); // só o sem-cripto
  assert.equal(r.mfas[0].nome, 'Local');
});

test('LIST_LOCALHOST não devolve nada para domínio não-localhost', async () => {
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({ type: 'LIST_LOCALHOST', dominio: 'github.com' });
  assert.deepEqual(r.mfas, []);
});

test('GET_CODE_LOCALHOST gera código sem sessão p/ local sem cripto', async () => {
  const local = await salvarSemCripto('localhost');
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({ type: 'GET_CODE_LOCALHOST', id: local.mfa.id });
  assert.equal(r.ok, true);
  assert.match(r.codigo, /^\d{6}$/);
});

test('GET_CODE_LOCALHOST recusa registro criptografado (isolamento)', async () => {
  const cripto = await bg.rotear({
    type: 'SAVE_MFA',
    nome: 'Cripto',
    dominio: 'localhost',
    secret: SEGREDO,
  });
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({ type: 'GET_CODE_LOCALHOST', id: cripto.mfa.id });
  assert.equal(r.ok, false);
  assert.equal(r.erro, 'NAO_PERMITIDO');
});

test('sem sessão, nada além do fluxo localhost funciona', async () => {
  const local = await salvarSemCripto('localhost');
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await bg.rotear({ type: 'LIST_MFAS' })).erro, 'SESSAO_BLOQUEADA');
  assert.equal((await bg.rotear({ type: 'GET_CODE', id: local.mfa.id })).erro, 'SESSAO_BLOQUEADA');
  assert.equal((await bg.rotear({ type: 'DELETE_MFA', id: local.mfa.id })).erro, 'SESSAO_BLOQUEADA');
});

test('logado, GET_CODE e REVEAL funcionam também para o sem-cripto', async () => {
  const local = await salvarSemCripto('localhost');
  assert.match((await bg.rotear({ type: 'GET_CODE', id: local.mfa.id })).codigo, /^\d{6}$/);
  assert.equal((await bg.rotear({ type: 'REVEAL_SECRET', id: local.mfa.id })).secret, SEGREDO);
});

test('editar o domínio de um sem-cripto para fora de localhost converte para criptografado', async () => {
  const local = await salvarSemCripto('localhost');

  const r = await bg.rotear({
    type: 'UPDATE_MFA',
    id: local.mfa.id,
    nome: 'Local',
    dominio: 'github.com', // deixou de ser localhost
    secret: SEGREDO,
  });
  assert.equal(r.ok, true);
  assert.equal(r.mfa.semCriptografia, false);
  assert.equal(r.mfa.dominio, 'github.com');

  // não fica mais em claro no storage
  const cru = JSON.stringify([...globalThis.browser._dados.values()]);
  assert.ok(!cru.includes(SEGREDO));

  // continua acessível normalmente (agora exige sessão, como qualquer criptografado)
  assert.match((await bg.rotear({ type: 'GET_CODE', id: local.mfa.id })).codigo, /^\d{6}$/);
  assert.equal((await bg.rotear({ type: 'REVEAL_SECRET', id: local.mfa.id })).secret, SEGREDO);

  // e o fluxo localhost sem sessão não vê mais esse registro
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await bg.rotear({ type: 'LIST_LOCALHOST', dominio: 'github.com' })).mfas.length, 0);
});

test('editar domínio mantendo localhost preserva o modo sem-cripto', async () => {
  const local = await salvarSemCripto('localhost');
  const r = await bg.rotear({
    type: 'UPDATE_MFA',
    id: local.mfa.id,
    nome: 'Local renomeado',
    dominio: 'localhost',
    secret: SEGREDO,
  });
  assert.equal(r.ok, true);
  assert.equal(r.mfa.semCriptografia, true);
});
