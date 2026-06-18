// Mocks da API WebExtension para os testes (browser.storage.local, browser.alarms).
// Sem dependências externas — apenas um objeto em memória.

export function criarBrowserMock() {
  const dados = new Map();
  const alarmesCriados = [];

  return {
    _dados: dados,
    _alarmesCriados: alarmesCriados,

    storage: {
      local: {
        async get(chaves) {
          const lista =
            chaves == null ? [...dados.keys()] : Array.isArray(chaves) ? chaves : [chaves];
          const saida = {};
          for (const chave of lista) {
            if (dados.has(chave)) saida[chave] = dados.get(chave);
          }
          return saida;
        },
        async set(objeto) {
          for (const [chave, valor] of Object.entries(objeto)) dados.set(chave, valor);
        },
        async remove(chaves) {
          const lista = Array.isArray(chaves) ? chaves : [chaves];
          for (const chave of lista) dados.delete(chave);
        },
        async clear() {
          dados.clear();
        },
      },
    },

    alarms: {
      create(nome, info) {
        alarmesCriados.push({ nome, info });
      },
      clear(_nome) {
        return Promise.resolve(true);
      },
      onAlarm: { addListener() {} },
    },
  };
}
