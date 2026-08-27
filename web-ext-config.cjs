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
    'examples/**',
    'web-ext-artifacts/**',
    'package.json',
    'README.md',
    'CLAUDE.md',
    'LICENSE',
    'web-ext-config.cjs',
  ],
};
