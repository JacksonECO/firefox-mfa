// Exportação seletiva (task 31): reautenticação com a senha mestra, escolha de
// domínios e de tipos de dado, e importação de contas com a invariante de
// conta principal preservada.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarBrowserMock } from './_mocks.js';

globalThis.browser = criarBrowserMock();
const bg = await import('../src/background.js');

const MESTRA = 'senha-mestra-123';
const SEGREDO = 'JBSWY3DPEHPK3PXP';

const exportar = (extra = {}) =>
  bg.rotear({ type: 'EXPORT_DATA', senhaMestra: MESTRA, senha: 'arquivo-123', ...extra });

async function cofreDeExemplo() {
  await bg.rotear({ type: 'SAVE_MFA', nome: 'GitHub', dominio: 'github.com', secret: SEGREDO });
  await bg.rotear({ type: 'SAVE_MFA', nome: 'GitLab', dominio: 'gitlab.com', secret: SEGREDO });
  await bg.rotear({
    type: 'SAVE_CONTA',
    dominio: 'github.com',
    email: 'eu@exemplo.com',
    senha: 'senha-do-site',
  });
  await bg.rotear({
    type: 'SAVE_CONTA',
    dominio: 'gitlab.com',
    email: 'outro@exemplo.com',
    senha: 'senha-gitlab',
  });
}

beforeEach(async () => {
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: MESTRA });
});

test('exportar exige a senha mestra e a senha do arquivo', async () => {
  await cofreDeExemplo();
  assert.equal((await bg.rotear({ type: 'EXPORT_DATA', senha: 'x' })).erro, 'SENHA_MESTRA_OBRIGATORIA');
  assert.equal(
    (await bg.rotear({ type: 'EXPORT_DATA', senhaMestra: MESTRA })).erro,
    'SENHA_OBRIGATORIA',
  );
});

test('senha mestra errada bloqueia a exportação', async () => {
  await cofreDeExemplo();
  const r = await exportar({ senhaMestra: 'errada' });
  assert.deepEqual(r, { ok: false, erro: 'SENHA_MESTRA_INCORRETA' });
});

test('senha mestra errada conta no rate limiting do desbloqueio', async () => {
  await exportar({ senhaMestra: 'errada' });
  assert.equal(globalThis.browser._dados.get('mfaUnlockAttempts'), 1);
  await exportar(); // acerto zera a fricção
  assert.equal(globalThis.browser._dados.get('mfaUnlockAttempts'), 0);
});

test('sem filtro, exporta tudo', async () => {
  await cofreDeExemplo();
  const r = await exportar();
  assert.equal(r.ok, true);
  assert.deepEqual(r.exportados, { mfas: 2, contas: 2 });
});

test('exportar só as contas de um domínio', async () => {
  await cofreDeExemplo();
  const r = await exportar({
    filtro: { incluirMfas: false, incluirContas: true, incluirConfig: false, dominios: ['github.com'] },
  });
  assert.deepEqual(r.exportados, { mfas: 0, contas: 1 });

  // Confere o conteúdo importando em um cofre novo.
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'outra-mestra' });
  const imp = await bg.rotear({ type: 'IMPORT_DATA', arquivo: r.arquivo, senha: 'arquivo-123' });
  assert.equal(imp.importados, 0);
  assert.equal(imp.contasImportadas, 1);
  const contas = await bg.rotear({ type: 'LIST_CONTAS' });
  assert.equal(contas.contas.length, 1);
  assert.equal(contas.contas[0].dominio, 'github.com');
});

test('exportar só os MFAs (contas ficam de fora)', async () => {
  await cofreDeExemplo();
  const r = await exportar({ filtro: { incluirContas: false } });
  assert.deepEqual(r.exportados, { mfas: 2, contas: 0 });
  const json = JSON.stringify(r.arquivo);
  assert.ok(!json.includes('eu@exemplo.com'));
});

test('exportar sem configurações não leva ajustes no arquivo', async () => {
  await cofreDeExemplo();
  await bg.rotear({ type: 'SET_AUTOCOPY', habilitado: true });
  const r = await exportar({ filtro: { incluirConfig: false } });

  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'outra-mestra' });
  const imp = await bg.rotear({
    type: 'IMPORT_DATA',
    arquivo: r.arquivo,
    senha: 'arquivo-123',
    importarConfig: true,
  });
  assert.equal(imp.configImportada, false);
  assert.equal((await bg.rotear({ type: 'GET_CONFIG' })).autocopiar, false);
});

test('round-trip completo preserva e-mail, senha e rótulo da conta', async () => {
  await bg.rotear({
    type: 'SAVE_CONTA',
    dominio: 'github.com',
    rotulo: 'Trabalho',
    email: 'eu@exemplo.com',
    senha: 'senha-do-site',
  });
  const r = await exportar();

  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'outra-mestra' });
  await bg.rotear({ type: 'IMPORT_DATA', arquivo: r.arquivo, senha: 'arquivo-123' });

  const { contas } = await bg.rotear({ type: 'LIST_CONTAS' });
  assert.equal(contas[0].rotulo, 'Trabalho');
  assert.equal(contas[0].principal, true, 'primeira conta do domínio vira principal');
  const revelada = await bg.rotear({ type: 'REVEAL_CONTA', id: contas[0].id });
  assert.deepEqual(revelada, { ok: true, email: 'eu@exemplo.com', senha: 'senha-do-site' });

  // E o arquivo continua sem nada em claro.
  assert.ok(!JSON.stringify(r.arquivo).includes('senha-do-site'));
});

test('importar não rouba a conta principal de um domínio que já tem uma', async () => {
  await bg.rotear({
    type: 'SAVE_CONTA',
    dominio: 'github.com',
    email: 'importada@exemplo.com',
    senha: 'senha-1',
  });
  const r = await exportar();

  // Cofre novo com uma conta local já marcada como principal no mesmo domínio.
  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'outra-mestra' });
  const local = await bg.rotear({
    type: 'SAVE_CONTA',
    dominio: 'github.com',
    email: 'local@exemplo.com',
    senha: 'senha-2',
  });
  await bg.rotear({ type: 'IMPORT_DATA', arquivo: r.arquivo, senha: 'arquivo-123' });

  const { contas } = await bg.rotear({ type: 'LIST_CONTAS', dominio: 'github.com' });
  assert.equal(contas.length, 2);
  assert.equal(contas.filter((c) => c.principal).length, 1);
  assert.equal(contas.find((c) => c.principal).id, local.conta.id);
});

test('conta de localhost sem cripto só continua em claro se ainda for localhost', async () => {
  await bg.rotear({
    type: 'SAVE_CONTA',
    dominio: 'localhost',
    email: 'dev@local',
    senha: 'senha-dev',
    semCriptografia: true,
  });
  const r = await exportar();

  globalThis.browser = criarBrowserMock();
  await bg.rotear({ type: 'SET_MASTER_PASSWORD', senha: 'outra-mestra' });
  await bg.rotear({ type: 'IMPORT_DATA', arquivo: r.arquivo, senha: 'arquivo-123' });
  const { contas } = await bg.rotear({ type: 'LIST_CONTAS' });
  assert.equal(contas[0].semCriptografia, true);
});

test('EXPORT_RESUMO lista domínios e contagens, sem decifrar nada', async () => {
  await cofreDeExemplo();
  await bg.rotear({ type: 'SAVE_MFA', nome: 'Solto', dominio: '', secret: SEGREDO });
  const r = await bg.rotear({ type: 'EXPORT_RESUMO' });
  assert.equal(r.ok, true);
  const porDominio = Object.fromEntries(r.dominios.map((d) => [String(d.dominio), d]));
  assert.deepEqual(porDominio['github.com'], { dominio: 'github.com', mfas: 1, contas: 1 });
  assert.deepEqual(porDominio['null'], { dominio: null, mfas: 1, contas: 0 });
});

test('exportar e ver o resumo exigem sessão', async () => {
  await cofreDeExemplo();
  await bg.rotear({ type: 'LOCK' });
  assert.equal((await exportar()).erro, 'SESSAO_BLOQUEADA');
  assert.equal((await bg.rotear({ type: 'EXPORT_RESUMO' })).erro, 'SESSAO_BLOQUEADA');
});

test('IMPORT_DATA normaliza domínio com grafia divergente (não fica órfão)', async () => {
  // Simula um arquivo de backup montado à mão (ou por um formato de terceiros),
  // que não passou pela normalização de SAVE_MFA/SAVE_CONTA — exatamente o
  // caminho que IMPORT_DATA precisa cobrir sozinho, sem depender do storage.
  const { exportarDados } = await import('../src/backup.js');
  const arquivo = await exportarDados(
    {
      mfas: [{ nome: 'GitHub', dominio: ' GitHub.COM ', secret: SEGREDO }],
      contas: [
        {
          dominio: 'GitHub.COM',
          email: 'eu@exemplo.com',
          senha: 'senha-do-site',
          principal: true,
        },
      ],
    },
    'arquivo-123',
  );

  const imp = await bg.rotear({ type: 'IMPORT_DATA', arquivo, senha: 'arquivo-123' });
  assert.equal(imp.importados, 1);
  assert.equal(imp.contasImportadas, 1);

  // Encontrável pelo filtro exato em minúsculo — a comparação de domínio do
  // produto inteiro é exata (extrairDominioDaAba também devolve minúsculo).
  const mfas = await bg.rotear({ type: 'LIST_MFAS' });
  assert.equal(mfas.mfas[0].dominio, 'github.com');
  const contas = await bg.rotear({ type: 'LIST_CONTAS', dominio: 'github.com' });
  assert.equal(contas.contas.length, 1);
  assert.equal(contas.contas[0].dominio, 'github.com');
});

test('EXPORT_DATA recusa seleção de domínios vazia (não gera um arquivo vazio)', async () => {
  await cofreDeExemplo();
  const r = await exportar({ filtro: { dominios: [] } });
  assert.deepEqual(r, { ok: false, erro: 'NENHUM_SITE_SELECIONADO' });
});

test('EXPORT_DATA com dominios:null (todos) continua funcionando normalmente', async () => {
  await cofreDeExemplo();
  const r = await exportar({ filtro: { dominios: null } });
  assert.equal(r.ok, true);
});

// Regressão do code review (rodada 1): cofre vazio não é o mesmo que o
// usuário ter desmarcado tudo. Sem nenhum domínio para marcar, o popup manda
// `dominios: null` (não `[]`) — e isso deve exportar normalmente (vazio), em
// vez de cair no NENHUM_SITE_SELECIONADO que é para seleção explícita.
test('EXPORT_DATA com cofre vazio e dominios:null exporta vazio, sem exigir seleção', async () => {
  const r = await exportar({ filtro: { dominios: null, incluirMfas: true, incluirContas: true } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.exportados, { mfas: 0, contas: 0 });
});

test('EXPORT_DATA devolve um código estável, nunca a mensagem interna da exceção', async () => {
  await bg.rotear({ type: 'SAVE_MFA', nome: 'GitHub', dominio: 'github.com', secret: SEGREDO });
  // Corrompe o IV do registro salvo: força `lerSegredo`/decrypt a falhar,
  // simulando um dado corrompido no storage.
  const mfas = globalThis.browser._dados.get('mfaItems');
  mfas[0].iv = 'aWQtaW52YWxpZG8='; // base64 válido, mas não é o IV certo
  globalThis.browser._dados.set('mfaItems', mfas);

  const r = await exportar();
  assert.equal(r.ok, false);
  assert.equal(r.erro, 'FALHA_EXPORTACAO');
});
