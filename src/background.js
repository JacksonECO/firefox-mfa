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
import { gerarTOTP, segundosRestantes } from './totp.js';
import { exportarDados, importarDados } from './backup.js';
import { normalizarConfigRateLimit, RATE_LIMIT_PADRAO } from './ratelimit.js';
import { normalizarConfigAutofill, AUTOFILL_PADRAO } from './autofill.js';

/** Extrai só os metadados não sensíveis de um registro (nunca o segredo). */
function metadados(mfa) {
  return {
    id: mfa.id,
    nome: mfa.nome,
    dominio: mfa.dominio,
    createdAt: mfa.createdAt,
    updatedAt: mfa.updatedAt,
  };
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
 *  - SAVE_MFA           → { ok, mfa? , erro?/erros? }           (task 04)
 *  - LIST_MFAS          → { ok, mfas }   (só metadados)         (task 06)
 *  - GET_CODE           → { ok, codigo, segundosRestantes }     (task 07)
 *  - REVEAL_SECRET      → { ok, secret } (exceção do fluxo de edição) (task 09)
 *  - UPDATE_MFA         → { ok, mfa? , erro?/erros? }           (task 09)
 *  - DELETE_MFA         → { ok, removidos }                     (task 09)
 *  - EXPORT_DATA        → { ok, arquivo }                       (task 14)
 *  - IMPORT_DATA        → { ok, importados }                    (task 14)
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
        const registro = await storage.salvarMfa(
          {
            nome: validacao.normalizado.nome,
            dominio: validacao.normalizado.dominio,
            secretEmClaro: validacao.normalizado.secret,
          },
          chave,
        );
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
        const segredo = await cripto.descriptografar(mfa.secretCriptografado, mfa.iv, chave);
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
        const secret = await cripto.descriptografar(mfa.secretCriptografado, mfa.iv, chave);
        return { ok: true, secret };
      } catch {
        return { ok: false, erro: 'FALHA' };
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

    case 'EXPORT_DATA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      if (!mensagem.senha) return { ok: false, erro: 'SENHA_OBRIGATORIA' };
      try {
        // Descriptografa cada segredo localmente e reembala no arquivo, que é
        // criptografado com a senha de exportação. Nada em claro vai ao arquivo.
        const todos = await storage.listarMfas();
        const registros = [];
        for (const mfa of todos) {
          const secret = await cripto.descriptografar(mfa.secretCriptografado, mfa.iv, chave);
          registros.push({ nome: mfa.nome, dominio: mfa.dominio, secret });
        }
        const arquivo = await exportarDados(registros, mensagem.senha);
        return { ok: true, arquivo };
      } catch (erro) {
        return { ok: false, erro: erro.message };
      }
    }

    case 'IMPORT_DATA': {
      const chave = sessao.obterChave();
      if (!chave) return { ok: false, erro: 'SESSAO_BLOQUEADA' };
      try {
        const registros = await importarDados(mensagem.arquivo, mensagem.senha);
        // Re-criptografa cada registro com a chave local e acrescenta ao cofre.
        let importados = 0;
        for (const reg of registros) {
          if (!reg?.nome || !reg?.secret) continue;
          await storage.salvarMfa(
            { nome: reg.nome, dominio: reg.dominio ?? null, secretEmClaro: reg.secret },
            chave,
          );
          importados += 1;
        }
        return { ok: true, importados };
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
      return { ok: true, rateLimit, autofill };
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

globalThis.browser?.alarms?.onAlarm.addListener((alarme) => {
  if (alarme.name === sessao.NOME_ALARME) sessao.bloquear();
});

// Migração de schema na inicialização (task 11): grava a versão atual e aplica
// migrações futuras antes de qualquer leitura/escrita de dados. Idempotente.
if (globalThis.browser?.storage) {
  storage.migrarSeNecessario();
}
