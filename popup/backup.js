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

async function iniciar() {
  $('form-exportar').addEventListener('submit', aoExportar);
  $('form-importar').addEventListener('submit', aoImportar);

  let desbloqueado = false;
  try {
    ({ desbloqueado } = await enviar({ type: 'SESSION_STATUS' }));
  } catch {
    /* background indisponível */
  }
  $('bloqueado-aviso').hidden = desbloqueado;
  $('backup-conteudo').hidden = !desbloqueado;
}

async function aoExportar(evento) {
  evento.preventDefault();
  const erro = $('exportar-erro');
  const status = $('exportar-status');
  limpar(erro);
  limpar(status);

  const senha = $('exportar-senha').value;
  if (senha === '') {
    dizer(erro, 'Informe uma senha de exportação.');
    return;
  }
  const resp = await enviar({ type: 'EXPORT_DATA', senha });
  $('exportar-senha').value = '';
  if (!resp?.ok) {
    dizer(erro, resp?.erro === 'SESSAO_BLOQUEADA' ? 'Sessão expirada.' : 'Falha ao exportar.');
    return;
  }
  baixarJson(resp.arquivo, 'firefox-mfa-backup.json');
  dizer(status, 'Backup baixado.');
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
    dizer(status, `Importado(s) ${resp.importados} MFA(s).${extra}`);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(erro, 'Sessão expirada. Desbloqueie pela extensão.');
  } else {
    dizer(erro, 'Senha incorreta ou arquivo inválido.');
  }
}

iniciar();
