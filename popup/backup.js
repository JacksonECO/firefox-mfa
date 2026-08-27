// Página de backup (task 20), aberta em uma aba para que o seletor de arquivos
// não destrua o contexto (como acontecia no popup). Conversa com o background
// pela mesma sessão; nunca manipula a chave nem o segredo bruto.

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

async function iniciar() {
  $('form-exportar').addEventListener('submit', aoExportar);
  $('form-importar').addEventListener('submit', aoImportar);
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
  const dominios = resp?.ok ? resp.dominios : [];
  caixasDominio = [];
  const container = $('exportar-dominios');
  container.replaceChildren();

  if (dominios.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'config__ajuda';
    vazio.textContent = 'Nada cadastrado ainda.';
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

  const dominios = caixasDominio.filter(({ caixa }) => caixa.checked).map(({ dominio }) => dominio);
  if (caixasDominio.length > 0 && dominios.length === 0 && (incluirMfas || incluirContas)) {
    dizer(erro, 'Selecione ao menos um site.');
    return;
  }

  const resp = await enviar({
    type: 'EXPORT_DATA',
    senhaMestra,
    senha,
    filtro: { incluirMfas, incluirContas, incluirConfig, dominios },
  });
  $('exportar-mestra').value = '';
  $('exportar-senha').value = '';
  if (!resp?.ok) {
    dizer(erro, mensagemDeErroDeExportacao(resp?.erro));
    return;
  }
  baixarJson(resp.arquivo, 'firefox-mfa-backup.json');
  const { mfas = 0, contas = 0 } = resp.exportados ?? {};
  dizer(status, `Backup baixado: ${mfas} MFA(s) e ${contas} conta(s).`);
}

function mensagemDeErroDeExportacao(codigo) {
  if (codigo === 'SESSAO_BLOQUEADA') return 'Sessão expirada.';
  if (codigo === 'SENHA_MESTRA_INCORRETA') return 'Senha mestra incorreta.';
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
  } else {
    dizer(erro, 'Senha incorreta ou arquivo inválido.');
  }
}

iniciar();
