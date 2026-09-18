// Consistência estática entre HTML e JS do popup. Sem build step e sem DOM nos
// testes, um id renomeado num lado quebraria a tela só em runtime — este teste
// pega isso na hora. Também fixa a estrutura que as telas de contas exigem.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (...partes) => readFileSync(join(RAIZ, ...partes), 'utf8');

const popupHtml = ler('popup', 'popup.html');
const popupJs = ler('popup', 'popup.js');
const backupHtml = ler('popup', 'backup.html');
const backupJs = ler('popup', 'backup.js');

const idsDeclarados = (html) => new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const idsUsados = (js) => new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));

test('todo id usado pelo popup.js existe no popup.html', () => {
  const faltando = [...idsUsados(popupJs)].filter((id) => !idsDeclarados(popupHtml).has(id));
  assert.deepEqual(faltando, []);
});

test('todo id usado pelo backup.js existe no backup.html', () => {
  const faltando = [...idsUsados(backupJs)].filter((id) => !idsDeclarados(backupHtml).has(id));
  assert.deepEqual(faltando, []);
});

test('não há id duplicado no popup.html', () => {
  const todos = [...popupHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const duplicados = todos.filter((id, i) => todos.indexOf(id) !== i);
  assert.deepEqual(duplicados, []);
});

test('as telas de conta existem e estão na lista de views do popup.js', () => {
  for (const view of ['view-contas', 'view-conta-form']) {
    assert.ok(popupHtml.includes(`id="${view}"`), `${view} ausente no HTML`);
    assert.ok(popupJs.includes(`'${view}'`), `${view} ausente na lista VIEWS`);
  }
});

test('o switch de conta principal é um rádio (exatamente uma por domínio)', () => {
  const template = popupHtml.match(/<template id="tpl-conta">[\s\S]*?<\/template>/)?.[0] ?? '';
  assert.match(template, /class="switch__input"[^>]*type="radio"/);
  assert.match(template, /class="conta__email"/);
  assert.match(template, /class="conta__editar"/);
  // `.conta__mostrar` virou load-bearing na correção do falhaLeitura (criarLinhaConta
  // esconde o botão via essa classe) — um rename só quebraria em runtime sem isto.
  assert.match(template, /class="conta__mostrar[ "]/);
});

test('o card tem o ícone de conta salva, começando escondido', () => {
  const template = popupHtml.match(/<template id="tpl-card">[\s\S]*?<\/template>/)?.[0] ?? '';
  assert.match(template, /class="card__contas"[\s\S]*?hidden/);
});

test('campos de credencial não são oferecidos ao gerenciador do navegador', () => {
  const form = popupHtml.match(/<form id="form-conta"[\s\S]*?<\/form>/)?.[0] ?? '';
  assert.match(form, /autocomplete="off"/);
  for (const id of ['conta-email', 'conta-senha']) {
    const campo = form.match(new RegExp(`<input[^>]*id="${id}"[\\s\\S]*?/>`))?.[0] ?? '';
    assert.match(campo, /autocomplete="off"/, `${id} sem autocomplete="off"`);
  }
});

test('a senha da conta nunca é renderizada na lista (só no formulário de edição)', () => {
  const template = popupHtml.match(/<template id="tpl-conta">[\s\S]*?<\/template>/)?.[0] ?? '';
  assert.ok(!/senha/i.test(template), 'o template da lista não deve ter campo de senha');
  // REVEAL_CONTA (que devolve a senha) é enviado num ponto só: a edição.
  const envios = [...popupJs.matchAll(/type: 'REVEAL_CONTA'/g)].length;
  assert.equal(envios, 1);
});
