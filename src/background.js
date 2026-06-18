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
import { validarCadastro } from './cadastro.js';

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
 *
 * Tipos LIST_MFAS / GET_CODE / REVEAL_SECRET chegam nas tasks seguintes
 * (06, 07, 09).
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
