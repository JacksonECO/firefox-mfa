import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportarDados, importarDados } from '../src/backup.js';

const REGISTROS = [
  { nome: 'GitHub', dominio: 'github.com', secret: 'JBSWY3DPEHPK3PXP' },
  { nome: 'Sem domínio', dominio: null, secret: 'GEZDGNBVGY3TQOJQ' },
];

test('round-trip: exportar e importar com a senha correta devolve os mesmos dados', async () => {
  const arquivo = await exportarDados(REGISTROS, 'senha-de-export');
  const volta = await importarDados(arquivo, 'senha-de-export');
  assert.deepEqual(volta, REGISTROS);
});

test('o arquivo exportado não contém segredo nem domínio em claro', async () => {
  const arquivo = await exportarDados(REGISTROS, 'senha-de-export');
  const json = JSON.stringify(arquivo);
  assert.ok(!json.includes('JBSWY3DPEHPK3PXP'));
  assert.ok(!json.includes('GEZDGNBVGY3TQOJQ'));
  assert.ok(!json.includes('github.com'));
  assert.equal(arquivo.formato, 'firefox-mfa-export');
});

test('importar com senha errada falha claramente, sem expor dados', async () => {
  const arquivo = await exportarDados(REGISTROS, 'senha-certa');
  await assert.rejects(() => importarDados(arquivo, 'senha-errada'), /incorreta/);
});

test('arquivo inválido é rejeitado', async () => {
  await assert.rejects(() => importarDados({ formato: 'outro' }, 'x'));
  await assert.rejects(() => importarDados(null, 'x'));
});

test('senha de exportação vazia é rejeitada', async () => {
  await assert.rejects(() => exportarDados(REGISTROS, ''));
});
