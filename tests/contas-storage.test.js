// Camada de storage das contas do site (e-mail + senha por domínio, task 30).
// Cobre a cifragem em repouso, a invariante de 1 conta principal por domínio e
// a exceção de localhost sem criptografia.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';
import * as cripto from '../src/crypto.js';

globalThis.browser = criarBrowserMock();
const storage = await import('../src/storage.js');

const CHAVE = await cripto.derivarChave('chave-de-teste', cripto.gerarBytesAleatorios(16));

beforeEach(() => {
  globalThis.browser = criarBrowserMock();
});

const conta = (extra = {}) => ({
  dominio: 'github.com',
  email: 'eu@exemplo.com',
  senha: 'senha-do-site',
  ...extra,
});

test('salva cifrado: nem e-mail nem senha vão em claro para o storage', async () => {
  await storage.salvarConta(conta(), CHAVE);
  const bruto = JSON.stringify(globalThis.browser._dados.get('credItems'));
  assert.ok(!bruto.includes('eu@exemplo.com'), 'e-mail em claro no storage');
  assert.ok(!bruto.includes('senha-do-site'), 'senha em claro no storage');
  assert.ok(bruto.includes('github.com'), 'domínio é metadado não sensível');
});

test('e-mail e senha usam IVs diferentes (nunca reusar IV com a mesma chave)', async () => {
  const salva = await storage.salvarConta(conta(), CHAVE);
  assert.notEqual(salva.ivEmail, salva.ivSenha);
  const outra = await storage.salvarConta(conta({ email: 'b@x.com' }), CHAVE);
  assert.notEqual(salva.ivEmail, outra.ivEmail);
});

test('round-trip: decifra e-mail e senha com a mesma chave', async () => {
  const salva = await storage.salvarConta(conta(), CHAVE);
  assert.equal(
    await cripto.descriptografar(salva.emailCriptografado, salva.ivEmail, CHAVE),
    'eu@exemplo.com',
  );
  assert.equal(
    await cripto.descriptografar(salva.senhaCriptografada, salva.ivSenha, CHAVE),
    'senha-do-site',
  );
});

test('campos obrigatórios: domínio, e-mail e senha', async () => {
  await assert.rejects(() => storage.salvarConta(conta({ dominio: '  ' }), CHAVE), /domínio/i);
  await assert.rejects(() => storage.salvarConta(conta({ email: '' }), CHAVE), /mail/i);
  await assert.rejects(() => storage.salvarConta(conta({ senha: '' }), CHAVE), /senha/i);
});

test('primeira conta do domínio nasce principal', async () => {
  const primeira = await storage.salvarConta(conta(), CHAVE);
  assert.equal(primeira.principal, true);
});

test('segunda conta não rouba a principal, salvo se pedir', async () => {
  await storage.salvarConta(conta(), CHAVE);
  const segunda = await storage.salvarConta(conta({ email: 'b@x.com' }), CHAVE);
  assert.equal(segunda.principal, false);

  const terceira = await storage.salvarConta(
    conta({ email: 'c@x.com', principal: true }),
    CHAVE,
  );
  assert.equal(terceira.principal, true);
  const doDominio = await storage.listarContasPorDominio('github.com');
  assert.equal(doDominio.filter((c) => c.principal).length, 1);
});

test('definirContaPrincipal troca e mantém exatamente uma por domínio', async () => {
  const a = await storage.salvarConta(conta(), CHAVE);
  const b = await storage.salvarConta(conta({ email: 'b@x.com' }), CHAVE);
  await storage.definirContaPrincipal(b.id);
  const lista = await storage.listarContasPorDominio('github.com');
  assert.equal(lista.find((c) => c.id === a.id).principal, false);
  assert.equal(lista.find((c) => c.id === b.id).principal, true);
});

test('cada domínio tem a sua principal, sem interferir no outro', async () => {
  const gh = await storage.salvarConta(conta(), CHAVE);
  const gl = await storage.salvarConta(conta({ dominio: 'gitlab.com' }), CHAVE);
  assert.equal(gh.principal, true);
  assert.equal(gl.principal, true);
});

test('excluir a principal promove a mais antiga restante', async () => {
  const a = await storage.salvarConta(conta(), CHAVE);
  const b = await storage.salvarConta(conta({ email: 'b@x.com' }), CHAVE);
  const c = await storage.salvarConta(conta({ email: 'c@x.com' }), CHAVE);
  assert.equal(await storage.removerConta(a.id), 1);
  const lista = await storage.listarContasPorDominio('github.com');
  assert.equal(lista.find((x) => x.id === b.id).principal, true);
  assert.equal(lista.find((x) => x.id === c.id).principal, false);
});

test('remover id inexistente é no-op', async () => {
  assert.equal(await storage.removerConta('nao-existe'), 0);
});

test('atualizar sem senha mantém a senha atual; com senha, recifra (novo IV)', async () => {
  const a = await storage.salvarConta(conta(), CHAVE);
  const semSenha = await storage.atualizarConta(a.id, { rotulo: 'Pessoal' }, CHAVE);
  assert.equal(semSenha.rotulo, 'Pessoal');
  assert.equal(semSenha.senhaCriptografada, a.senhaCriptografada);
  assert.equal(semSenha.ivSenha, a.ivSenha);

  const comSenha = await storage.atualizarConta(a.id, { senha: 'nova-senha' }, CHAVE);
  assert.notEqual(comSenha.ivSenha, a.ivSenha);
  assert.equal(
    await cripto.descriptografar(comSenha.senhaCriptografada, comSenha.ivSenha, CHAVE),
    'nova-senha',
  );
});

test('atualizar id inexistente devolve null', async () => {
  assert.equal(await storage.atualizarConta('nao-existe', { rotulo: 'x' }, CHAVE), null);
});

test('mudar o domínio renormaliza a principal dos dois lados', async () => {
  const a = await storage.salvarConta(conta(), CHAVE);
  const b = await storage.salvarConta(conta({ email: 'b@x.com' }), CHAVE);
  await storage.atualizarConta(a.id, { dominio: 'gitlab.com' }, CHAVE);

  const gh = await storage.listarContasPorDominio('github.com');
  const gl = await storage.listarContasPorDominio('gitlab.com');
  assert.equal(gh.length, 1);
  assert.equal(gh[0].id, b.id);
  assert.equal(gh[0].principal, true, 'a que sobrou vira principal');
  assert.equal(gl[0].principal, true, 'no destino também há uma principal');
});

test('mover a conta mais antiga para um domínio que já tem principal NÃO rouba a principal', async () => {
  // Regressão: `atualizarConta` não pode carregar `principal:true` do domínio
  // de origem para o destino quando o usuário não pediu isso explicitamente —
  // mesmo que a conta movida seja mais antiga (o desempate por idade não pode
  // se sobrepor à escolha já feita no domínio de destino).
  const antiga = await storage.salvarConta(conta({ dominio: 'foo.com' }), CHAVE);
  const principalNoDestino = await storage.salvarConta(conta({ dominio: 'bar.com' }), CHAVE);
  assert.ok(antiga.createdAt <= principalNoDestino.createdAt);

  await storage.atualizarConta(antiga.id, { dominio: 'bar.com' }, CHAVE); // sem `principal`

  const doDestino = await storage.listarContasPorDominio('bar.com');
  const movida = doDestino.find((c) => c.id === antiga.id);
  const original = doDestino.find((c) => c.id === principalNoDestino.id);
  assert.equal(movida.principal, false, 'a conta movida não deve virar principal sozinha');
  assert.equal(original.principal, true, 'a principal do destino deve continuar sendo a mesma');
});

test('mover a conta com `principal: true` explícito assume a principal do destino', async () => {
  const antiga = await storage.salvarConta(conta({ dominio: 'foo.com' }), CHAVE);
  await storage.salvarConta(conta({ dominio: 'bar.com' }), CHAVE);

  await storage.atualizarConta(antiga.id, { dominio: 'bar.com', principal: true }, CHAVE);

  const doDestino = await storage.listarContasPorDominio('bar.com');
  assert.equal(doDestino.find((c) => c.id === antiga.id).principal, true);
  assert.equal(doDestino.filter((c) => c.principal).length, 1);
});

test('contarContasPorDominio conta sem decifrar', async () => {
  await storage.salvarConta(conta(), CHAVE);
  await storage.salvarConta(conta({ email: 'b@x.com' }), CHAVE);
  await storage.salvarConta(conta({ dominio: 'gitlab.com' }), CHAVE);
  assert.deepEqual(await storage.contarContasPorDominio(), {
    'github.com': 2,
    'gitlab.com': 1,
  });
});

test('conta de localhost sem criptografia guarda em claro (exceção da task 26)', async () => {
  const local = await storage.salvarContaSemCripto(conta({ dominio: 'localhost' }));
  assert.equal(local.semCriptografia, true);
  assert.equal(local.emailEmClaro, 'eu@exemplo.com');
  assert.equal(local.senhaEmClaro, 'senha-do-site');
  assert.equal(local.emailCriptografado, undefined);
});

test('converter para criptografada descarta o texto em claro', async () => {
  const local = await storage.salvarContaSemCripto(conta({ dominio: 'localhost' }));
  const convertida = await storage.converterContaParaCriptografada(
    local.id,
    { dominio: 'exemplo.com' },
    CHAVE,
  );
  assert.equal(convertida.semCriptografia, undefined);
  assert.equal(convertida.emailEmClaro, undefined);
  assert.equal(convertida.senhaEmClaro, undefined);
  assert.equal(
    await cripto.descriptografar(convertida.senhaCriptografada, convertida.ivSenha, CHAVE),
    'senha-do-site',
  );
  assert.equal(convertida.createdAt, local.createdAt);
});

test('rótulo com markup é preservado como texto (defesa é na renderização)', async () => {
  const salva = await storage.salvarConta(conta({ rotulo: '<script>alert(1)</script>' }), CHAVE);
  assert.equal(salva.rotulo, '<script>alert(1)</script>');
});

test('rótulo vazio vira null', async () => {
  const salva = await storage.salvarConta(conta({ rotulo: '   ' }), CHAVE);
  assert.equal(salva.rotulo, null);
});
