// Testa a paridade entre manifest.json (Firefox) e manifest.chrome.json (Chrome).
//
// As duas divergências legítimas são `background` (scripts vs. service_worker) e
// `icons`/`browser_specific_settings` (SVG no Firefox, PNGs no Chrome); tudo o mais
// — versão, descrição, permissões, CSP — deve ser idêntico. Sem isso, um manifesto
// pode ficar desatualizado em silêncio (foi o que aconteceu após o merge da task 27
// com as tasks 28-32: o Chrome ficou preso na versão/descrição antigas).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const firefox = JSON.parse(readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
const chrome = JSON.parse(readFileSync(path.join(RAIZ, 'manifest.chrome.json'), 'utf8'));

const PERMISSOES_ESPERADAS = ['storage', 'alarms', 'activeTab', 'clipboardWrite', 'scripting'];

test('campos compartilhados são idênticos nos dois manifestos', () => {
  for (const campo of ['manifest_version', 'name', 'version', 'description', 'author']) {
    assert.equal(chrome[campo], firefox[campo], `campo "${campo}" divergente entre os manifestos`);
  }
  assert.deepEqual(chrome.action?.default_title, firefox.action?.default_title);
  assert.deepEqual(chrome.action?.default_popup, firefox.action?.default_popup);
  assert.deepEqual(chrome.content_security_policy, firefox.content_security_policy);
  assert.equal(chrome.background?.type, firefox.background?.type);
});

test('permissões: mesmo conjunto nos dois, e exatamente o mínimo previsto (CLAUDE.md)', () => {
  assert.deepEqual([...firefox.permissions].sort(), [...PERMISSOES_ESPERADAS].sort());
  assert.deepEqual([...chrome.permissions].sort(), [...PERMISSOES_ESPERADAS].sort());
  assert.equal(firefox.host_permissions, undefined, 'Firefox não deve ter host_permissions');
  assert.equal(chrome.host_permissions, undefined, 'Chrome não deve ter host_permissions');
});

test('background: Firefox usa event page (scripts), Chrome usa service_worker', () => {
  assert.deepEqual(firefox.background?.scripts, ['src/background.js']);
  assert.equal(firefox.background?.service_worker, undefined);

  assert.equal(chrome.background?.service_worker, 'src/background.js');
  assert.equal(chrome.background?.scripts, undefined);
});

test('só o Firefox declara browser_specific_settings', () => {
  assert.ok(firefox.browser_specific_settings?.gecko?.id, 'Firefox deve ter o id do gecko');
  assert.equal(chrome.browser_specific_settings, undefined);
});

test('ícones: Firefox aponta para o SVG; Chrome aponta para PNGs existentes em disco', () => {
  for (const tamanho of Object.values(firefox.icons ?? {})) {
    assert.match(tamanho, /\.svg$/, 'ícone do Firefox deve ser SVG');
  }
  const tamanhosChrome = [
    ...Object.values(chrome.icons ?? {}),
    ...Object.values(chrome.action?.default_icon ?? {}),
  ];
  assert.ok(tamanhosChrome.length > 0, 'Chrome deve declarar ao menos um ícone');
  for (const caminho of tamanhosChrome) {
    assert.match(caminho, /\.png$/, 'ícone do Chrome deve ser PNG');
    assert.ok(existsSync(path.join(RAIZ, caminho)), `ícone referenciado não existe em disco: ${caminho}`);
  }
});
