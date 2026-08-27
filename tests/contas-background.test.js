// Mensagens das contas do site no background (task 30). O foco é o contrato de
// segurança: a senha do site nunca sai numa listagem, tudo exige sessão (exceto
// o par isolado de localhost) e `semCriptografia` só vale para localhost.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

const SENHA_MESTRA = 'senha-mestra-123';
const conta = (extra = {}) => ({
  type: 'SAVE_CONTA',
  dominio: 'github.com',
  email: 'eu@exemplo.com',
  senha: 'senha-do-site',
  ...extra,
});

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: SENHA_MESTRA });
});

test('SAVE_CONTA cifra: nada em claro no storage', async () => {
  const r = await bg.rotear(conta());
  assert.equal(r.ok, true);
  assert.equal(r.conta.email, 'eu@exemplo.com');
  assert.equal(r.conta.senha, undefined, 'a senha nunca volta ao popup');

  const cru = JSON.stringify([...globalThis.browser._dados.values()]);
  assert.ok(!cru.includes('senha-do-site'));
  assert.ok(!cru.includes('eu@exemplo.com'));
});

test('LIST_CONTAS devolve e-mail para identificar, nunca a senha', async () => {
  await bg.rotear(conta());
  const r = await bg.rotear({ type: 'LIST_CONTAS', dominio: 'github.com' });
  assert.equal(r.ok, true);
  assert.equal(r.contas.length, 1);
  assert.equal(r.contas[0].email, 'eu@exemplo.com');
  assert.equal(r.contas[0].principal, true);
  assert.ok(!('senha' in r.contas[0]));
  assert.ok(!('senhaCriptografada' in r.contas[0]));
});

test('LIST_CONTAS filtra por domínio (comparação exata) e sem filtro traz tudo', async () => {
  await bg.rotear(conta());
  await bg.rotear(conta({ dominio: 'www.github.com', email: 'outro@x.com' }));
  const exato = await bg.rotear({ type: 'LIST_CONTAS', dominio: 'GitHub.com' });
  assert.equal(exato.contas.length, 1);
  const todas = await bg.rotear({ type: 'LIST_CONTAS' });
  assert.equal(todas.contas.length, 2);
});

test('CONTAS_RESUMO conta por domínio sem expor conteúdo', async () => {
  await bg.rotear(conta());
  await bg.rotear(conta({ email: 'b@x.com' }));
  await bg.rotear(conta({ dominio: 'gitlab.com' }));
  const r = await bg.rotear({ type: 'CONTAS_RESUMO' });
  assert.deepEqual(r.porDominio, { 'github.com': 2, 'gitlab.com': 1 });
});

test('REVEAL_CONTA devolve e-mail e senha (exceção do fluxo de edição)', async () => {
  const salva = await bg.rotear(conta());
  const r = await bg.rotear({ type: 'REVEAL_CONTA', id: salva.conta.id });
  assert.deepEqual(r, { ok: true, email: 'eu@exemplo.com', senha: 'senha-do-site' });
});

test('sem sessão, nada de contas funciona', async () => {
  const salva = await bg.rotear(conta());
  await bg.rotear({ type: 'LOCK' });
  for (const msg of [
    { type: 'LIST_CONTAS' },
    { type: 'CONTAS_RESUMO' },
    { type: 'REVEAL_CONTA', id: salva.conta.id },
    conta({ email: 'novo@x.com' }),
    { type: 'UPDATE_CONTA', id: salva.conta.id, dominio: 'github.com', email: 'a@b.c' },
    { type: 'SET_CONTA_PRINCIPAL', id: salva.conta.id },
    { type: 'DELETE_CONTA', id: salva.conta.id },
  ]) {
    const r = await bg.rotear(msg);
    assert.equal(r.ok, false, `${msg.type} deveria exigir sessão`);
    assert.equal(r.erro, 'SESSAO_BLOQUEADA');
  }
});

test('validação no background não confia no popup', async () => {
  const semDominio = await bg.rotear(conta({ dominio: '' }));
  assert.equal(semDominio.ok, false);
  assert.match(semDominio.erros.dominio, /site/i);

  const semSenha = await bg.rotear(conta({ senha: '' }));
  assert.equal(semSenha.ok, false);
  assert.match(semSenha.erros.senha, /senha/i);
});

test('UPDATE_CONTA sem senha mantém a atual; com senha, troca', async () => {
  const salva = await bg.rotear(conta());
  const base = { type: 'UPDATE_CONTA', id: salva.conta.id, dominio: 'github.com' };

  const semSenha = await bg.rotear({ ...base, email: 'novo@x.com', senha: '' });
  assert.equal(semSenha.ok, true);
  let revelada = await bg.rotear({ type: 'REVEAL_CONTA', id: salva.conta.id });
  assert.deepEqual(revelada, { ok: true, email: 'novo@x.com', senha: 'senha-do-site' });

  await bg.rotear({ ...base, email: 'novo@x.com', senha: 'outra-senha' });
  revelada = await bg.rotear({ type: 'REVEAL_CONTA', id: salva.conta.id });
  assert.equal(revelada.senha, 'outra-senha');
});

test('UPDATE_CONTA de id inexistente devolve NAO_ENCONTRADO', async () => {
  const r = await bg.rotear({
    type: 'UPDATE_CONTA',
    id: 'nao-existe',
    dominio: 'github.com',
    email: 'a@b.c',
  });
  assert.equal(r.erro, 'NAO_ENCONTRADO');
});

test('SET_CONTA_PRINCIPAL move a principal e devolve a lista do domínio', async () => {
  const a = await bg.rotear(conta());
  const b = await bg.rotear(conta({ email: 'b@x.com' }));
  const r = await bg.rotear({ type: 'SET_CONTA_PRINCIPAL', id: b.conta.id });
  assert.equal(r.ok, true);
  assert.equal(r.contas.find((c) => c.id === a.conta.id).principal, false);
  assert.equal(r.contas.find((c) => c.id === b.conta.id).principal, true);
});

test('DELETE_CONTA remove e some da listagem', async () => {
  const a = await bg.rotear(conta());
  assert.deepEqual(await bg.rotear({ type: 'DELETE_CONTA', id: a.conta.id }), {
    ok: true,
    removidos: 1,
  });
  const r = await bg.rotear({ type: 'LIST_CONTAS' });
  assert.deepEqual(r.contas, []);
});

/* ------------------------------- localhost ------------------------------- */

test('conta sem criptografia só é aceita em localhost', async () => {
  const fora = await bg.rotear(conta({ semCriptografia: true }));
  assert.equal(fora.ok, false);
  assert.equal(fora.erro, 'SEM_CRIPTO_SO_LOCALHOST');

  const local = await bg.rotear(conta({ dominio: 'localhost', semCriptografia: true }));
  assert.equal(local.ok, true);
  assert.equal(local.conta.semCriptografia, true);
});

test('LIST_CONTAS_LOCALHOST devolve só as locais sem cripto, sem sessão', async () => {
  await bg.rotear(conta({ dominio: 'localhost', semCriptografia: true }));
  await bg.rotear(conta({ dominio: 'localhost', email: 'cripto@x.com' })); // criptografada
  await bg.rotear(conta({ dominio: 'github.com', semCriptografia: false }));
  await bg.rotear({ type: 'LOCK' });

  const r = await bg.rotear({ type: 'LIST_CONTAS_LOCALHOST', dominio: 'localhost' });
  assert.equal(r.ok, true);
  assert.equal(r.contas.length, 1);
  assert.equal(r.contas[0].email, 'eu@exemplo.com');
  assert.ok(!('senha' in r.contas[0]));
});

test('LIST_CONTAS_LOCALHOST recusa domínio que não é localhost', async () => {
  await bg.rotear(conta({ dominio: 'github.com' }));
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({ type: 'LIST_CONTAS_LOCALHOST', dominio: 'github.com' });
  assert.deepEqual(r.contas, []);
});

test('editar conta local para fora de localhost converte para criptografada', async () => {
  const local = await bg.rotear(conta({ dominio: 'localhost', semCriptografia: true }));
  const r = await bg.rotear({
    type: 'UPDATE_CONTA',
    id: local.conta.id,
    dominio: 'exemplo.com',
    email: 'eu@exemplo.com',
    senha: '',
  });
  assert.equal(r.ok, true);
  assert.equal(r.conta.semCriptografia, false);

  const cru = JSON.stringify([...globalThis.browser._dados.values()]);
  assert.ok(!cru.includes('senha-do-site'), 'o texto em claro deve sumir do storage');

  const revelada = await bg.rotear({ type: 'REVEAL_CONTA', id: local.conta.id });
  assert.equal(revelada.senha, 'senha-do-site');
});

test('trocar a senha mestra recifra as contas (e mantém as locais em claro)', async () => {
  const cifrada = await bg.rotear(conta());
  const local = await bg.rotear(conta({ dominio: 'localhost', semCriptografia: true }));
  const antes = globalThis.browser._dados.get('credItems').find((c) => c.id === cifrada.conta.id);

  const troca = await bg.rotear({
    type: 'CHANGE_MASTER_PASSWORD',
    senhaAtual: SENHA_MESTRA,
    senhaNova: 'nova-senha-mestra-456',
  });
  assert.equal(troca.ok, true);

  const depois = globalThis.browser._dados.get('credItems').find((c) => c.id === cifrada.conta.id);
  assert.notEqual(depois.ivSenha, antes.ivSenha, 'novo IV após recifrar');
  assert.notEqual(depois.senhaCriptografada, antes.senhaCriptografada);

  const revelada = await bg.rotear({ type: 'REVEAL_CONTA', id: cifrada.conta.id });
  assert.deepEqual(revelada, { ok: true, email: 'eu@exemplo.com', senha: 'senha-do-site' });

  const reveladaLocal = await bg.rotear({ type: 'REVEAL_CONTA', id: local.conta.id });
  assert.equal(reveladaLocal.senha, 'senha-do-site');
});
