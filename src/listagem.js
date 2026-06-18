// Lógica pura da listagem da tela principal (ver ia/06). Decide qual conjunto
// de MFAs mostrar a partir do domínio da aba ativa e da escolha "ver todos".
// Sem estado, sem browser.* — testável isoladamente.

/** Filtra por domínio com comparação exata (inclui o caso `null`). */
export function filtrarPorDominio(todos, dominio) {
  return todos.filter((mfa) => mfa.dominio === dominio);
}

/** Ordena uma cópia da lista por `nome` (alfabético, sem diferenciar acento/caixa). */
export function ordenarPorNome(lista) {
  return [...lista].sort((a, b) =>
    String(a.nome).localeCompare(String(b.nome), 'pt', { sensitivity: 'base' }),
  );
}

/**
 * Decide o que renderizar.
 *  - `vazio`          → não há nenhum MFA cadastrado.
 *  - `todos`          → o usuário pediu "ver todos" (ou não há domínio atual).
 *  - `dominio`        → há MFAs para o domínio atual; mostra só eles.
 *  - `todos-fallback` → há MFAs, mas nenhum para o domínio atual; mostra todos.
 *
 * Os modos que listam todos saem ordenados por nome (task 15); o modo "domínio"
 * preserva a ordem original.
 *
 * @param {{todos?: Array, dominioAtual?: string|null, verTodos?: boolean}} entrada
 */
export function decidirListagem({ todos = [], dominioAtual = null, verTodos = false } = {}) {
  if (todos.length === 0) {
    return { modo: 'vazio', itens: [], dominioAtual };
  }
  if (verTodos || dominioAtual === null) {
    return { modo: 'todos', itens: ordenarPorNome(todos), dominioAtual };
  }
  const doDominio = filtrarPorDominio(todos, dominioAtual);
  if (doDominio.length === 0) {
    return { modo: 'todos-fallback', itens: ordenarPorNome(todos), dominioAtual };
  }
  return { modo: 'dominio', itens: doDominio, dominioAtual };
}
