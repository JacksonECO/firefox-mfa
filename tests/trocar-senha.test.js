import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

const SEGREDO = 'JBSWY3DPEHPK3PXP';

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'senha-antiga-1' });
});

test('troca bem-sucedida: nova senha desbloqueia, antiga não; segredo íntegro', async () => {
  const save = await bg.rotear({ type: 'SAVE_MFA', nome: 'GitHub', dominio: 'g.com', secret: SEGREDO });

  const troca = await bg.rotear({
    type: 'CHANGE_MASTER_PASSWORD',
    senhaAtual: 'senha-antiga-1',
    senhaNova: 'senha-nova-2',
  });
  assert.equal(troca.ok, true);

  // segredo preservado (sessão continua aberta com a nova chave)
  const rev = await bg.rotear({ type: 'REVEAL_SECRET', id: save.mfa.id });
  assert.equal(rev.secret, SEGREDO);

  // bloqueia e testa as senhas
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await bg.rotear({ type: 'UNLOCK', senha: 'senha-antiga-1' })).ok, false);
  assert.equal((await bg.rotear({ type: 'UNLOCK', senha: 'senha-nova-2' })).ok, true);

  // e o segredo ainda decifra com a nova chave
  assert.equal((await bg.rotear({ type: 'REVEAL_SECRET', id: save.mfa.id })).secret, SEGREDO);
});

test('senha atual incorreta não altera nada', async () => {
  await bg.rotear({ type: 'SAVE_MFA', nome: 'A', dominio: null, secret: SEGREDO });
  const antes = globalThis.browser._dados.get('cryptoSalt');

  const r = await bg.rotear({
    type: 'CHANGE_MASTER_PASSWORD',
    senhaAtual: 'errada',
    senhaNova: 'senha-nova-2',
  });
  assert.equal(r.ok, false);
  assert.equal(r.erro, 'SENHA_ATUAL_INCORRETA');
  assert.equal(globalThis.browser._dados.get('cryptoSalt'), antes); // salt intacto
});

test('nova senha curta é rejeitada', async () => {
  const r = await bg.rotear({
    type: 'CHANGE_MASTER_PASSWORD',
    senhaAtual: 'senha-antiga-1',
    senhaNova: 'abc',
  });
  assert.equal(r.ok, false);
  assert.equal(r.erro, 'SENHA_NOVA_INVALIDA');
});

test('trocar senha funciona com MFA de localhost sem criptografia presente', async () => {
  // Regressão: trocarSenhaMestra não pode tentar decifrar um registro sem cripto.
  await bg.rotear({
    type: 'SAVE_MFA',
    nome: 'Local',
    dominio: 'localhost',
    secret: SEGREDO,
    semCriptografia: true,
  });
  const cripto = await bg.rotear({ type: 'SAVE_MFA', nome: 'Cripto', dominio: 'g.com', secret: SEGREDO });

  const troca = await bg.rotear({
    type: 'CHANGE_MASTER_PASSWORD',
    senhaAtual: 'senha-antiga-1',
    senhaNova: 'senha-nova-2',
  });
  assert.equal(troca.ok, true);

  // o local sem cripto continua acessível sem sessão; o criptografado segue íntegro
  await bg.rotear({ type: 'LOCK' });
  const locais = await bg.rotear({ type: 'LIST_LOCALHOST', dominio: 'localhost' });
  assert.equal(locais.mfas.length, 1);
  assert.match((await bg.rotear({ type: 'GET_CODE_LOCALHOST', id: locais.mfas[0].id })).codigo, /^\d{6}$/);

  assert.equal((await bg.rotear({ type: 'UNLOCK', senha: 'senha-nova-2' })).ok, true);
  assert.equal((await bg.rotear({ type: 'REVEAL_SECRET', id: cripto.mfa.id })).secret, SEGREDO);
});

test('CHANGE_MASTER_PASSWORD exige sessão desbloqueada', async () => {
  await bg.rotear({ type: 'LOCK' });
  const r = await bg.rotear({
    type: 'CHANGE_MASTER_PASSWORD',
    senhaAtual: 'senha-antiga-1',
    senhaNova: 'senha-nova-2',
  });
  assert.equal(r.erro, 'SESSAO_BLOQUEADA');
});
