// Camada de compatibilidade Firefox/Chrome (ver ia/27-suporte-chrome.md).
//
// O Firefox expõe o namespace de WebExtensions como `browser.*`; o Chrome expõe
// como `chrome.*`. No Chrome MV3 essas APIs (storage, runtime, tabs, scripting,
// alarms) JÁ retornam Promises, então não há nada a "promisificar": basta apontar
// `browser` para `chrome` quando só `chrome` existe.
//
// - No Firefox: `globalThis.browser` já existe → nada muda.
// - No Chrome:  só `globalThis.chrome` existe → criamos o alias `browser`.
// - Nos testes (Node): os mocks definem `browser` (ver tests/_mocks.js) e não há
//   `chrome` → este shim é no-op e não lança.
//
// Importe este módulo como PRIMEIRO import de cada ponto de entrada (background,
// popup, backup) para que o alias exista antes de qualquer uso de `browser`.
if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
  globalThis.browser = globalThis.chrome;
}
