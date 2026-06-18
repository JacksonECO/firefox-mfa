import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import * as cripto from '../src/crypto.js';

// `browser` precisa existir antes de o módulo ser usado; storage.js lê o global
// de forma tardia, então basta definir aqui e renovar a cada teste.
globalThis.browser = criarBrowserMock();
const storage = await import('../src/storage.js');

// Uma chave real reutilizada nos testes de MFA (derivar é caro; basta uma).
const CHAVE = await cripto.derivarChave('chave-de-teste', cripto.gerarBytesAleatorios(16));
const SEGREDO = 'JBSWY3DPEHPK3PXP';

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
});

test('estaInicializado é false em storage vazio', async () => {
  assert.equal(await storage.estaInicializado(), false);
});

test('persiste e lê salt (round-trip de bytes)', async () => {
  const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  await storage.salvarSalt(salt);
  const lido = await storage.obterSalt();
  assert.deepEqual([...lido], [...salt]);
});

test('persiste e lê o valor de controle', async () => {
  await storage.salvarValorControle({ ciphertext: 'abc', iv: 'def' });
  assert.deepEqual(await storage.obterValorControle(), { ciphertext: 'abc', iv: 'def' });
});

test('estaInicializado vira true só com salt E valor de controle', async () => {
  await storage.salvarSalt(new Uint8Array(16));
  assert.equal(await storage.estaInicializado(), false); // só salt ainda não basta
  await storage.salvarValorControle({ ciphertext: 'a', iv: 'b' });
  assert.equal(await storage.estaInicializado(), true);
});

test('o salt é gravado em base64, nunca como bytes crus', async () => {
  await storage.salvarSalt(new Uint8Array([255, 0, 128]));
  const cru = globalThis.browser._dados.get('cryptoSalt');
  assert.equal(typeof cru, 'string'); // armazenado como string base64
});

/* ------------------------------ MFAs (task 03) ------------------------------ */

test('salvarMfa persiste o segredo criptografado, nunca em claro', async () => {
  const reg = await storage.salvarMfa(
    { nome: 'GitHub', dominio: 'github.com', secretEmClaro: SEGREDO },
    CHAVE,
  );
  assert.ok(reg.id);
  assert.equal(reg.nome, 'GitHub');
  assert.equal(reg.dominio, 'github.com');
  assert.equal(typeof reg.secretCriptografado, 'string');
  assert.notEqual(reg.secretCriptografado, SEGREDO);

  // nada em claro no storage, e nenhum campo secretEmClaro vazado
  const cru = JSON.stringify([...globalThis.browser._dados.values()]);
  assert.ok(!cru.includes(SEGREDO), 'segredo em claro não pode estar no storage');
  assert.ok(!cru.includes('secretEmClaro'));
});

test('listarMfas e listarMfasPorDominio (inclui domínio null)', async () => {
  await storage.salvarMfa({ nome: 'A', dominio: 'a.com', secretEmClaro: SEGREDO }, CHAVE);
  await storage.salvarMfa({ nome: 'B', dominio: 'b.com', secretEmClaro: SEGREDO }, CHAVE);
  await storage.salvarMfa({ nome: 'Sem', dominio: null, secretEmClaro: SEGREDO }, CHAVE);

  assert.equal((await storage.listarMfas()).length, 3);

  const soA = await storage.listarMfasPorDominio('a.com');
  assert.equal(soA.length, 1);
  assert.equal(soA[0].nome, 'A');

  const semDominio = await storage.listarMfasPorDominio(null);
  assert.equal(semDominio.length, 1);
  assert.equal(semDominio[0].nome, 'Sem');
});

test('salvarMfa exige nome e segredo', async () => {
  await assert.rejects(
    () => storage.salvarMfa({ nome: '   ', dominio: null, secretEmClaro: SEGREDO }, CHAVE),
    /obrigatório/,
  );
  await assert.rejects(
    () => storage.salvarMfa({ nome: 'X', dominio: null, secretEmClaro: '' }, CHAVE),
    /Segredo/,
  );
});

test('atualizarMfa altera campos e atualiza updatedAt', async () => {
  const reg = await storage.salvarMfa(
    { nome: 'Velho', dominio: 'x.com', secretEmClaro: SEGREDO },
    CHAVE,
  );
  const upd = await storage.atualizarMfa(reg.id, { nome: 'Novo' });
  assert.equal(upd.nome, 'Novo');
  assert.equal(upd.dominio, 'x.com'); // campo não tocado permanece
  assert.ok(upd.updatedAt >= reg.updatedAt);
  assert.equal((await storage.listarMfas())[0].nome, 'Novo');
});

test('atualizarMfa de id inexistente retorna null (sem lançar)', async () => {
  assert.equal(await storage.atualizarMfa('nao-existe', { nome: 'x' }), null);
});

test('atualizarMfa rejeita segredo em claro', async () => {
  const reg = await storage.salvarMfa(
    { nome: 'X', dominio: null, secretEmClaro: SEGREDO },
    CHAVE,
  );
  await assert.rejects(
    () => storage.atualizarMfa(reg.id, { secretEmClaro: 'NOVO' }),
    /não aceita segredo em claro/,
  );
});

test('removerMfa remove por id; id inexistente é no-op', async () => {
  const reg = await storage.salvarMfa(
    { nome: 'X', dominio: null, secretEmClaro: SEGREDO },
    CHAVE,
  );
  assert.equal(await storage.removerMfa('nao-existe'), 0);
  assert.equal((await storage.listarMfas()).length, 1);
  assert.equal(await storage.removerMfa(reg.id), 1);
  assert.equal((await storage.listarMfas()).length, 0);
});

test('salvarMfa grava schemaVersion = 1', async () => {
  assert.equal(await storage.obterSchemaVersion(), null);
  await storage.salvarMfa({ nome: 'X', dominio: null, secretEmClaro: SEGREDO }, CHAVE);
  assert.equal(await storage.obterSchemaVersion(), 1);
});
