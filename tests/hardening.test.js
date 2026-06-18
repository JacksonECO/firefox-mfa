// Auditoria estática de hardening (ver ia/12). Falha o build se alguém
// reintroduzir innerHTML/eval, uma permissão ampla, log de console, ou uma
// dependência via rede.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function arquivosFonte() {
  const arquivos = [];
  for (const dir of ['src', 'popup']) {
    for (const nome of readdirSync(join(RAIZ, dir))) {
      if (/\.(js|html|css)$/.test(nome)) arquivos.push(join(RAIZ, dir, nome));
    }
  }
  return arquivos;
}

test('manifest: permissões exatamente as esperadas (menor privilégio)', () => {
  const manifest = JSON.parse(readFileSync(join(RAIZ, 'manifest.json'), 'utf8'));
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ['activeTab', 'alarms', 'clipboardWrite', 'storage'],
  );
});

test('manifest: CSP explícita (script-src/object-src self)', () => {
  const manifest = JSON.parse(readFileSync(join(RAIZ, 'manifest.json'), 'utf8'));
  const csp = manifest.content_security_policy?.extension_pages ?? '';
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'self'/);
});

test('nenhum uso de .innerHTML/.outerHTML/eval/new Function no código', () => {
  // Casa o USO real (acesso de propriedade `.innerHTML`), não a palavra em
  // comentários que justamente dizem "nunca innerHTML".
  for (const arquivo of arquivosFonte()) {
    const texto = readFileSync(arquivo, 'utf8');
    assert.ok(!/\.\s*innerHTML/.test(texto), `.innerHTML em ${arquivo}`);
    assert.ok(!/\.\s*outerHTML/.test(texto), `.outerHTML em ${arquivo}`);
    assert.ok(!/\beval\s*\(/.test(texto), `eval() em ${arquivo}`);
    assert.ok(!/new Function/.test(texto), `new Function em ${arquivo}`);
  }
});

test('nenhum console.* no código de produção (sem log de segredo)', () => {
  for (const arquivo of arquivosFonte()) {
    if (!arquivo.endsWith('.js')) continue;
    const texto = readFileSync(arquivo, 'utf8');
    assert.ok(!/console\.(log|debug|info|warn|error)/.test(texto), `console em ${arquivo}`);
  }
});

test('nenhuma URL http(s) no código (offline-first, sem CDN)', () => {
  for (const arquivo of arquivosFonte()) {
    const texto = readFileSync(arquivo, 'utf8');
    assert.ok(!/https?:\/\//.test(texto), `URL externa em ${arquivo}`);
  }
});
