import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportarDados,
  importarDados,
  normalizarFiltroExport,
  dominioSelecionado,
  FILTRO_PADRAO,
} from '../src/backup.js';

const MFAS = [
  { nome: 'GitHub', dominio: 'github.com', secret: 'JBSWY3DPEHPK3PXP' },
  { nome: 'Sem domínio', dominio: null, secret: 'GEZDGNBVGY3TQOJQ' },
];

const CONTAS = [
  {
    dominio: 'github.com',
    rotulo: 'Pessoal',
    email: 'eu@exemplo.com',
    senha: 'senha-do-site',
    principal: true,
    semCriptografia: false,
  },
];

const CONFIG = { autocopiar: false, sessaoTimeoutMs: 60000 };

test('round-trip: exportar/importar devolve MFAs, contas e configurações', async () => {
  const arquivo = await exportarDados(
    { mfas: MFAS, contas: CONTAS, configuracoes: CONFIG },
    'senha-de-export',
  );
  const volta = await importarDados(arquivo, 'senha-de-export');
  assert.deepEqual(volta.mfas, MFAS);
  assert.deepEqual(volta.contas, CONTAS);
  assert.deepEqual(volta.configuracoes, CONFIG);
});

test('exportar sem configurações devolve configuracoes null', async () => {
  const arquivo = await exportarDados({ mfas: MFAS }, 'senha-de-export');
  const volta = await importarDados(arquivo, 'senha-de-export');
  assert.equal(volta.configuracoes, null);
  assert.deepEqual(volta.contas, []);
  assert.deepEqual(volta.mfas, MFAS);
});

test('o arquivo exportado não contém segredo, e-mail, senha, domínio nem config em claro', async () => {
  const arquivo = await exportarDados(
    { mfas: MFAS, contas: CONTAS, configuracoes: CONFIG },
    'senha-de-export',
  );
  const json = JSON.stringify(arquivo);
  for (const segredo of [
    'JBSWY3DPEHPK3PXP',
    'GEZDGNBVGY3TQOJQ',
    'github.com',
    'eu@exemplo.com',
    'senha-do-site',
    'Pessoal',
    'sessaoTimeoutMs',
  ]) {
    assert.ok(!json.includes(segredo), `"${segredo}" vazou para o arquivo`);
  }
  assert.equal(arquivo.formato, 'firefox-mfa-export');
  assert.equal(arquivo.versao, 2);
});

test('importar com senha errada falha claramente, sem expor dados', async () => {
  const arquivo = await exportarDados({ mfas: MFAS }, 'senha-certa');
  await assert.rejects(() => importarDados(arquivo, 'senha-errada'), /incorreta/);
});

test('arquivo inválido é rejeitado', async () => {
  await assert.rejects(() => importarDados({ formato: 'outro' }, 'x'));
  await assert.rejects(() => importarDados(null, 'x'));
});

test('senha de exportação vazia é rejeitada', async () => {
  await assert.rejects(() => exportarDados({ mfas: MFAS }, ''));
});

/* ------------------------- filtro de exportação (task 31) ------------------------- */

test('filtro ausente inclui tudo de todos os domínios', () => {
  const f = normalizarFiltroExport();
  assert.deepEqual(f, { ...FILTRO_PADRAO });
  assert.equal(dominioSelecionado(f, 'github.com'), true);
  assert.equal(dominioSelecionado(f, null), true);
});

test('filtro por domínio normaliza e aceita null (registros sem site)', () => {
  const f = normalizarFiltroExport({ dominios: [' GitHub.com ', null, '  '] });
  assert.deepEqual(f.dominios, ['github.com', null, null]);
  assert.equal(dominioSelecionado(f, 'github.com'), true);
  assert.equal(dominioSelecionado(f, null), true);
  assert.equal(dominioSelecionado(f, 'gitlab.com'), false);
});

test('cada tipo de dado pode ser desmarcado isoladamente', () => {
  const f = normalizarFiltroExport({ incluirMfas: false, incluirConfig: false });
  assert.equal(f.incluirMfas, false);
  assert.equal(f.incluirContas, true);
  assert.equal(f.incluirConfig, false);
});

/* --------------------------- compatibilidade de formato --------------------------- */

test('backup v1 (sem contas) ainda importa', async () => {
  const arquivo = await exportarDados({ mfas: MFAS, configuracoes: CONFIG }, 'senha');
  delete arquivo.versao; // simula um arquivo gerado antes desta versão
  const volta = await importarDados(arquivo, 'senha');
  assert.deepEqual(volta.mfas, MFAS);
  assert.deepEqual(volta.contas, []);
  assert.deepEqual(volta.configuracoes, CONFIG);
});
