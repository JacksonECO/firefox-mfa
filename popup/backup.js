// Página de backup (task 20), aberta em uma aba para que o seletor de arquivos
// não destrua o contexto (como acontecia no popup). Conversa com o background
// pela mesma sessão; nunca manipula a chave nem o segredo bruto.

import '../src/navegador.js'; // shim browser/chrome — deve vir antes de qualquer uso de `browser`

const $ = (id) => document.getElementById(id);
const enviar = (mensagem) => browser.runtime.sendMessage(mensagem);
const limpar = (el) => {
  el.textContent = '';
};
const dizer = (el, texto) => {
  el.textContent = texto;
};

// Domínios disponíveis para exportar, vindos do EXPORT_RESUMO (só metadados:
// nome do domínio e contagens — nada de segredo, e-mail ou senha). Guardamos o
// par {caixa, dominio} porque `null` (registro sem site) não sobrevive a um
// atributo de dataset.
let caixasDominio = [];
// true só quando o EXPORT_RESUMO falhou (comunicação/sessão) — diferente de um
// cofre genuinamente vazio, não deve liberar exportar MFAs/contas sem seleção.
let resumoIndisponivel = false;

// Diferente do popup.js, esta aba NÃO abre a porta `popup-keepalive`: essa
// porta suspende por completo a expiração por inatividade (task 21), o que faz
// sentido para o popup (destruído ao perder foco, janela de suspensão curta),
// mas não para uma aba comum, que o usuário pode deixar aberta em segundo
// plano por horas — a sessão nunca expiraria enquanto ela existisse (achado de
// segurança da rodada 1 do code review). Em vez disso, cada tecla digitada nos
// formulários já conta como atividade via PING abaixo, o que é suficiente para
// não expirar no meio do preenchimento da exportação sem desligar o timeout.

// Mesmo throttle de popup.js: conta como atividade sem virar 1 mensagem/tecla.
let ultimoPingAtividade = 0;
function registrarAtividadeDigitando() {
  const agora = Date.now();
  if (agora - ultimoPingAtividade < 15_000) return;
  ultimoPingAtividade = agora;
  enviar({ type: 'PING' }).catch(() => {});
}

async function iniciar() {
  $('form-exportar').addEventListener('submit', aoExportar);
  $('form-exportar').addEventListener('input', registrarAtividadeDigitando);
  $('form-importar').addEventListener('submit', aoImportar);
  $('form-importar').addEventListener('input', registrarAtividadeDigitando);
  $('exportar-todos').addEventListener('click', alternarTodosDominios);

  let desbloqueado = false;
  try {
    ({ desbloqueado } = await enviar({ type: 'SESSION_STATUS' }));
  } catch {
    /* background indisponível */
  }
  $('bloqueado-aviso').hidden = desbloqueado;
  $('backup-conteudo').hidden = !desbloqueado;
  if (desbloqueado) await carregarDominios();
}

async function carregarDominios() {
  const resp = await enviar({ type: 'EXPORT_RESUMO' }).catch(() => null);
  resumoIndisponivel = resp?.ok !== true;
  const dominios = resumoIndisponivel ? [] : resp.dominios;
  caixasDominio = [];
  const container = $('exportar-dominios');
  container.replaceChildren();

  if (dominios.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'config__ajuda';
    // Distingue "não consegui carregar" de "não há nada": só o segundo caso
    // deve deixar exportar livremente sem nenhum site marcado (achado de code
    // review — antes os dois casos exportavam o cofre inteiro em silêncio).
    vazio.textContent = resumoIndisponivel
      ? 'Não foi possível carregar os sites. Recarregue esta página.'
      : 'Nada cadastrado ainda.';
    container.append(vazio);
    return;
  }
  // Ordem estável: por domínio, com os "sem site" no fim.
  const ordenados = [...dominios].sort((a, b) => {
    if (a.dominio === null) return 1;
    if (b.dominio === null) return -1;
    return a.dominio.localeCompare(b.dominio, 'pt', { sensitivity: 'base' });
  });
  for (const item of ordenados) container.append(criarLinhaDominio(item));
}

// `dominio` é texto do usuário: sempre via textContent, nunca innerHTML.
function criarLinhaDominio({ dominio, mfas, contas }) {
  const linha = document.createElement('label');
  linha.className = 'dominio-linha';

  const caixa = document.createElement('input');
  caixa.type = 'checkbox';
  caixa.checked = true;
  caixasDominio.push({ caixa, dominio });

  const nome = document.createElement('span');
  nome.className = 'dominio-linha__nome';
  nome.textContent = dominio ?? '(sem site definido)';

  const contagem = document.createElement('span');
  contagem.className = 'dominio-linha__contagem';
  const partes = [];
  if (mfas > 0) partes.push(`${mfas} MFA`);
  if (contas > 0) partes.push(`${contas} conta(s)`);
  contagem.textContent = partes.join(' · ');

  linha.append(caixa, nome, contagem);
  return linha;
}

function alternarTodosDominios() {
  const marcarTodos = caixasDominio.some(({ caixa }) => !caixa.checked);
  for (const { caixa } of caixasDominio) caixa.checked = marcarTodos;
}

async function aoExportar(evento) {
  evento.preventDefault();
  const erro = $('exportar-erro');
  const status = $('exportar-status');
  limpar(erro);
  limpar(status);

  const senhaMestra = $('exportar-mestra').value;
  const senha = $('exportar-senha').value;
  const incluirMfas = $('exportar-mfas').checked;
  const incluirContas = $('exportar-contas').checked;
  const incluirConfig = $('exportar-config').checked;

  if (!incluirMfas && !incluirContas && !incluirConfig) {
    dizer(erro, 'Escolha ao menos um tipo de dado para exportar.');
    return;
  }
  if (senhaMestra === '') {
    dizer(erro, 'Informe a senha mestra para confirmar a exportação.');
    return;
  }
  if (senha === '') {
    dizer(erro, 'Informe uma senha de exportação.');
    return;
  }

  if (resumoIndisponivel) {
    dizer(erro, 'Não foi possível carregar os sites. Recarregue esta página e tente de novo.');
    return;
  }

  // Cofre vazio (nada para marcar) não é o mesmo que o usuário ter desmarcado
  // tudo: `null` diz ao background "sem filtro de site" (não há nenhum para
  // filtrar), enquanto `[]` é uma seleção explicitamente vazia — só a segunda
  // deve travar a exportação de MFAs/contas.
  const dominios =
    caixasDominio.length === 0
      ? null
      : caixasDominio.filter(({ caixa }) => caixa.checked).map(({ dominio }) => dominio);
  if (Array.isArray(dominios) && dominios.length === 0 && (incluirMfas || incluirContas)) {
    dizer(erro, 'Selecione ao menos um site.');
    return;
  }

  const resp = await enviar({
    type: 'EXPORT_DATA',
    senhaMestra,
    senha,
    filtro: { incluirMfas, incluirContas, incluirConfig, dominios },
  });
  if (!resp?.ok) {
    // Em caso de erro (senha mestra incorreta, sessão expirada), preserva o
    // que foi digitado — não faz sentido obrigar a redigitar as duas senhas.
    dizer(erro, mensagemDeErroDeExportacao(resp?.erro));
    if (resp?.erro === 'SESSAO_BLOQUEADA') mostrarBloqueado();
    return;
  }
  $('exportar-mestra').value = '';
  $('exportar-senha').value = '';
  baixarJson(resp.arquivo, 'firefox-mfa-backup.json');
  const { mfas = 0, contas = 0 } = resp.exportados ?? {};
  dizer(status, `Backup baixado: ${mfas} MFA(s) e ${contas} conta(s).`);
}

function mensagemDeErroDeExportacao(codigo) {
  if (codigo === 'SESSAO_BLOQUEADA') return 'Sessão expirada. Desbloqueie pela extensão.';
  if (codigo === 'SENHA_MESTRA_INCORRETA') return 'Senha mestra incorreta.';
  if (codigo === 'NENHUM_SITE_SELECIONADO') return 'Selecione ao menos um site.';
  return 'Falha ao exportar.';
}

function baixarJson(objeto, nomeArquivo) {
  const blob = new Blob([JSON.stringify(objeto)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

async function aoImportar(evento) {
  evento.preventDefault();
  const erro = $('importar-erro');
  const status = $('importar-status');
  limpar(erro);
  limpar(status);

  const arquivoInput = $('importar-arquivo');
  const senha = $('importar-senha').value;
  if (!arquivoInput.files || arquivoInput.files.length === 0) {
    dizer(erro, 'Selecione um arquivo de backup.');
    return;
  }
  if (senha === '') {
    dizer(erro, 'Informe a senha de exportação.');
    return;
  }

  let arquivo;
  try {
    arquivo = JSON.parse(await arquivoInput.files[0].text());
  } catch {
    dizer(erro, 'Arquivo inválido (não é um JSON válido).');
    return;
  }

  const resp = await enviar({
    type: 'IMPORT_DATA',
    arquivo,
    senha,
    importarConfig: $('importar-config').checked,
  });
  $('importar-senha').value = '';
  if (resp?.ok) {
    const extra = resp.configImportada ? ' Configurações aplicadas.' : '';
    dizer(
      status,
      `Importado(s) ${resp.importados} MFA(s) e ${resp.contasImportadas ?? 0} conta(s).${extra}`,
    );
    await carregarDominios();
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(erro, 'Sessão expirada. Desbloqueie pela extensão.');
    mostrarBloqueado();
  } else {
    dizer(erro, 'Senha incorreta ou arquivo inválido.');
  }
}

// A sessão pode expirar com esta aba aberta (ela não mantém mais a sessão viva
// sozinha — ver o comentário no topo do arquivo). Quando isso acontece no meio
// de uma exportação/importação, mostra o mesmo aviso completo da carga inicial
// em vez de só a frase de erro no formulário.
function mostrarBloqueado() {
  $('bloqueado-aviso').hidden = false;
  $('backup-conteudo').hidden = true;
}

iniciar();
