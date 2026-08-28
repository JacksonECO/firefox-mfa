// Background da extensão — dono de toda a criptografia e do segredo em claro
// (ver CLAUDE.md / ia/02). O popup nunca recebe a CryptoKey nem o segredo bruto;
// só troca as mensagens roteadas abaixo.
//
// Nota de plataforma: o Firefox MV3 executa este background como event page
// (background.scripts), não como service_worker ao estilo do Chrome. Por isso
// os listeners de eventos são registrados no topo do módulo, de forma síncrona,
// para que o worker consiga "acordar" ao receber uma mensagem/alarme.

import * as sessao from './sessao.js';
import * as storage from './storage.js';
import * as cripto from './crypto.js';
import { validarCadastro, segredoFoiAlterado } from './cadastro.js';
import { validarConta } from './conta.js';
import { ehLocalhost, normalizarDominio, extrairDominioDaAba } from './dominio.js';
import { gerarTOTP, segundosRestantes } from './totp.js';
import {
  exportarDados,
  importarDados,
  normalizarFiltroExport,
  dominioSelecionado,
} from './backup.js';
import { normalizarConfigRateLimit, RATE_LIMIT_PADRAO } from './ratelimit.js';
import { normalizarConfigAutofill, AUTOFILL_PADRAO } from './autofill.js';
import { preencherLogin, resolverSeletorLogin } from './autofilllogin.js';
import { normalizarTimeout, TIMEOUT_PADRAO_MS } from './sessaoconfig.js';

/** Coleta as configurações atuais (não sensíveis) para exportar. */
async function coletarConfiguracoes() {
  return {
    rateLimit: normalizarConfigRateLimit((await storage.obterConfigRateLimit()) ?? RATE_LIMIT_PADRAO),
    autofill: normalizarConfigAutofill((await storage.obterConfigAutofill()) ?? AUTOFILL_PADRAO),
    sessaoTimeoutMs: normalizarTimeout((await storage.obterTimeoutSessao()) ?? TIMEOUT_PADRAO_MS),
    autocopiar: await storage.obterAutocopiar(),
  };
}

/** Aplica configurações vindas de um backup (revalidando cada uma). */
async function aplicarConfiguracoes(cfg) {
  if (cfg.rateLimit) {
    await storage.salvarConfigRateLimit(normalizarConfigRateLimit(cfg.rateLimit));
  }
  if (cfg.autofill) {
    await storage.salvarConfigAutofill(normalizarConfigAutofill(cfg.autofill));
  }
  if (typeof cfg.sessaoTimeoutMs !== 'undefined') {
    const ms = normalizarTimeout(cfg.sessaoTimeoutMs);
    await storage.salvarTimeoutSessao(ms);
    sessao.definirTimeoutMs(ms);
  }
  if (typeof cfg.autocopiar === 'boolean') {
    await storage.salvarAutocopiar(cfg.autocopiar);
  }
}

/** Extrai só os metadados não sensíveis de um registro (nunca o segredo). */
function metadados(mfa) {
  return {
    id: mfa.id,
    nome: mfa.nome,
    dominio: mfa.dominio,
    semCriptografia: mfa.semCriptografia === true,
    createdAt: mfa.createdAt,
    updatedAt: mfa.updatedAt,
  };
}

/** Lê o segredo de um registro: em claro se for localhost sem cripto, senão decripta. */
async function lerSegredo(mfa, chave) {
  if (mfa.semCriptografia) return mfa.secretEmClaro;
  return cripto.descriptografar(mfa.secretCriptografado, mfa.iv, chave);
}

/**
 * Lê e-mail e senha de uma conta: em claro se for localhost sem cripto, senão
 * decripta cada campo com o seu próprio IV. Só é chamada onde o valor em claro
 * é realmente necessário (revelar na edição, autopreencher, exportar).
 */
async function lerCredenciais(conta, chave) {
  if (conta.semCriptografia) {
    return { email: conta.emailEmClaro, senha: conta.senhaEmClaro };
  }
  return {
    email: await cripto.descriptografar(conta.emailCriptografado, conta.ivEmail, chave),
    senha: await cripto.descriptografar(conta.senhaCriptografada, conta.ivSenha, chave),
  };
}

/**
 * Metadados de uma conta para a UI: inclui o e-mail (necessário para identificar
 * a conta na lista) e NUNCA a senha. Se a leitura do e-mail falhar (registro
 * corrompido), devolve o item marcado em vez de derrubar a listagem inteira.
 */
async function metadadosConta(conta, chave) {
  const base = {
    id: conta.id,
    dominio: conta.dominio,
    rotulo: conta.rotulo ?? null,
    principal: conta.principal === true,
    semCriptografia: conta.semCriptografia === true,
    createdAt: conta.createdAt,
    updatedAt: conta.updatedAt,
  };
  try {
    const email = conta.semCriptografia
      ? conta.emailEmClaro
      : await cripto.descriptografar(conta.emailCriptografado, conta.ivEmail, chave);
    return { ...base, email };
  } catch {
    return { ...base, email: '', falhaLeitura: true };
  }
}

/** Aplica `metadadosConta` a uma lista, preservando a ordem. */
async function listaDeMetadadosConta(contas, chave) {
  const saida = [];
  for (const conta of contas) saida.push(await metadadosConta(conta, chave));
  return saida;
}

/** A conta que recebe o autopreenchimento: a escolhida, senão a principal. */
function escolherConta(contas, contaId) {
  if (contaId) return contas.find((c) => c.id === contaId) ?? null;
  return contas.find((c) => c.principal === true) ?? contas[0] ?? null;
}

/**
 * Injeta e-mail e senha na aba. A senha em claro existe apenas neste escopo do
 * background e vai direto para o `executeScript` — nunca passa pelo popup nem
 * é registrada em log. (Strings JS são imutáveis: não há `.fill(0)` possível
 * aqui; o que fazemos é manter o escopo mínimo e soltar a referência.)
 */
async function preencherLoginNaAba({ conta, chave, tabId, config }) {
  if (!conta) return { ok: false, erro: 'SEM_CONTA' };
  if (typeof tabId !== 'number') return { ok: false, erro: 'SEM_ABA' };
  if (!globalThis.browser?.scripting?.executeScript) return { ok: false, erro: 'SEM_SCRIPTING' };

  // Defesa em profundidade: o popup escolhe QUAL domínio preencher, mas nunca
  // decide sozinho PARA ONDE a senha vai. Sem esta checagem, um domínio sem
  // MFA cai no modo "ver todos" da listagem e mostra cards de outros sites —
  // clicar no ícone injetaria a credencial de um domínio na aba de outro.
  let aba;
  try {
    [aba] = await browser.tabs.query({ active: true, currentWindow: true });
  } catch {
    return { ok: false, erro: 'ABA_INVALIDA' };
  }
  if (!aba || aba.id !== tabId) return { ok: false, erro: 'ABA_INVALIDA' };
  if (extrairDominioDaAba(aba) !== conta.dominio) {
    return { ok: false, erro: 'DOMINIO_DIVERGENTE' };
  }

  const seletores = resolverSeletorLogin(config, conta.dominio);
  let credenciais;
  try {
    credenciais = await lerCredenciais(conta, chave);
  } catch {
    return { ok: false, erro: 'FALHA' };
  }
  try {
    const [resultado] = await browser.scripting.executeScript({
      target: { tabId },
      func: preencherLogin,
      args: [
        seletores.email,
        seletores.senha,
        credenciais.email,
        credenciais.senha,
        config.login.submeter === true,
      ],
    });
    return { ok: true, preencheu: resultado?.result?.ok === true };
  } catch {
    return { ok: false, erro: 'FALHA_INJECAO' }; // aba restrita / sem permissão
  } finally {
    credenciais = null;
  }
}

/**
 * Roteia uma mensagem vinda do popup. Retorna sempre um objeto serializável —
 * nunca a CryptoKey nem um segredo em claro.
 *
 * Tipos implementados até aqui:
 *  - IS_INITIALIZED      → { inicializado }                     (task 02)
 *  - SET_MASTER_PASSWORD → { ok, erro? }   (primeiro acesso)    (task 02)
 *  - UNLOCK              → { ok }                                (task 02)
 *  - LOCK               → { ok }                                (task 02)
 *  - SESSION_STATUS     → { desbloqueado }                      (task 02)
 *  - PING               → { ok }   (atividade do popup; keep-alive da sessão) (task 21)
 *  - SAVE_MFA           → { ok, mfa? , erro?/erros? }           (task 04)
 *  - LIST_MFAS          → { ok, mfas }   (só metadados)         (task 06)
 *  - GET_CODE           → { ok, codigo, segundosRestantes }     (task 07)
 *  - REVEAL_SECRET      → { ok, secret } (exceção do fluxo de edição) (task 09)
 *  - UPDATE_MFA         → { ok, mfa? , erro?/erros? }           (task 09)
 *  - DELETE_MFA         → { ok, removidos }                     (task 09)
 *  - EXPORT_DATA        → { ok, arquivo } (senha mestra + filtro) (tasks 14/31)
 *  - EXPORT_RESUMO      → { ok, dominios } (o que há p/ exportar)  (task 31)
 *  - IMPORT_DATA        → { ok, importados, contasImportadas }     (tasks 14/31)
 *  - LIST_CONTAS        → { ok, contas } (com e-mail, sem senha) (task 30)
 *  - CONTAS_RESUMO      → { ok, porDominio } (só contagem)       (task 30)
 *  - REVEAL_CONTA       → { ok, email, senha } (só na edição)    (task 30)
 *  - SAVE_CONTA / UPDATE_CONTA / DELETE_CONTA                    (task 30)
 *  - SET_CONTA_PRINCIPAL → { ok, contas }                        (task 30)
 *  - AUTOFILL_LOGIN     → { ok, preencheu } (injeta na aba)      (task 30)
 */
export async function rotear(mensagem) {
  switch (mensagem?.type) {
    case 'IS_INITIALIZED':
      return { inicializado: await sessao.estaInicializado() };

    case 'SET_MASTER_PASSWORD':
      try {
        await sessao.definirSenhaMestra(mensagem.senha);
        return { ok: true };
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }

    case 'UNLOCK':
      return { ok: await sessao.desbloquear(mensagem.senha) };

    case 'LOCK':
      sessao.bloquear();
      return { ok: true };

    case 'SESSION_STATUS':
      return { desbloqueado: sessao.estaDesbloqueado() };

    case 'PING':
      // Atividade vinda do popup (ex.: digitando o segredo no cadastro): conta
      // como interação e mantém a sessão viva. Reforça o keep-alive da porta.
      if (sessao.estaDesbloqueado()) sessao.registrarAtividade();
      return { ok: true };

    case 'SAVE_MFA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      // Defesa em profundidade: revalida no background, sem confiar no popup.
      const validacao = validarCadastro({
        nome: mensagem.nome,
        dominio: mensagem.dominio,
        secret: mensagem.secret,
      });
      if (!validacao.valido) return { ok: false, erros: validacao.erros };
      try {
        const dados = {
          nome: validacao.normalizado.nome,
          dominio: validacao.normalizado.dominio,
          secretEmClaro: validacao.normalizado.secret,
        };
        // Opção sem criptografia: estritamente para localhost (task 26).
        if (mensagem.semCriptografia) {
          if (!ehLocalhost(dados.dominio)) return { ok: false, erro: 'SEM_CRIPTO_SO_LOCALHOST' };
          const registro = await storage.salvarMfaSemCripto(dados);
          return { ok: true, mfa: metadados(registro) };
        }
        const registro = await storage.salvarMfa(dados, chave);
        return { ok: true, mfa: metadados(registro) };
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }
    }

    case 'LIST_MFAS': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const todos = await storage.listarMfas();
      return { ok: true, mfas: todos.map(metadados) };
    }

    case 'GET_CODE': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const mfa = await storage.obterMfa(mensagem.id);
      if (!mfa) return { ok: false, erro: 'NAO_ENCONTRADO' };
      try {
        // O segredo só existe em claro aqui, neste escopo, e nunca sai do
        // background: devolvemos apenas o código de 6 dígitos.
        const segredo = await lerSegredo(mfa, chave);
        const codigo = await gerarTOTP(segredo);
        return { ok: true, codigo, segundosRestantes: segundosRestantes(Date.now()) };
      } catch {
        return { ok: false, erro: 'FALHA_CODIGO' };
      }
    }

    case 'REVEAL_SECRET': {
      // Exceção deliberada da arquitetura (ia/02): só o fluxo de edição (task 09)
      // recebe o segredo em claro, de forma pontual, para popular o formulário.
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const mfa = await storage.obterMfa(mensagem.id);
      if (!mfa) return { ok: false, erro: 'NAO_ENCONTRADO' };
      try {
        const secret = await lerSegredo(mfa, chave);
        return { ok: true, secret };
      } catch {
        return { ok: false, erro: 'FALHA' };
      }
    }

    // --- Fluxo localhost SEM senha mestra (task 26): só MFAs de localhost sem
    // --- criptografia. Estritamente isolado; nada mais funciona sem desbloquear.
    case 'LIST_LOCALHOST': {
      if (!ehLocalhost(mensagem.dominio)) return { ok: true, mfas: [] };
      const todos = await storage.listarMfas();
      const locais = todos.filter(
        (m) => m.semCriptografia === true && m.dominio === mensagem.dominio && ehLocalhost(m.dominio),
      );
      return { ok: true, mfas: locais.map(metadados) };
    }

    case 'GET_CODE_LOCALHOST': {
      const mfa = await storage.obterMfa(mensagem.id);
      // Só gera para registros de localhost SEM criptografia — nunca toca em
      // segredo criptografado ou de outro domínio sem a senha mestra.
      if (!mfa || mfa.semCriptografia !== true || !ehLocalhost(mfa.dominio)) {
        return { ok: false, erro: 'NAO_PERMITIDO' };
      }
      try {
        const codigo = await gerarTOTP(mfa.secretEmClaro);
        return { ok: true, codigo, segundosRestantes: segundosRestantes(Date.now()) };
      } catch {
        return { ok: false, erro: 'FALHA_CODIGO' };
      }
    }

    case 'UPDATE_MFA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const validacao = validarCadastro({
        nome: mensagem.nome,
        dominio: mensagem.dominio,
        secret: mensagem.secret,
      });
      if (!validacao.valido) return { ok: false, erros: validacao.erros };
      const mfa = await storage.obterMfa(mensagem.id);
      if (!mfa) return { ok: false, erro: 'NAO_ENCONTRADO' };
      try {
        // Registro sem criptografia (localhost) preserva o modo enquanto o
        // domínio continuar localhost; segue em claro.
        if (mfa.semCriptografia) {
          if (ehLocalhost(validacao.normalizado.dominio)) {
            const atualizado = await storage.atualizarMfaSemCripto(mensagem.id, {
              nome: validacao.normalizado.nome,
              dominio: validacao.normalizado.dominio,
              secretEmClaro: validacao.normalizado.secret,
            });
            return { ok: true, mfa: metadados(atualizado) };
          }
          // O domínio deixou de ser localhost: não é mais permitido ficar em
          // claro, então converte para criptografado (uma via só: sem-cripto
          // → criptografado). O sentido contrário continua exigindo excluir e
          // recadastrar, pois a opção sem-cripto é uma escolha deliberada na
          // criação.
          const { ciphertext, iv } = await cripto.criptografar(validacao.normalizado.secret, chave);
          const atualizado = await storage.converterMfaParaCriptografado(mensagem.id, {
            nome: validacao.normalizado.nome,
            dominio: validacao.normalizado.dominio,
            secretCriptografado: ciphertext,
            iv,
          });
          return { ok: true, mfa: metadados(atualizado) };
        }

        const dadosNovos = {
          nome: validacao.normalizado.nome,
          dominio: validacao.normalizado.dominio,
        };
        // Só recriptografa (novo IV) se o segredo realmente mudou.
        const original = await cripto.descriptografar(mfa.secretCriptografado, mfa.iv, chave);
        if (segredoFoiAlterado(original, validacao.normalizado.secret)) {
          const { ciphertext, iv } = await cripto.criptografar(
            validacao.normalizado.secret,
            chave,
          );
          dadosNovos.secretCriptografado = ciphertext;
          dadosNovos.iv = iv;
        }
        const atualizado = await storage.atualizarMfa(mensagem.id, dadosNovos);
        return { ok: true, mfa: metadados(atualizado) };
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }
    }

    case 'DELETE_MFA': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const removidos = await storage.removerMfa(mensagem.id);
      return { ok: true, removidos };
    }

    /* ------------- contas do site: e-mail + senha por domínio (task 30) -------------
     * A senha do site só sai daqui em REVEAL_CONTA (fluxo de edição, mesma
     * exceção deliberada do REVEAL_SECRET) e no autopreenchimento, que injeta
     * direto na aba a partir do background — o popup nunca a recebe. */

    case 'LIST_CONTAS': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const dominio = normalizarDominio(mensagem.dominio);
      const contas =
        dominio === null ? await storage.listarContas() : await storage.listarContasPorDominio(dominio);
      return { ok: true, contas: await listaDeMetadadosConta(contas, chave) };
    }

    case 'CONTAS_RESUMO': {
      // Só contagem por domínio — não decripta nada. Alimenta o ícone dos cards.
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      return { ok: true, porDominio: await storage.contarContasPorDominio() };
    }

    case 'REVEAL_CONTA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const conta = await storage.obterConta(mensagem.id);
      if (!conta) return { ok: false, erro: 'NAO_ENCONTRADO' };
      try {
        const { email, senha } = await lerCredenciais(conta, chave);
        return { ok: true, email, senha };
      } catch {
        return { ok: false, erro: 'FALHA' };
      }
    }

    case 'SAVE_CONTA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      // Defesa em profundidade: revalida no background, sem confiar no popup.
      const validacao = validarConta({
        dominio: mensagem.dominio,
        email: mensagem.email,
        senha: mensagem.senha,
        rotulo: mensagem.rotulo,
      });
      if (!validacao.valido) return { ok: false, erros: validacao.erros };
      try {
        const dados = { ...validacao.normalizado, principal: mensagem.principal === true };
        // Opção sem criptografia: estritamente para localhost (task 26).
        if (mensagem.semCriptografia) {
          if (!ehLocalhost(dados.dominio)) return { ok: false, erro: 'SEM_CRIPTO_SO_LOCALHOST' };
          const conta = await storage.salvarContaSemCripto(dados);
          return { ok: true, conta: await metadadosConta(conta, chave) };
        }
        const conta = await storage.salvarConta(dados, chave);
        return { ok: true, conta: await metadadosConta(conta, chave) };
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }
    }

    case 'UPDATE_CONTA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      // Senha em branco na edição = manter a atual (não exige o campo).
      const validacao = validarConta(
        {
          dominio: mensagem.dominio,
          email: mensagem.email,
          senha: mensagem.senha,
          rotulo: mensagem.rotulo,
        },
        { exigirSenha: false },
      );
      if (!validacao.valido) return { ok: false, erros: validacao.erros };
      const atual = await storage.obterConta(mensagem.id);
      if (!atual) return { ok: false, erro: 'NAO_ENCONTRADO' };
      try {
        const dados = { ...validacao.normalizado, principal: mensagem.principal === true };
        let conta;
        if (atual.semCriptografia) {
          // Segue em claro enquanto o domínio for localhost; ao sair de
          // localhost, converte para criptografada (conversão de mão única).
          conta = ehLocalhost(dados.dominio)
            ? await storage.atualizarContaSemCripto(mensagem.id, dados)
            : await storage.converterContaParaCriptografada(mensagem.id, dados, chave);
        } else {
          conta = await storage.atualizarConta(mensagem.id, dados, chave);
        }
        return { ok: true, conta: await metadadosConta(conta, chave) };
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }
    }

    case 'SET_CONTA_PRINCIPAL': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const conta = await storage.definirContaPrincipal(mensagem.id);
      if (!conta) return { ok: false, erro: 'NAO_ENCONTRADO' };
      const doDominio = await storage.listarContasPorDominio(conta.dominio);
      return { ok: true, contas: await listaDeMetadadosConta(doDominio, chave) };
    }

    case 'DELETE_CONTA': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const removidos = await storage.removerConta(mensagem.id);
      return { ok: true, removidos };
    }

    case 'LIST_CONTAS_LOCALHOST': {
      // Fluxo localhost SEM senha mestra: só contas sem criptografia daquele
      // host local. Nunca toca em conta criptografada nem de outro domínio.
      if (!ehLocalhost(mensagem.dominio)) return { ok: true, contas: [] };
      const todas = await storage.listarContas();
      const locais = todas.filter(
        (c) =>
          c.semCriptografia === true && c.dominio === mensagem.dominio && ehLocalhost(c.dominio),
      );
      return { ok: true, contas: await listaDeMetadadosConta(locais, null) };
    }

    case 'AUTOFILL_LOGIN': {
      // A senha vai do background direto para a aba — o popup só pede.
      // `habilitado` governa TANTO a ação automática ao abrir QUANTO o clique
      // manual no ícone do card: diferente da autocópia do código (que só
      // copia para a área de transferência, sem tocar na página), preencher
      // login ESCREVE a senha no DOM da página — qualquer script ali presente
      // pode lê-la. Por isso não há bypass "manual" aqui: com a opção
      // desligada, nenhum caminho preenche, nem automático nem por clique.
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const config = normalizarConfigAutofill(
        (await storage.obterConfigAutofill()) ?? AUTOFILL_PADRAO,
      );
      if (!config.login.habilitado) {
        return { ok: false, erro: 'DESABILITADO' };
      }
      const dominio = normalizarDominio(mensagem.dominio);
      if (dominio === null) return { ok: false, erro: 'SEM_DOMINIO' };
      const contas = await storage.listarContasPorDominio(dominio);
      return preencherLoginNaAba({
        conta: escolherConta(contas, mensagem.contaId),
        chave,
        tabId: mensagem.tabId,
        config,
      });
    }

    case 'AUTOFILL_LOGIN_LOCALHOST': {
      // Fluxo localhost sem senha mestra: só contas sem criptografia do host
      // local — mesmo guard duplo do LIST_CONTAS_LOCALHOST. Mesma regra do
      // caso acima: sem bypass manual, `habilitado` governa os dois caminhos.
      if (!ehLocalhost(mensagem.dominio)) return { ok: false, erro: 'NAO_PERMITIDO' };
      const config = normalizarConfigAutofill(
        (await storage.obterConfigAutofill()) ?? AUTOFILL_PADRAO,
      );
      if (!config.login.habilitado) {
        return { ok: false, erro: 'DESABILITADO' };
      }
      const todas = await storage.listarContas();
      const locais = todas.filter(
        (c) =>
          c.semCriptografia === true && c.dominio === mensagem.dominio && ehLocalhost(c.dominio),
      );
      return preencherLoginNaAba({
        conta: escolherConta(locais, mensagem.contaId),
        chave: null,
        tabId: mensagem.tabId,
        config,
      });
    }

    case 'EXPORT_DATA': {
      // Exportar é o momento em que TUDO existe em claro na memória: por isso
      // exige a senha mestra de novo (reautenticação, com o mesmo rate limiting
      // do desbloqueio), além da senha que criptografa o arquivo.
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      if (!mensagem.senha) return { ok: false, erro: 'SENHA_OBRIGATORIA' };
      if (!mensagem.senhaMestra) return { ok: false, erro: 'SENHA_MESTRA_OBRIGATORIA' };
      if (!(await sessao.verificarSenhaMestra(mensagem.senhaMestra))) {
        return { ok: false, erro: 'SENHA_MESTRA_INCORRETA' };
      }
      try {
        // Descriptografa localmente e reembala no arquivo, que é criptografado
        // com a senha de exportação. Nada em claro vai ao arquivo.
        const filtro = normalizarFiltroExport(mensagem.filtro);
        // Defesa em profundidade: o popup já impede confirmar sem nenhum site
        // marcado, mas o background (que não deve confiar só na UI) recusa um
        // arquivo vazio da mesma forma — `dominios: []` é uma seleção
        // explicitamente vazia, diferente de `null` ("todos os sites").
        if (
          Array.isArray(filtro.dominios) &&
          filtro.dominios.length === 0 &&
          (filtro.incluirMfas || filtro.incluirContas)
        ) {
          return { ok: false, erro: 'NENHUM_SITE_SELECIONADO' };
        }
        const mfas = [];
        if (filtro.incluirMfas) {
          for (const mfa of await storage.listarMfas()) {
            if (!dominioSelecionado(filtro, mfa.dominio)) continue;
            mfas.push({
              nome: mfa.nome,
              dominio: mfa.dominio,
              secret: await lerSegredo(mfa, chave),
              semCriptografia: mfa.semCriptografia === true,
            });
          }
        }
        const contas = [];
        if (filtro.incluirContas) {
          for (const conta of await storage.listarContas()) {
            if (!dominioSelecionado(filtro, conta.dominio)) continue;
            const credenciais = await lerCredenciais(conta, chave);
            contas.push({
              dominio: conta.dominio,
              rotulo: conta.rotulo ?? null,
              email: credenciais.email,
              senha: credenciais.senha,
              principal: conta.principal === true,
              semCriptografia: conta.semCriptografia === true,
            });
          }
        }
        const configuracoes = filtro.incluirConfig ? await coletarConfiguracoes() : null;
        const arquivo = await exportarDados({ mfas, contas, configuracoes }, mensagem.senha);
        return { ok: true, arquivo, exportados: { mfas: mfas.length, contas: contas.length } };
      } catch {
        // Código estável (nunca a mensagem interna da exceção) — mesma
        // disciplina do IMPORT_DATA: a UI já mapeia só os códigos conhecidos.
        return { ok: false, erro: 'FALHA_EXPORTACAO' };
      }
    }

    case 'EXPORT_RESUMO': {
      // O que existe para exportar, por domínio — só metadados (nome do domínio
      // e contagens). Alimenta a seleção de domínios da tela de backup.
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const porDominio = new Map();
      const entrada = (dominio) => {
        const chaveMapa = dominio ?? null;
        if (!porDominio.has(chaveMapa)) porDominio.set(chaveMapa, { dominio: chaveMapa, mfas: 0, contas: 0 });
        return porDominio.get(chaveMapa);
      };
      for (const mfa of await storage.listarMfas()) entrada(mfa.dominio).mfas += 1;
      for (const conta of await storage.listarContas()) entrada(conta.dominio).contas += 1;
      return { ok: true, dominios: [...porDominio.values()] };
    }

    case 'IMPORT_DATA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      try {
        const { mfas, contas, configuracoes } = await importarDados(
          mensagem.arquivo,
          mensagem.senha,
        );
        // Re-criptografa cada registro com a chave local e acrescenta ao cofre.
        // Cada item passa pela MESMA validação/normalização do cadastro manual
        // (defesa em profundidade: um backup editado à mão, ou de um formato
        // futuro de terceiros, não pode gravar um domínio com grafia divergente
        // da usada nos filtros — que comparam string exata — nem um segredo em
        // formato inválido).
        let importados = 0;
        for (const reg of mfas) {
          const validacao = validarCadastro({
            nome: reg?.nome,
            dominio: reg?.dominio,
            secret: reg?.secret,
          });
          if (!validacao.valido) continue;
          const dados = {
            nome: validacao.normalizado.nome,
            dominio: validacao.normalizado.dominio,
            secretEmClaro: validacao.normalizado.secret,
          };
          // Preserva o modo sem criptografia só se ainda for localhost.
          if (reg.semCriptografia && ehLocalhost(dados.dominio)) {
            await storage.salvarMfaSemCripto(dados);
          } else {
            await storage.salvarMfa(dados, chave);
          }
          importados += 1;
        }

        // Contas: `principal: false` deixa a decisão para a invariante do
        // storage — se o domínio ainda não tem principal, a importada vira a
        // principal; se já tem, a que estava aqui continua sendo.
        let contasImportadas = 0;
        for (const reg of contas) {
          const validacao = validarConta({
            dominio: reg?.dominio,
            email: reg?.email,
            senha: reg?.senha,
            rotulo: reg?.rotulo,
          });
          if (!validacao.valido) continue;
          const dados = {
            dominio: validacao.normalizado.dominio,
            rotulo: validacao.normalizado.rotulo,
            email: validacao.normalizado.email,
            senha: validacao.normalizado.senha,
            principal: false,
          };
          if (reg.semCriptografia && ehLocalhost(dados.dominio)) {
            await storage.salvarContaSemCripto(dados);
          } else {
            await storage.salvarConta(dados, chave);
          }
          contasImportadas += 1;
        }

        let configImportada = false;
        if (mensagem.importarConfig && configuracoes) {
          await aplicarConfiguracoes(configuracoes);
          configImportada = true;
        }
        return { ok: true, importados, contasImportadas, configImportada };
      } catch {
        return { ok: false, erro: 'SENHA_OU_ARQUIVO_INVALIDO' };
      }
    }

    case 'GET_CONFIG': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      const rateLimit = normalizarConfigRateLimit(
        (await storage.obterConfigRateLimit()) ?? RATE_LIMIT_PADRAO,
      );
      const autofill = normalizarConfigAutofill(
        (await storage.obterConfigAutofill()) ?? AUTOFILL_PADRAO,
      );
      const sessaoTimeoutMs = normalizarTimeout(
        (await storage.obterTimeoutSessao()) ?? TIMEOUT_PADRAO_MS,
      );
      const autocopiar = await storage.obterAutocopiar();
      return { ok: true, rateLimit, autofill, sessaoTimeoutMs, autocopiar };
    }

    case 'GET_CONFIG_PUBLICO': {
      // Config NÃO sensível necessária para as ações "ao abrir" (autocópia/
      // autopreenchimento) no fluxo localhost sem senha mestra (task 28). NÃO
      // exige sessão e NÃO expõe nada secreto: só os flags de autocópia e a
      // config de autofill (seletores CSS / mapa de domínios). Nunca toca em
      // segredo, chave, salt nem valor de controle.
      const autofill = normalizarConfigAutofill(
        (await storage.obterConfigAutofill()) ?? AUTOFILL_PADRAO,
      );
      const autocopiar = await storage.obterAutocopiar();
      return { ok: true, autocopiar, autofill };
    }

    case 'SET_AUTOCOPY': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      await storage.salvarAutocopiar(mensagem.habilitado);
      return { ok: true, autocopiar: Boolean(mensagem.habilitado) };
    }

    case 'SET_SESSION_TIMEOUT': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const ms = normalizarTimeout(mensagem.ms);
      await storage.salvarTimeoutSessao(ms);
      sessao.definirTimeoutMs(ms); // aplica já na sessão atual
      return { ok: true, sessaoTimeoutMs: ms };
    }

    case 'SET_RATE_LIMIT': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const config = normalizarConfigRateLimit(mensagem.config ?? {});
      await storage.salvarConfigRateLimit(config);
      return { ok: true, rateLimit: config };
    }

    case 'SET_AUTOFILL': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      sessao.registrarAtividade();
      const config = normalizarConfigAutofill(mensagem.config ?? {});
      await storage.salvarConfigAutofill(config);
      return { ok: true, autofill: config };
    }

    case 'CHANGE_MASTER_PASSWORD': {
      if (!sessao.estaDesbloqueado()) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      return sessao.trocarSenhaMestra(mensagem.senhaAtual, mensagem.senhaNova);
    }

    default:
      return { ok: false, erro: `Mensagem desconhecida: ${mensagem?.type}` };
  }
}

// Registro dos listeners (no topo, síncrono). Os guards `?.` permitem importar
// este módulo nos testes/Node, onde `browser` não existe.
globalThis.browser?.runtime?.onMessage.addListener((mensagem) => rotear(mensagem));

// Keep-alive da sessão (task 21): o popup abre uma porta de longa duração ao
// carregar. Enquanto ela estiver conectada, a sessão não expira por inatividade —
// o usuário pode demorar preenchendo um cadastro. Ao fechar o popup, a porta
// desconecta e a janela de inatividade recomeça do zero.
globalThis.browser?.runtime?.onConnect.addListener((porta) => {
  if (porta.name !== 'popup-keepalive') return;
  sessao.marcarPopupAberto();
  porta.onDisconnect.addListener(() => sessao.marcarPopupFechado());
});

globalThis.browser?.alarms?.onAlarm.addListener((alarme) => {
  if (alarme.name === sessao.NOME_ALARME) sessao.bloquear();
});

// Migração de schema na inicialização (task 11): grava a versão atual e aplica
// migrações futuras antes de qualquer leitura/escrita de dados. Idempotente.
if (globalThis.browser?.storage) {
  storage.migrarSeNecessario();
}
