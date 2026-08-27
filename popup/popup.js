// Popup da extensão (tasks 01–09): máquina de estados de telas, senha mestra,
// listagem por domínio, formulário de criar/editar e exclusão.
//
// Arquitetura (CLAUDE.md / ia/02): o popup NUNCA detém a CryptoKey nem segredos
// persistidos; só troca mensagens com o background e renderiza com a DOM API
// (textContent, nunca innerHTML). A única exceção é o REVEAL_SECRET pontual do
// fluxo de edição, descartado do campo ao sair.

import { extrairDominioDaAba, ehLocalhost, normalizarDominio } from '../src/dominio.js';
import { validarCadastro } from '../src/cadastro.js';
import { validarConta, mascararEmail } from '../src/conta.js';
import {
  validarCadastroSenha,
  decidirTela,
  avaliarForcaSenha,
  CRITERIOS_FORCA,
  TAMANHO_MINIMO_SENHA,
} from '../src/senha.js';
import { decidirListagem, filtrarPorDominio } from '../src/listagem.js';
import { codigoParaCopia } from '../src/codigo.js';
import { resolverSeletor } from '../src/autofill.js';
import { renderizarLista, pararTicker, copiarParaClipboard } from './cards.js';

const VIEWS = [
  'view-criar-senha',
  'view-desbloquear',
  'view-principal',
  'view-formulario',
  'view-contas',
  'view-conta-form',
  'view-config',
  'view-localhost',
];

const $ = (id) => document.getElementById(id);
const enviar = (mensagem) => browser.runtime.sendMessage(mensagem);
const limpar = (el) => {
  el.textContent = '';
};
const dizer = (el, texto) => {
  el.textContent = texto;
};

// Estado da sessão do popup (não persiste).
let verTodos = false;
let dominioAtual = null;
let mfasCache = [];
let edicaoId = null; // null = modo criar; id = modo editar

// Contas do site (task 30). `contasPorDominio` é só a CONTAGEM por domínio —
// o que basta para o ícone dos cards, sem trazer e-mail nem senha para cá.
let contasPorDominio = {};
let contasCache = [];
let dominioContas = null; // domínio cujas contas estão sendo listadas/editadas
let contaEdicaoId = null; // null = criar conta; id = editar
let voltarDeContas = 'principal'; // para onde a LISTA de contas volta: principal|formulario
let voltarDoConta = 'contas'; // para onde o FORMULÁRIO de conta volta: contas|principal
let alvoExclusao = null; // { tipo: 'mfa' | 'conta', id } — diálogo compartilhado
let configAutofillCache = null; // config completa, p/ salvar um bloco sem perder o outro
let rascunhoMfa = null; // formulário de MFA guardado ao sair para as contas

/* ------------------------------ navegação ------------------------------ */

function mostrarVista(nome) {
  // O ticker é usado pela tela principal e pela tela localhost (ambas têm cards).
  if (nome !== 'principal' && nome !== 'localhost') pararTicker();
  fecharDialogoExclusao(); // o diálogo é transitório: nunca persiste entre telas
  for (const id of VIEWS) $(id).hidden = id !== `view-${nome}`;
  // Foca o campo inicial da tela (ex.: senha mestra), se a tela marcar um. Como as
  // telas começam ocultas, o atributo HTML `autofocus` não dispara — focamos aqui.
  $(`view-${nome}`).querySelector('[data-autofocus]')?.focus();
}

async function iniciar() {
  manterSessaoViva();
  ligarEventos();
  await rotearVistaInicial();
}

// Mantém a sessão viva enquanto o popup está aberto. Uma porta de longa duração
// avisa o background na abertura (connect) e no fechamento (disconnect) do popup,
// para o timer de inatividade só começar a contar depois que o popup fecha — assim
// o usuário pode demorar preenchendo um cadastro sem a sessão expirar. Guardamos a
// referência para a porta não ser coletada antes da hora.
let portaKeepalive = null;
function manterSessaoViva() {
  try {
    portaKeepalive = browser.runtime.connect({ name: 'popup-keepalive' });
  } catch {
    portaKeepalive = null; // sem porta: volta ao comportamento por inatividade
  }
}

// Avisa o background que houve atividade (digitação no cadastro) para resetar o
// relógio de inatividade. Com throttle (no máx. 1 a cada 15s) para não mandar uma
// mensagem por tecla. Funciona mesmo se a porta de keep-alive não tiver conectado.
let ultimoPingAtividade = 0;
function registrarAtividadeDigitando() {
  const agora = Date.now();
  if (agora - ultimoPingAtividade < 15_000) return;
  ultimoPingAtividade = agora;
  enviar({ type: 'PING' }).catch(() => {});
}

async function rotearVistaInicial() {
  let temSenha = false;
  let sessaoAtiva = false;
  try {
    ({ inicializado: temSenha } = await enviar({ type: 'IS_INITIALIZED' }));
    if (temSenha) ({ desbloqueado: sessaoAtiva } = await enviar({ type: 'SESSION_STATUS' }));
  } catch {
    /* background indisponível: trata como primeiro acesso */
  }
  dominioAtual = await obterDominioAtual();

  if (sessaoAtiva) {
    await abrirPrincipal({ autoCopiar: true });
    return;
  }

  // Fluxo localhost sem senha mestra (task 26): MFAs e/ou contas locais sem cripto.
  if (ehLocalhost(dominioAtual)) {
    const locais = await enviar({ type: 'LIST_LOCALHOST', dominio: dominioAtual }).catch(() => null);
    const contas = await enviar({
      type: 'LIST_CONTAS_LOCALHOST',
      dominio: dominioAtual,
    }).catch(() => null);
    const mfasLocais = locais?.ok ? locais.mfas : [];
    const contasLocais = contas?.ok ? contas.contas : [];
    if (mfasLocais.length > 0 || contasLocais.length > 0) {
      await abrirLocalhost(dominioAtual, mfasLocais, contasLocais);
      return;
    }
  }

  mostrarVista(decidirTela({ temSenha, sessaoAtiva })); // criar-senha ou desbloquear
}

async function abrirLocalhost(dominio, mfas, contasLocais = []) {
  mostrarVista('localhost');
  limpar($('localhost-aviso'));
  dizer($('localhost-contexto'), `Acesso local de ${dominio} (sem criptografia)`);
  const controladores = await renderizarLista($('localhost-lista'), mfas, {
    obterCodigo: (id) => enviar({ type: 'GET_CODE_LOCALHOST', id }),
    aoEditar: null, // sem edição sem login
  });

  // Contas locais sem criptografia (task 30): aqui o preenchimento fica num
  // botão próprio, e não no ícone do card — a lista pode nem ter MFA nenhum.
  const temConta = contasLocais.length > 0;
  $('localhost-login').hidden = !temConta;
  if (temConta) {
    dizer(
      $('localhost-login'),
      contasLocais.length === 1
        ? 'Preencher e-mail e senha'
        : `Preencher e-mail e senha (principal de ${contasLocais.length})`,
    );
  }

  // Ações "ao abrir" (autocópia/autopreenchimento) também valem aqui (task 28).
  // A config vem por uma mensagem que não exige sessão (GET_CONFIG_PUBLICO) —
  // só dados não sensíveis. Com nada ligado (padrão da task 29), nada acontece.
  let config = {};
  try {
    config = (await enviar({ type: 'GET_CONFIG_PUBLICO' })) ?? {};
  } catch {
    /* ignora; usa padrões */
  }
  // Código: só com exatamente 1 MFA local, igual à tela principal. Reaproveita
  // o valor já buscado pela lista — sem GET_CODE_LOCALHOST extra.
  const codigo = mfas.length === 1 ? (controladores[0]?.codigo ?? null) : null;
  await aplicarAcoesAoAbrir({
    codigo,
    config,
    elAviso: $('localhost-aviso'),
    login: temConta ? { tipo: 'AUTOFILL_LOGIN_LOCALHOST', dominio } : null,
  });
}

function ligarEventos() {
  $('form-criar-senha').addEventListener('submit', aoCriarSenha);
  $('form-desbloquear').addEventListener('submit', aoDesbloquear);
  // Indicador de força (informativo) atualizado ao digitar a nova senha.
  $('criar-senha').addEventListener('input', () =>
    renderizarForcaSenha($('criar-senha-forca'), $('criar-senha').value),
  );
  $('ts-nova').addEventListener('input', () =>
    renderizarForcaSenha($('ts-forca'), $('ts-nova').value),
  );
  $('desbloquear-toggle').addEventListener('click', () =>
    alternarVisibilidade('desbloquear-senha', 'desbloquear-toggle'),
  );

  $('btn-adicionar').addEventListener('click', () => abrirFormulario(null));
  $('btn-adicionar-conta').addEventListener('click', aoClicarContasDoSite);
  $('localhost-login').addEventListener('click', () =>
    preencherLoginManual('AUTOFILL_LOGIN_LOCALHOST', dominioAtual, $('localhost-aviso')),
  );
  $('btn-ver-todos').addEventListener('click', alternarVerTodos);
  $('localhost-entrar').addEventListener('click', () => mostrarVista('desbloquear'));
  $('mfa-dominio').addEventListener('input', () => {
    atualizarOpcaoSemCripto();
    atualizarBlocoContas();
  });

  // Backup abre uma aba dedicada: o seletor de arquivos fecharia o popup (task 20).
  $('btn-backup').addEventListener('click', abrirBackup);

  $('btn-config').addEventListener('click', abrirConfig);
  $('config-voltar').addEventListener('click', abrirPrincipal);
  $('form-geral').addEventListener('submit', aoSalvarGeral);
  $('form-sessao').addEventListener('submit', aoSalvarTimeout);
  $('form-ratelimit').addEventListener('submit', aoSalvarRateLimit);
  $('form-trocar-senha').addEventListener('submit', aoTrocarSenha);
  $('form-autofill').addEventListener('submit', aoSalvarAutofill);
  $('af-add-dominio').addEventListener('click', () => adicionarLinhaDominio('', ''));

  $('mfa-contas-abrir').addEventListener('click', abrirContasDoFormulario);
  $('contas-voltar').addEventListener('click', voltarDaListaDeContas);
  $('contas-adicionar').addEventListener('click', () =>
    abrirFormularioConta(null, dominioContas ?? dominioAtual ?? '', 'contas'),
  );
  $('form-conta').addEventListener('submit', aoSalvarConta);
  $('form-conta').addEventListener('input', registrarAtividadeDigitando);
  $('conta-form-voltar').addEventListener('click', voltarDoFormularioDeConta);
  $('conta-senha-toggle').addEventListener('click', () =>
    alternarVisibilidade('conta-senha', 'conta-senha-toggle'),
  );
  $('conta-dominio').addEventListener('input', atualizarOpcaoSemCriptoConta);
  $('conta-excluir').addEventListener('click', () =>
    abrirDialogoExclusao({ tipo: 'conta', id: contaEdicaoId }),
  );

  $('form-autofill-login').addEventListener('submit', aoSalvarAutofillLogin);
  $('al-add-dominio').addEventListener('click', () => adicionarLinhaDominioLogin('', '', ''));

  $('form-mfa').addEventListener('submit', aoSalvarFormulario);
  // Digitar no cadastro (inclui o campo do segredo) também conta como atividade:
  // reforça o keep-alive da porta avisando o background a cada trecho digitado.
  $('form-mfa').addEventListener('input', registrarAtividadeDigitando);
  $('form-voltar').addEventListener('click', abrirPrincipal);
  $('mfa-secret-toggle').addEventListener('click', () =>
    alternarVisibilidade('mfa-secret', 'mfa-secret-toggle'),
  );
  $('btn-excluir').addEventListener('click', () =>
    abrirDialogoExclusao({ tipo: 'mfa', id: edicaoId }),
  );
  $('dialog-cancelar').addEventListener('click', fecharDialogoExclusao);
  $('dialog-confirmar').addEventListener('click', confirmarExclusao);
}

function alternarVisibilidade(idInput, idBotao) {
  const input = $(idInput);
  const botao = $(idBotao);
  const revelar = input.type === 'password';
  input.type = revelar ? 'text' : 'password';
  botao.textContent = revelar ? 'Ocultar' : 'Mostrar';
}

/* ------------------------------ senha mestra ------------------------------ */

// Indicador de força da senha (informativo): barra, rótulo do nível e a lista dos
// 5 critérios. Tudo via DOM API (textContent), nunca innerHTML. O cadastro não é
// bloqueado por aqui — só o tamanho mínimo (validarCadastroSenha) é obrigatório.
function renderizarForcaSenha(container, senha) {
  const aval = avaliarForcaSenha(senha);
  container.replaceChildren();
  if (senha === '') {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const cabecalho = document.createElement('div');
  cabecalho.className = 'forca__cabecalho';

  const barra = document.createElement('div');
  barra.className = 'forca__barra';
  const preenchida = document.createElement('span');
  preenchida.className = 'forca__preenchida';
  preenchida.dataset.nivel = String(aval.nivel);
  preenchida.style.width = `${(aval.pontos / CRITERIOS_FORCA.length) * 100}%`;
  barra.append(preenchida);

  const nivel = document.createElement('span');
  nivel.className = 'forca__nivel';
  nivel.dataset.nivel = String(aval.nivel);
  nivel.textContent = aval.rotulo;

  cabecalho.append(barra, nivel);
  container.append(cabecalho);

  const lista = document.createElement('ul');
  lista.className = 'forca__criterios';
  for (const { chave, rotulo } of CRITERIOS_FORCA) {
    const item = document.createElement('li');
    item.className = 'forca__criterio';
    const ok = aval.criterios[chave];
    item.dataset.ok = ok ? 'sim' : 'nao';
    const marca = document.createElement('span');
    marca.className = 'forca__marca';
    marca.textContent = ok ? '✓' : '○';
    const texto = document.createElement('span');
    texto.textContent = rotulo;
    item.append(marca, texto);
    lista.append(item);
  }
  container.append(lista);

  if (!aval.atendeMinimo) {
    const minimo = document.createElement('p');
    minimo.className = 'forca__minimo';
    minimo.textContent = `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres (obrigatório).`;
    container.append(minimo);
  }
}

async function aoCriarSenha(evento) {
  evento.preventDefault();
  const senhaErro = $('criar-senha-erro');
  const confErro = $('criar-senha-conf-erro');
  limpar(senhaErro);
  limpar(confErro);

  const senha = $('criar-senha').value;
  const confirmacao = $('criar-senha-conf').value;
  const validacao = validarCadastroSenha({ senha, confirmacao });
  if (!validacao.valido) {
    if (validacao.erros.senha) dizer(senhaErro, validacao.erros.senha);
    if (validacao.erros.confirmacao) dizer(confErro, validacao.erros.confirmacao);
    return;
  }

  const resp = await enviar({ type: 'SET_MASTER_PASSWORD', senha });
  $('criar-senha').value = '';
  $('criar-senha-conf').value = '';
  renderizarForcaSenha($('criar-senha-forca'), '');
  if (resp?.ok) await abrirPrincipal({ autoCopiar: true });
  else dizer(senhaErro, resp?.erro ?? 'Não foi possível criar a senha.');
}

async function aoDesbloquear(evento) {
  evento.preventDefault();
  const erro = $('desbloquear-erro');
  const botao = $('desbloquear-btn');
  limpar(erro);

  const senha = $('desbloquear-senha').value;
  if (senha === '') {
    dizer(erro, 'Informe a senha.');
    return;
  }
  // Estado de carregando: cobre também o atraso do rate limiting (task 10).
  botao.disabled = true;
  dizer(botao, 'Verificando…');
  let resp;
  try {
    resp = await enviar({ type: 'UNLOCK', senha });
  } finally {
    botao.disabled = false;
    dizer(botao, 'Desbloquear');
  }
  $('desbloquear-senha').value = '';
  if (resp?.ok) await abrirPrincipal({ autoCopiar: true });
  else dizer(erro, 'Senha incorreta.');
}

/* ------------------------------ tela principal ------------------------------ */

async function abrirPrincipal({ autoCopiar = false } = {}) {
  edicaoId = null;
  mostrarVista('principal');
  dominioAtual = await obterDominioAtual();

  const resp = await enviar({ type: 'LIST_MFAS' });
  if (!resp?.ok) {
    // sessão expirou enquanto o popup estava aberto
    mostrarVista('desbloquear');
    return;
  }
  mfasCache = resp.mfas;
  await atualizarResumoContas();
  const decisao = renderizarPrincipal();
  if (autoCopiar) await executarAcoesAoAbrir(decisao);
}

// Ações automáticas "ao abrir": autocópia (task 15) + autopreenchimento do código
// (task 18) + autopreenchimento do login (task 30) + fechar-ao-preencher. É o ponto
// ÚNICO dessas ações — chamado tanto ao abrir já desbloqueado (sessão ativa) quanto
// logo após desbloquear com a senha mestra, ambos via abrirPrincipal({ autoCopiar:
// true }). Assim, qualquer regra de abertura nova passa a valer para os dois fluxos.
// O código só age com 1 MFA do domínio; o login, quando o domínio tem conta salva.
async function executarAcoesAoAbrir(decisao) {
  const temConta = (contasPorDominio[dominioAtual] ?? 0) > 0;
  const mfaUnico = decisao.modo === 'dominio' && decisao.itens.length === 1;
  if (!temConta && !mfaUnico) return;

  let config = {};
  try {
    config = (await enviar({ type: 'GET_CONFIG' })) ?? {};
  } catch {
    /* ignora; usa padrões */
  }
  let codigo = null;
  if (mfaUnico) {
    const resp = await enviar({ type: 'GET_CODE', id: decisao.itens[0].id });
    if (resp?.ok) codigo = resp.codigo;
  }
  await aplicarAcoesAoAbrir({
    codigo,
    config,
    elAviso: $('principal-aviso'),
    login: temConta ? { tipo: 'AUTOFILL_LOGIN', dominio: dominioAtual } : null,
  });
}

// Regra única de copiar/preencher/avisar/fechar ao abrir. Compartilhada entre a
// tela principal (tasks 15/18/30) e o fluxo localhost sem senha mestra (task 28),
// para as duas se comportarem igual. Cada ação é opt-in e silenciosa se falhar.
async function aplicarAcoesAoAbrir({ codigo, config, elAviso, login }) {
  let copiou = false;
  if (codigo && config.autocopiar === true) {
    // opt-in; padrão desligado (task 29)
    try {
      await copiarParaClipboard(codigo);
      copiou = true;
    } catch {
      /* clipboard indisponível: silencioso, o usuário ainda pode clicar */
    }
  }
  const preencheuCodigo = codigo ? await preencherNaAba(config.autofill, codigo) : false;
  const preencheuLogin =
    login && config.autofill?.login?.habilitado
      ? await pedirPreenchimentoDeLogin(login.tipo, login.dominio, false)
      : false;

  const partes = [];
  if (copiou && preencheuCodigo) partes.push('código copiado e preenchido');
  else if (copiou) partes.push('código copiado');
  else if (preencheuCodigo) partes.push('código preenchido');
  if (preencheuLogin) partes.push('login preenchido');
  if (partes.length > 0) {
    const texto = partes.join(' · ');
    dizer(elAviso, `${texto[0].toUpperCase()}${texto.slice(1)} ✓`);
  }

  // Fecha o popup sozinho quando o autopreenchimento do código der certo (opt-in).
  if (preencheuCodigo && config.autofill?.fecharAoPreencher) window.close();
}

/**
 * Pede ao background que injete e-mail e senha na aba ativa. O popup só informa
 * a aba e o domínio: a senha em claro nunca passa por aqui.
 * @returns {Promise<boolean>} true se algum campo foi preenchido.
 */
async function pedirPreenchimentoDeLogin(tipo, dominio, manual) {
  if (!dominio) return false;
  try {
    const [aba] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!aba?.id) return false;
    const resp = await enviar({ type: tipo, dominio, tabId: aba.id, manual });
    return resp?.ok === true && resp.preencheu === true;
  } catch {
    return false; // página restrita / sem permissão: silencioso
  }
}

/** Preenchimento pedido explicitamente (ícone do card ou botão do localhost). */
async function preencherLoginManual(tipo, dominio, elAviso) {
  limpar(elAviso);
  const preencheu = await pedirPreenchimentoDeLogin(tipo, dominio, true);
  dizer(
    elAviso,
    preencheu
      ? 'Login preenchido na página ✓'
      : 'Não encontrei os campos de login nesta página.',
  );
}

// Função INJETADA na página (roda no contexto da aba, não no popup). Precisa ser
// autocontida — sem closures/imports. Insere o código no(s) campo(s) do seletor
// e tenta disparar Enter para continuar.
function preencherCamposOtp(seletor, codigo) {
  let campos;
  try {
    campos = document.querySelectorAll(seletor);
  } catch {
    return { ok: false, motivo: 'seletor' };
  }
  if (!campos || campos.length === 0) return { ok: false, motivo: 'nao_encontrado' };

  const disparar = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Vários inputs (um por dígito) vs. um único campo.
  if (campos.length > 1 && campos.length >= codigo.length) {
    for (let i = 0; i < codigo.length; i++) {
      campos[i].value = codigo[i];
      disparar(campos[i]);
    }
  } else {
    campos[0].value = codigo;
    disparar(campos[0]);
  }

  const ultimo = campos[Math.min(campos.length, codigo.length) - 1] || campos[0];
  ultimo.focus();
  for (const tipo of ['keydown', 'keypress', 'keyup']) {
    ultimo.dispatchEvent(
      new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    );
  }
  return { ok: true };
}

/** Injeta o código na aba ativa, se o autopreenchimento estiver habilitado. */
async function preencherNaAba(cfg, codigo) {
  if (!cfg?.habilitado || !browser.scripting?.executeScript) return false;
  const seletor = resolverSeletor(cfg, dominioAtual);
  if (!seletor) return false;
  try {
    const [aba] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!aba?.id) return false;
    const [res] = await browser.scripting.executeScript({
      target: { tabId: aba.id },
      func: preencherCamposOtp,
      args: [seletor, codigoParaCopia(codigo)],
    });
    return res?.result?.ok === true;
  } catch {
    return false; // sem permissão na aba / página restrita: silencioso
  }
}

function renderizarPrincipal() {
  limpar($('principal-aviso'));
  const decisao = decidirListagem({ todos: mfasCache, dominioAtual, verTodos });
  const lista = $('lista-mfas');
  const vazio = $('principal-vazio');
  const contexto = $('principal-contexto');
  const botaoVerTodos = $('btn-ver-todos');

  atualizarBotaoContasDoSite();

  // Estado vazio (nenhum MFA cadastrado)
  if (decisao.modo === 'vazio') {
    pararTicker();
    lista.replaceChildren();
    lista.hidden = true;
    vazio.hidden = false;
    const contasAqui = contasPorDominio[dominioAtual] ?? 0;
    dizer(
      $('vazio-msg'),
      contasAqui > 0
        ? `Nenhum MFA cadastrado. Este site tem ${contasAqui} conta(s) salva(s) — veja em "E-mail e senha".`
        : 'Nenhum MFA cadastrado ainda. Adicione o primeiro abaixo.',
    );
    botaoVerTodos.hidden = true;
    dizer(contexto, '');
    return decisao;
  }

  lista.hidden = false;
  vazio.hidden = true;

  // Texto de contexto + botão de alternância
  if (decisao.modo === 'dominio') {
    dizer(contexto, `Códigos para ${dominioAtual}`);
    botaoVerTodos.hidden = false;
    dizer(botaoVerTodos, 'Ver todos');
  } else if (decisao.modo === 'todos-fallback') {
    dizer(contexto, `Nenhum código para ${dominioAtual}. Mostrando todos.`);
    botaoVerTodos.hidden = true;
  } else {
    dizer(contexto, 'Todos os códigos');
    // Só oferece "ver deste site" se houver itens do domínio atual.
    const temDoDominio = dominioAtual && filtrarPorDominio(mfasCache, dominioAtual).length > 0;
    botaoVerTodos.hidden = !temDoDominio;
    dizer(botaoVerTodos, 'Ver deste site');
  }

  renderizarLista(lista, decisao.itens, {
    obterCodigo: (id) => enviar({ type: 'GET_CODE', id }),
    aoEditar: (id) => abrirFormulario(id),
    contasPorDominio,
    aoPreencherLogin: (dominio) =>
      preencherLoginManual('AUTOFILL_LOGIN', dominio, $('principal-aviso')),
  });
  return decisao;
}

/** Só a contagem de contas por domínio — nunca e-mail ou senha. */
async function atualizarResumoContas() {
  const resp = await enviar({ type: 'CONTAS_RESUMO' }).catch(() => null);
  contasPorDominio = resp?.ok ? resp.porDominio : {};
}

/** O botão de contas da tela principal muda de acordo com o site atual. */
function atualizarBotaoContasDoSite() {
  const botao = $('btn-adicionar-conta');
  const n = dominioAtual ? (contasPorDominio[dominioAtual] ?? 0) : 0;
  dizer(botao, n > 0 ? `E-mail e senha (${n})` : '+ E-mail e senha');
}

/** Abre a lista de contas do site atual, ou o cadastro da primeira conta. */
function aoClicarContasDoSite() {
  const dominio = dominioAtual ?? '';
  if (dominio && (contasPorDominio[dominio] ?? 0) > 0) return abrirContas(dominio, 'principal');
  return abrirFormularioConta(null, dominio, 'principal');
}

function alternarVerTodos() {
  verTodos = !verTodos;
  renderizarPrincipal();
}

async function obterDominioAtual() {
  try {
    const [aba] = await browser.tabs.query({ active: true, currentWindow: true });
    return extrairDominioDaAba(aba);
  } catch {
    return null;
  }
}

/* --------------------------- formulário criar/editar --------------------------- */

async function abrirFormulario(id) {
  edicaoId = id;
  limpar($('mfa-nome-erro'));
  limpar($('mfa-secret-erro'));
  limpar($('mfa-status'));
  $('mfa-secret').type = 'password';
  $('mfa-secret-toggle').textContent = 'Mostrar';
  $('mfa-sem-cripto').checked = false;
  $('mfa-sem-cripto').disabled = false;
  mostrarVista('formulario');

  if (id === null) {
    // modo criar
    dizer($('form-titulo'), 'Cadastrar novo MFA');
    $('btn-excluir').hidden = true;
    $('mfa-nome').value = '';
    $('mfa-secret').value = '';
    $('mfa-dominio').value = (await obterDominioAtual()) ?? '';
    atualizarOpcaoSemCripto();
    atualizarBlocoContas();
    return;
  }

  // modo editar
  dizer($('form-titulo'), 'Editar MFA');
  $('btn-excluir').hidden = false;
  const mfa = mfasCache.find((m) => m.id === id);
  $('mfa-nome').value = mfa?.nome ?? '';
  $('mfa-dominio').value = mfa?.dominio ?? '';
  // O modo de criptografia é definido na criação e preservado: checkbox só informativo.
  $('mfa-sem-cripto').checked = mfa?.semCriptografia === true;
  $('mfa-sem-cripto').disabled = true;
  atualizarOpcaoSemCripto();
  atualizarBlocoContas();
  // Pré-preenche o segredo (exceção REVEAL_SECRET da ia/02; em claro p/ localhost).
  const resp = await enviar({ type: 'REVEAL_SECRET', id });
  $('mfa-secret').value = resp?.ok ? resp.secret : '';
}

// Mostra a opção "sem criptografia" apenas quando o domínio é localhost (task 26).
function atualizarOpcaoSemCripto() {
  const local = ehLocalhost($('mfa-dominio').value);
  $('mfa-sem-cripto-campo').hidden = !local;
  if (!local && edicaoId === null) $('mfa-sem-cripto').checked = false;
}

async function aoSalvarFormulario(evento) {
  evento.preventDefault();
  const nomeErro = $('mfa-nome-erro');
  const secretErro = $('mfa-secret-erro');
  const status = $('mfa-status');
  limpar(nomeErro);
  limpar(secretErro);
  limpar(status);

  const nome = $('mfa-nome').value;
  const dominio = $('mfa-dominio').value;
  const secret = $('mfa-secret').value;

  const validacao = validarCadastro({ nome, dominio, secret });
  if (!validacao.valido) {
    if (validacao.erros.nome) dizer(nomeErro, validacao.erros.nome);
    if (validacao.erros.secret) dizer(secretErro, validacao.erros.secret);
    return;
  }

  const tipo = edicaoId === null ? 'SAVE_MFA' : 'UPDATE_MFA';
  const semCriptografia = $('mfa-sem-cripto').checked && ehLocalhost(dominio);
  const resp = await enviar({ type: tipo, id: edicaoId, nome, dominio, secret, semCriptografia });
  $('mfa-secret').value = ''; // descarta o segredo da UI

  if (resp?.ok) {
    await abrirPrincipal();
  } else if (resp?.erros) {
    if (resp.erros.nome) dizer(nomeErro, resp.erros.nome);
    if (resp.erros.secret) dizer(secretErro, resp.erros.secret);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(status, 'Sessão expirada. Feche e reabra para desbloquear.');
  } else if (resp?.erro === 'SEM_CRIPTO_SO_LOCALHOST') {
    dizer(status, 'A opção sem criptografia só vale para localhost.');
  } else {
    dizer(status, resp?.erro ?? 'Não foi possível salvar.');
  }
}

/* ---------------------- contas do site: e-mail e senha ---------------------- */
//
// A conta é uma entidade por DOMÍNIO (não por MFA): um site pode ter várias, e
// exatamente uma é a principal — a que o autopreenchimento usa. A senha só chega
// aqui no formulário de edição (REVEAL_CONTA) e é descartada do campo ao salvar.

/** Resumo das contas dentro do formulário de MFA (leva à tela dedicada). */
function atualizarBlocoContas() {
  const dominio = normalizarDominio($('mfa-dominio').value);
  const botao = $('mfa-contas-abrir');
  if (dominio === null) {
    dizer($('mfa-contas-resumo'), 'Informe o site acima para salvar e-mail e senha.');
    dizer(botao, '+ Salvar e-mail e senha');
    botao.disabled = true;
    return;
  }
  const n = contasPorDominio[dominio] ?? 0;
  botao.disabled = false;
  if (n > 0) {
    dizer($('mfa-contas-resumo'), `${n} conta(s) salva(s) para ${dominio}.`);
    dizer(botao, `Ver contas de ${dominio}`);
  } else {
    dizer($('mfa-contas-resumo'), `Nenhuma conta salva para ${dominio}.`);
    dizer(botao, '+ Salvar e-mail e senha');
  }
}

function abrirContasDoFormulario() {
  const dominio = normalizarDominio($('mfa-dominio').value);
  if (dominio === null) return;
  // O formulário de MFA pode estar preenchido pela metade: guarda o que foi
  // digitado para não obrigar a redigitar ao voltar.
  rascunhoMfa = {
    nome: $('mfa-nome').value,
    dominio: $('mfa-dominio').value,
    secret: $('mfa-secret').value,
    semCriptografia: $('mfa-sem-cripto').checked,
  };
  dominioContas = dominio;
  voltarDeContas = 'formulario';
  if ((contasPorDominio[dominio] ?? 0) > 0) return abrirContas(dominio, 'formulario');
  return abrirFormularioConta(null, dominio, 'contas');
}

async function abrirContas(dominio, origem = 'principal') {
  dominioContas = dominio;
  voltarDeContas = origem;
  mostrarVista('contas');
  limpar($('contas-aviso'));
  dizer($('contas-titulo'), `Contas de ${dominio}`);

  const resp = await enviar({ type: 'LIST_CONTAS', dominio });
  if (!resp?.ok) {
    mostrarVista('desbloquear'); // sessão expirou enquanto o popup estava aberto
    return;
  }
  contasCache = resp.contas;
  renderizarContas();
}

function renderizarContas() {
  const lista = $('lista-contas');
  const vazio = $('contas-vazio');
  lista.replaceChildren();
  if (contasCache.length === 0) {
    lista.hidden = true;
    vazio.hidden = false;
    return;
  }
  lista.hidden = false;
  vazio.hidden = true;
  const template = document.getElementById('tpl-conta');
  for (const conta of contasCache) lista.append(criarLinhaConta(template, conta));
}

// `email` e `rotulo` são texto livre do usuário: sempre via textContent.
function criarLinhaConta(template, conta) {
  const fragmento = template.content.cloneNode(true);
  const el = fragmento.querySelector('.conta');

  const radio = el.querySelector('.switch__input');
  radio.checked = conta.principal === true;
  radio.addEventListener('change', () => definirContaPrincipal(conta.id));

  const emailEl = el.querySelector('.conta__email');
  const botaoMostrar = el.querySelector('.conta__mostrar');
  let revelado = false;
  const pintar = () => {
    emailEl.textContent = revelado ? conta.email : mascararEmail(conta.email);
    botaoMostrar.textContent = revelado ? 'Ocultar' : 'Mostrar';
  };
  pintar();
  botaoMostrar.addEventListener('click', () => {
    revelado = !revelado;
    pintar();
  });

  const rotuloEl = el.querySelector('.conta__rotulo');
  const legenda = [conta.rotulo, conta.semCriptografia ? 'sem criptografia' : null]
    .filter(Boolean)
    .join(' · ');
  if (legenda === '') rotuloEl.hidden = true;
  else rotuloEl.textContent = legenda;

  el.querySelector('.conta__editar').addEventListener('click', () =>
    abrirFormularioConta(conta.id, conta.dominio, 'contas'),
  );
  return el;
}

async function definirContaPrincipal(id) {
  const resp = await enviar({ type: 'SET_CONTA_PRINCIPAL', id });
  if (resp?.ok) {
    contasCache = resp.contas;
    renderizarContas();
    dizer($('contas-aviso'), 'Conta principal atualizada ✓');
  } else {
    dizer($('contas-aviso'), 'Não foi possível atualizar a conta principal.');
    renderizarContas(); // desfaz o rádio na tela
  }
}

async function voltarDaListaDeContas() {
  if (voltarDeContas !== 'formulario') return abrirPrincipal();
  await abrirFormulario(edicaoId);
  if (rascunhoMfa === null) return;
  $('mfa-nome').value = rascunhoMfa.nome;
  $('mfa-dominio').value = rascunhoMfa.dominio;
  $('mfa-secret').value = rascunhoMfa.secret;
  if (!$('mfa-sem-cripto').disabled) $('mfa-sem-cripto').checked = rascunhoMfa.semCriptografia;
  rascunhoMfa = null;
  atualizarOpcaoSemCripto();
  atualizarBlocoContas();
}

function voltarDoFormularioDeConta() {
  if (voltarDoConta === 'contas' && dominioContas) {
    return abrirContas(dominioContas, voltarDeContas);
  }
  return abrirPrincipal();
}

async function abrirFormularioConta(id, dominio, origem = 'contas') {
  contaEdicaoId = id;
  voltarDoConta = origem;
  // Entrando pela tela principal, a lista que vem depois de salvar também volta
  // para lá (e não para um formulário de MFA de uma navegação anterior).
  if (origem === 'principal') voltarDeContas = 'principal';
  dominioContas = dominio || dominioContas;
  for (const el of [
    'conta-dominio-erro',
    'conta-email-erro',
    'conta-senha-erro',
    'conta-rotulo-erro',
    'conta-status',
  ]) {
    limpar($(el));
  }
  $('conta-senha').type = 'password';
  $('conta-senha-toggle').textContent = 'Mostrar';
  $('conta-sem-cripto').checked = false;
  $('conta-sem-cripto').disabled = false;
  mostrarVista('conta-form');

  if (id === null) {
    // modo criar
    dizer($('conta-form-titulo'), 'Nova conta do site');
    $('conta-excluir').hidden = true;
    $('conta-senha-ajuda').hidden = true;
    $('conta-dominio').value = dominio ?? '';
    $('conta-email').value = '';
    $('conta-senha').value = '';
    $('conta-rotulo').value = '';
    // A primeira conta de um site é sempre a principal.
    $('conta-principal').checked = (contasPorDominio[dominio] ?? 0) === 0;
    atualizarOpcaoSemCriptoConta();
    return;
  }

  // modo editar
  dizer($('conta-form-titulo'), 'Editar conta');
  $('conta-excluir').hidden = false;
  $('conta-senha-ajuda').hidden = false;
  const conta = contasCache.find((c) => c.id === id);
  $('conta-dominio').value = conta?.dominio ?? dominio ?? '';
  $('conta-rotulo').value = conta?.rotulo ?? '';
  $('conta-principal').checked = conta?.principal === true;
  // O modo de criptografia é definido na criação e preservado: só informativo.
  $('conta-sem-cripto').checked = conta?.semCriptografia === true;
  $('conta-sem-cripto').disabled = true;
  atualizarOpcaoSemCriptoConta();
  // Exceção REVEAL_CONTA (ia/30): só o fluxo de edição recebe e-mail e senha
  // em claro, para popular o formulário.
  const resp = await enviar({ type: 'REVEAL_CONTA', id });
  $('conta-email').value = resp?.ok ? resp.email : '';
  $('conta-senha').value = resp?.ok ? resp.senha : '';
}

// Mostra a opção "sem criptografia" apenas quando o domínio é localhost (task 26).
function atualizarOpcaoSemCriptoConta() {
  const local = ehLocalhost($('conta-dominio').value);
  $('conta-sem-cripto-campo').hidden = !local;
  if (!local && contaEdicaoId === null) $('conta-sem-cripto').checked = false;
}

async function aoSalvarConta(evento) {
  evento.preventDefault();
  const status = $('conta-status');
  for (const el of ['conta-dominio-erro', 'conta-email-erro', 'conta-senha-erro', 'conta-rotulo-erro']) {
    limpar($(el));
  }
  limpar(status);

  const dominio = $('conta-dominio').value;
  const email = $('conta-email').value;
  const senha = $('conta-senha').value;
  const rotulo = $('conta-rotulo').value;
  const criando = contaEdicaoId === null;

  // Na edição, senha em branco significa "manter a atual".
  const validacao = validarConta({ dominio, email, senha, rotulo }, { exigirSenha: criando });
  if (!validacao.valido) {
    mostrarErrosDaConta(validacao.erros);
    return;
  }

  const semCriptografia = $('conta-sem-cripto').checked && ehLocalhost(dominio);
  const resp = await enviar({
    type: criando ? 'SAVE_CONTA' : 'UPDATE_CONTA',
    id: contaEdicaoId,
    dominio,
    email,
    senha,
    rotulo,
    principal: $('conta-principal').checked,
    semCriptografia,
  });
  $('conta-senha').value = ''; // descarta a senha da UI

  if (resp?.ok) {
    await atualizarResumoContas();
    await abrirContas(validacao.normalizado.dominio, voltarDeContas);
  } else if (resp?.erros) {
    mostrarErrosDaConta(resp.erros);
  } else if (resp?.erro === 'SESSAO_BLOQUEADA') {
    dizer(status, 'Sessão expirada. Feche e reabra para desbloquear.');
  } else if (resp?.erro === 'SEM_CRIPTO_SO_LOCALHOST') {
    dizer(status, 'A opção sem criptografia só vale para localhost.');
  } else {
    dizer(status, resp?.erro ?? 'Não foi possível salvar.');
  }
}

function mostrarErrosDaConta(erros) {
  if (erros.dominio) dizer($('conta-dominio-erro'), erros.dominio);
  if (erros.email) dizer($('conta-email-erro'), erros.email);
  if (erros.senha) dizer($('conta-senha-erro'), erros.senha);
  if (erros.rotulo) dizer($('conta-rotulo-erro'), erros.rotulo);
}

/* -------------------------------- exclusão -------------------------------- */

// O diálogo é compartilhado por MFA e conta: o alvo diz o que confirmar/excluir.
function abrirDialogoExclusao(alvo) {
  if (!alvo?.id) return;
  alvoExclusao = alvo;
  dizer(
    $('dialog-excluir-msg'),
    alvo.tipo === 'conta'
      ? 'Excluir este e-mail e senha? Essa ação não pode ser desfeita.'
      : 'Tem certeza? Essa ação não pode ser desfeita.',
  );
  $('dialog-excluir').hidden = false;
}

function fecharDialogoExclusao() {
  alvoExclusao = null;
  $('dialog-excluir').hidden = true;
}

async function confirmarExclusao() {
  const alvo = alvoExclusao;
  fecharDialogoExclusao();
  if (!alvo?.id) return;

  if (alvo.tipo === 'conta') {
    const resp = await enviar({ type: 'DELETE_CONTA', id: alvo.id });
    if (!resp?.ok) {
      dizer($('conta-status'), 'Não foi possível excluir.');
      return;
    }
    await atualizarResumoContas();
    await abrirContas(dominioContas ?? dominioAtual, voltarDeContas);
    return;
  }

  const resp = await enviar({ type: 'DELETE_MFA', id: alvo.id });
  if (resp?.ok) await abrirPrincipal();
  else dizer($('mfa-status'), 'Não foi possível excluir.');
}

/* --------------------------------- backup --------------------------------- */

function abrirBackup() {
  // Página dedicada em aba: o seletor de arquivos não destrói o contexto.
  browser.tabs.create({ url: browser.runtime.getURL('popup/backup.html') });
}

/* ------------------------------ configurações ------------------------------ */

async function abrirConfig() {
  mostrarVista('config');
  limpar($('ratelimit-status'));
  limpar($('ts-status'));
  limpar($('ts-nova-erro'));
  limpar($('ts-conf-erro'));
  $('ts-atual').value = '';
  $('ts-nova').value = '';
  $('ts-conf').value = '';
  renderizarForcaSenha($('ts-forca'), '');
  limpar($('af-status'));
  limpar($('al-status'));
  limpar($('sessao-status'));
  limpar($('geral-status'));
  const resp = await enviar({ type: 'GET_CONFIG' });
  if (!resp?.ok) return;
  $('geral-autocopiar').checked = resp.autocopiar === true;
  $('sessao-minutos').value = (resp.sessaoTimeoutMs / 60000).toString();
  const c = resp.rateLimit;
  $('rl-livres').value = c.livres;
  $('rl-limite1').value = c.limite1;
  $('rl-atraso1').value = Math.round(c.atraso1Ms / 1000);
  $('rl-limite2').value = c.limite2;
  $('rl-atraso2').value = Math.round(c.atraso2Ms / 1000);
  $('rl-atrasomax').value = Math.round(c.atrasoMaxMs / 1000);

  const af = resp.autofill ?? {};
  configAutofillCache = af; // os dois blocos salvam a config inteira: guarde-a
  $('af-habilitado').checked = Boolean(af.habilitado);
  $('af-fechar').checked = Boolean(af.fecharAoPreencher);
  $('af-seletor-padrao').value = af.seletorPadrao ?? '';
  $('af-dominios').replaceChildren();
  for (const [dominio, seletor] of Object.entries(af.porDominio ?? {})) {
    adicionarLinhaDominio(dominio, seletor);
  }

  const login = af.login ?? {};
  $('al-habilitado').checked = Boolean(login.habilitado);
  $('al-submeter').checked = Boolean(login.submeter);
  $('al-seletor-email').value = login.seletorEmailPadrao ?? '';
  $('al-seletor-senha').value = login.seletorSenhaPadrao ?? '';
  $('al-dominios').replaceChildren();
  for (const [dominio, seletores] of Object.entries(login.porDominio ?? {})) {
    adicionarLinhaDominioLogin(dominio, seletores.email ?? '', seletores.senha ?? '');
  }
}

// Linha editável de "domínio → seletor de e-mail + seletor de senha" (task 30).
function adicionarLinhaDominioLogin(dominio, seletorEmail, seletorSenha) {
  const linha = document.createElement('div');
  linha.className = 'al-linha';

  const campo = (classe, placeholder, valor) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = `field__input ${classe}`;
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.value = valor;
    return input;
  };

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'btn-link al-linha__rm';
  remover.textContent = 'remover';
  remover.addEventListener('click', () => linha.remove());

  linha.append(
    campo('al-linha__dom', 'domínio (ex: github.com)', dominio),
    campo('al-linha__email', 'seletor do e-mail', seletorEmail),
    campo('al-linha__senha', 'seletor da senha', seletorSenha),
    remover,
  );
  $('al-dominios').append(linha);
}

// Cria uma linha editável de "domínio → seletor". Tudo via DOM API (sem innerHTML).
function adicionarLinhaDominio(dominio, seletor) {
  const linha = document.createElement('div');
  linha.className = 'af-linha';

  const inputDom = document.createElement('input');
  inputDom.type = 'text';
  inputDom.className = 'field__input af-linha__dom';
  inputDom.placeholder = 'domínio (ex: github.com)';
  inputDom.spellcheck = false;
  inputDom.value = dominio;

  const inputSel = document.createElement('input');
  inputSel.type = 'text';
  inputSel.className = 'field__input af-linha__sel';
  inputSel.placeholder = 'seletor CSS';
  inputSel.spellcheck = false;
  inputSel.value = seletor;

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'btn-link af-linha__rm';
  remover.textContent = 'remover';
  remover.addEventListener('click', () => linha.remove());

  linha.append(inputDom, inputSel, remover);
  $('af-dominios').append(linha);
}

async function aoSalvarAutofill(evento) {
  evento.preventDefault();
  const status = $('af-status');
  limpar(status);

  const porDominio = {};
  for (const linha of $('af-dominios').querySelectorAll('.af-linha')) {
    const dom = linha.querySelector('.af-linha__dom').value.trim().toLowerCase();
    const sel = linha.querySelector('.af-linha__sel').value.trim();
    if (dom !== '' && sel !== '') porDominio[dom] = sel;
  }

  // SET_AUTOFILL grava a config INTEIRA: preserve o bloco de login deste form.
  const config = {
    ...(configAutofillCache ?? {}),
    habilitado: $('af-habilitado').checked,
    seletorPadrao: $('af-seletor-padrao').value,
    fecharAoPreencher: $('af-fechar').checked,
    porDominio,
  };
  const resp = await enviar({ type: 'SET_AUTOFILL', config });
  if (resp?.ok) {
    configAutofillCache = resp.autofill;
    $('af-seletor-padrao').value = resp.autofill.seletorPadrao;
    $('af-dominios').replaceChildren();
    for (const [d, s] of Object.entries(resp.autofill.porDominio)) adicionarLinhaDominio(d, s);
    dizer(status, 'Autopreenchimento salvo.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoSalvarAutofillLogin(evento) {
  evento.preventDefault();
  const status = $('al-status');
  limpar(status);

  const porDominio = {};
  for (const linha of $('al-dominios').querySelectorAll('.al-linha')) {
    const dom = linha.querySelector('.al-linha__dom').value.trim().toLowerCase();
    const email = linha.querySelector('.al-linha__email').value.trim();
    const senha = linha.querySelector('.al-linha__senha').value.trim();
    if (dom === '' || (email === '' && senha === '')) continue;
    porDominio[dom] = {};
    if (email !== '') porDominio[dom].email = email;
    if (senha !== '') porDominio[dom].senha = senha;
  }

  // Preserva o bloco do código (OTP), salvo no outro formulário.
  const config = {
    ...(configAutofillCache ?? {}),
    login: {
      habilitado: $('al-habilitado').checked,
      submeter: $('al-submeter').checked,
      seletorEmailPadrao: $('al-seletor-email').value,
      seletorSenhaPadrao: $('al-seletor-senha').value,
      porDominio,
    },
  };
  const resp = await enviar({ type: 'SET_AUTOFILL', config });
  if (resp?.ok) {
    configAutofillCache = resp.autofill;
    const login = resp.autofill.login;
    $('al-seletor-email').value = login.seletorEmailPadrao;
    $('al-seletor-senha').value = login.seletorSenhaPadrao;
    $('al-dominios').replaceChildren();
    for (const [d, sel] of Object.entries(login.porDominio)) {
      adicionarLinhaDominioLogin(d, sel.email ?? '', sel.senha ?? '');
    }
    dizer(status, 'Autopreenchimento de login salvo.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoSalvarGeral(evento) {
  evento.preventDefault();
  const status = $('geral-status');
  limpar(status);
  const resp = await enviar({ type: 'SET_AUTOCOPY', habilitado: $('geral-autocopiar').checked });
  dizer(status, resp?.ok ? 'Configuração salva.' : 'Não foi possível salvar.');
}

async function aoSalvarTimeout(evento) {
  evento.preventDefault();
  const status = $('sessao-status');
  limpar(status);
  const ms = Math.round(Number($('sessao-minutos').value) * 60000);
  const resp = await enviar({ type: 'SET_SESSION_TIMEOUT', ms });
  if (resp?.ok) {
    $('sessao-minutos').value = (resp.sessaoTimeoutMs / 60000).toString();
    dizer(status, 'Tempo de sessão salvo.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoSalvarRateLimit(evento) {
  evento.preventDefault();
  const status = $('ratelimit-status');
  limpar(status);
  const seg = (id) => Number($(id).value) * 1000;
  const config = {
    livres: Number($('rl-livres').value),
    limite1: Number($('rl-limite1').value),
    atraso1Ms: seg('rl-atraso1'),
    limite2: Number($('rl-limite2').value),
    atraso2Ms: seg('rl-atraso2'),
    atrasoMaxMs: seg('rl-atrasomax'),
  };
  const resp = await enviar({ type: 'SET_RATE_LIMIT', config });
  if (resp?.ok) {
    // Reaplica os valores normalizados (caso tenham sido ajustados).
    const c = resp.rateLimit;
    $('rl-livres').value = c.livres;
    $('rl-limite1').value = c.limite1;
    $('rl-atraso1').value = Math.round(c.atraso1Ms / 1000);
    $('rl-limite2').value = c.limite2;
    $('rl-atraso2').value = Math.round(c.atraso2Ms / 1000);
    $('rl-atrasomax').value = Math.round(c.atrasoMaxMs / 1000);
    dizer(status, 'Configuração salva.');
  } else {
    dizer(status, 'Não foi possível salvar.');
  }
}

async function aoTrocarSenha(evento) {
  evento.preventDefault();
  const novaErro = $('ts-nova-erro');
  const confErro = $('ts-conf-erro');
  const status = $('ts-status');
  limpar(novaErro);
  limpar(confErro);
  limpar(status);

  const senhaAtual = $('ts-atual').value;
  const senhaNova = $('ts-nova').value;
  const confirmacao = $('ts-conf').value;

  if (senhaAtual === '') {
    dizer(status, 'Informe a senha atual.');
    return;
  }
  const validacao = validarCadastroSenha({ senha: senhaNova, confirmacao });
  if (!validacao.valido) {
    if (validacao.erros.senha) dizer(novaErro, validacao.erros.senha);
    if (validacao.erros.confirmacao) dizer(confErro, validacao.erros.confirmacao);
    return;
  }

  const resp = await enviar({ type: 'CHANGE_MASTER_PASSWORD', senhaAtual, senhaNova });
  $('ts-atual').value = '';
  $('ts-nova').value = '';
  $('ts-conf').value = '';
  renderizarForcaSenha($('ts-forca'), '');
  if (resp?.ok) {
    dizer(status, 'Senha alterada com sucesso.');
  } else if (resp?.erro === 'SENHA_ATUAL_INCORRETA') {
    dizer(status, 'Senha atual incorreta.');
  } else if (resp?.erro === 'SENHA_NOVA_INVALIDA') {
    dizer(novaErro, 'A nova senha não atende aos requisitos.');
  } else {
    dizer(status, 'Não foi possível trocar a senha.');
  }
}

// Script de módulo (deferido): a DOM já está pronta quando ele executa.
iniciar();
