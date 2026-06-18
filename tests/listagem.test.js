import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirListagem, filtrarPorDominio, ordenarPorNome } from '../src/listagem.js';

const a = { id: '1', nome: 'A', dominio: 'a.com' };
const b = { id: '2', nome: 'B', dominio: 'b.com' };
const semDominio = { id: '3', nome: 'C', dominio: null };

test('sem nenhum MFA → modo vazio', () => {
  const r = decidirListagem({ todos: [], dominioAtual: 'a.com' });
  assert.equal(r.modo, 'vazio');
  assert.deepEqual(r.itens, []);
});

test('verTodos → modo todos com a lista completa', () => {
  const r = decidirListagem({ todos: [a, b], dominioAtual: 'a.com', verTodos: true });
  assert.equal(r.modo, 'todos');
  assert.deepEqual(r.itens, [a, b]);
});

test('domínio com correspondência → só os do domínio', () => {
  const r = decidirListagem({ todos: [a, b], dominioAtual: 'a.com' });
  assert.equal(r.modo, 'dominio');
  assert.deepEqual(r.itens, [a]);
});

test('domínio sem correspondência → fallback automático para todos', () => {
  const r = decidirListagem({ todos: [a, b], dominioAtual: 'c.com' });
  assert.equal(r.modo, 'todos-fallback');
  assert.deepEqual(r.itens, [a, b]);
});

test('sem domínio atual (aba interna) → mostra todos', () => {
  const r = decidirListagem({ todos: [a, b], dominioAtual: null });
  assert.equal(r.modo, 'todos');
  assert.deepEqual(r.itens, [a, b]);
});

test('filtrarPorDominio inclui o caso null e é exato (subdomínio ≠ raiz)', () => {
  assert.deepEqual(filtrarPorDominio([a, semDominio], null), [semDominio]);
  const app = { id: '4', dominio: 'app.exemplo.com' };
  const raiz = { id: '5', dominio: 'exemplo.com' };
  assert.deepEqual(filtrarPorDominio([app, raiz], 'exemplo.com'), [raiz]);
});

test('ordenarPorNome ordena alfabeticamente sem mutar a entrada', () => {
  const entrada = [{ nome: 'Banco' }, { nome: 'amazon' }, { nome: 'Café' }];
  const saida = ordenarPorNome(entrada);
  assert.deepEqual(
    saida.map((m) => m.nome),
    ['amazon', 'Banco', 'Café'],
  );
  assert.equal(entrada[0].nome, 'Banco'); // original intacto
});

test('listar todos sai ordenado por nome (task 15)', () => {
  const desordenado = [
    { id: '1', nome: 'Zulip', dominio: 'z.com' },
    { id: '2', nome: 'Amazon', dominio: 'a.com' },
  ];
  const r = decidirListagem({ todos: desordenado, dominioAtual: null });
  assert.equal(r.modo, 'todos');
  assert.deepEqual(
    r.itens.map((m) => m.nome),
    ['Amazon', 'Zulip'],
  );
});
