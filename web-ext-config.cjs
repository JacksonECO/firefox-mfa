// Configuração do web-ext (Mozilla) para lint/build.
// Espelha o scripts/empacotar.sh: só os arquivos de runtime entram no pacote.
// Sem isto, `web-ext lint` analisa o repo inteiro e acusa docs/testes/scripts
// como "arquivos sinalizados" — mesmo eles nunca indo para o .zip publicado.
module.exports = {
  ignoreFiles: [
    'ia/**',
    'tests/**',
    'scripts/**',
    'docs/**',
    'web-ext-artifacts/**',
    // Manifesto do Chrome: não entra no pacote Firefox e o web-ext (Mozilla)
    // sinalizaria seu `service_worker`. Empacotado só por `empacotar.sh chrome`.
    'manifest.chrome.json',
    'package.json',
    'README.md',
    'CLAUDE.md',
    'LICENSE',
    'web-ext-config.cjs',
  ],
};
