import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportarDados, importarDados } from '../src/backup.js';

const REGISTROS = [
  { nome: 'GitHub', dominio: 'github.com', secret: 'JBSWY3DPEHPK3PXP' },
  { nome: 'Sem domínio', dominio: null, secret: 'GEZDGNBVGY3TQOJQ' },
];

const CONFIG = { autocopiar: false, sessaoTimeoutMs: 60000 };

test('round-trip: exportar/importar devolve MFAs e configurações', async () => {
  const arquivo = await exportarDados(REGISTROS, CONFIG, 'senha-de-export');
  const volta = await importarDados(arquivo, 'senha-de-export');
  assert.deepEqual(volta.mfas, REGISTROS);
  assert.deepEqual(volta.configuracoes, CONFIG);
});

test('exportar sem configurações devolve configuracoes null', async () => {
  const arquivo = await exportarDados(REGISTROS, null, 'senha-de-export');
  const volta = await importarDados(arquivo, 'senha-de-export');
  assert.equal(volta.configuracoes, null);
  assert.deepEqual(volta.mfas, REGISTROS);
});

test('o arquivo exportado não contém segredo, domínio nem config em claro', async () => {
  const arquivo = await exportarDados(REGISTROS, CONFIG, 'senha-de-export');
  const json = JSON.stringify(arquivo);
  assert.ok(!json.includes('JBSWY3DPEHPK3PXP'));
  assert.ok(!json.includes('GEZDGNBVGY3TQOJQ'));
  assert.ok(!json.includes('github.com'));
  assert.ok(!json.includes('sessaoTimeoutMs'));
  assert.equal(arquivo.formato, 'firefox-mfa-export');
});

test('importar com senha errada falha claramente, sem expor dados', async () => {
  const arquivo = await exportarDados(REGISTROS, null, 'senha-certa');
  await assert.rejects(() => importarDados(arquivo, 'senha-errada'), /incorreta/);
});

test('arquivo inválido é rejeitado', async () => {
  await assert.rejects(() => importarDados({ formato: 'outro' }, 'x'));
  await assert.rejects(() => importarDados(null, 'x'));
});

test('senha de exportação vazia é rejeitada', async () => {
  await assert.rejects(() => exportarDados(REGISTROS, null, ''));
});
