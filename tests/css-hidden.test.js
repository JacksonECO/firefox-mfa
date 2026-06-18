// Regressão da task 19: o atributo `hidden` precisa SEMPRE esconder o elemento.
// Sem a regra global `[hidden] { display: none !important }`, componentes que
// definem `display` (ex: .dialog, .card__feedback) ficam presos visíveis — foi
// o que prendeu o usuário no diálogo de exclusão sobre a tela de criar senha.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(RAIZ, 'popup', 'popup.css'), 'utf8');

test('popup.css força [hidden] a esconder com !important', () => {
  assert.match(css, /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/i);
});

test('componentes de overlay que definem display continuam existindo (teste relevante)', () => {
  // Se estes deixarem de usar display:flex, o teste acima perde o sentido —
  // mantemos a checagem para documentar por que a regra global é necessária.
  assert.match(css, /\.dialog\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.card__feedback\s*\{[^}]*display:\s*flex/);
});
