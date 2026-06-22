/*
 * Harness de teste do autopreenchimento (vanilla JS, sem framework, sem rede).
 *
 * Cada página de exemplo tem um elemento marcado com [data-area-teste] contendo
 * os <input> de um formato de OTP. Este script:
 *   - conta os eventos `input` e `change` (que a extensão dispara ao preencher);
 *   - faz auto-avanço de foco em caixas de 1 dígito (UX para teste manual);
 *   - captura o Enter (keydown) e o submit do formulário — que é como a
 *     extensão "envia" o formulário — e abre um modal mostrando o resultado;
 *   - liga os botões "Limpar" e "Copiar seletor".
 *
 * O modal é montado via DOM API + textContent (nunca innerHTML), seguindo a
 * mesma regra de sanitização do projeto.
 */

(function () {
  'use strict';

  const area = document.querySelector('[data-area-teste]');
  if (!area) return;

  const inputs = Array.from(area.querySelectorAll('input'));
  let contagemInput = 0;
  let contagemChange = 0;
  let jaAbriu = false;

  // --- Contadores de eventos (evidência de que a extensão tocou nos campos) ---
  area.addEventListener('input', () => {
    contagemInput += 1;
  });
  area.addEventListener('change', () => {
    contagemChange += 1;
  });

  // --- Auto-avanço de foco em caixas de 1 dígito (só ajuda o teste manual) ---
  inputs.forEach((input, indice) => {
    if (input.maxLength !== 1) return;

    input.addEventListener('input', () => {
      if (input.value.length >= 1 && indice < inputs.length - 1) {
        inputs[indice + 1].focus();
      }
    });
    input.addEventListener('keydown', (evento) => {
      if (evento.key === 'Backspace' && input.value === '' && indice > 0) {
        inputs[indice - 1].focus();
      }
    });
  });

  // --- Captura do Enter e do submit ---
  // A extensão dispara KeyboardEvent('Enter') no último campo; um humano também
  // pode enviar pelo submit do formulário. Os dois caminhos abrem o modal.
  inputs.forEach((input) => {
    input.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        abrirResultado('Enter (keydown) no campo');
      }
    });
  });

  const formulario = area.tagName === 'FORM' ? area : area.querySelector('form');
  if (formulario) {
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      abrirResultado('Envio do formulário (submit)');
    });
  }

  // --- Montagem do modal (uma vez) ---
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal';

  const titulo = document.createElement('h2');
  titulo.className = 'modal-titulo';
  modal.appendChild(titulo);

  const codigoEl = document.createElement('div');
  codigoEl.className = 'modal-codigo';
  modal.appendChild(codigoEl);

  const detalhes = document.createElement('ul');
  detalhes.className = 'modal-detalhes';
  modal.appendChild(detalhes);

  const rodapeModal = document.createElement('div');
  rodapeModal.className = 'modal-rodape';
  const btnFechar = document.createElement('button');
  btnFechar.type = 'button';
  btnFechar.className = 'btn btn-accent';
  btnFechar.textContent = 'Fechar';
  rodapeModal.appendChild(btnFechar);
  modal.appendChild(rodapeModal);

  fundo.appendChild(modal);
  document.body.appendChild(fundo);

  function linhaDetalhe(rotulo, valor) {
    const li = document.createElement('li');
    const r = document.createElement('span');
    r.className = 'rotulo';
    r.textContent = rotulo;
    const v = document.createElement('span');
    v.className = 'valor';
    v.textContent = valor;
    li.append(r, v);
    return li;
  }

  function abrirResultado(origem) {
    if (jaAbriu) return; // evita reabrir com keydown + submit no mesmo gesto
    jaAbriu = true;

    const valores = inputs.map((i) => i.value.trim());
    const montado = valores.join('');
    const preenchidos = valores.filter((v) => v !== '').length;
    const seisDigitos = /^\d{6}$/.test(montado);

    titulo.textContent = seisDigitos ? '✅ Código de 6 dígitos recebido' : '⚠️ Enter recebido';
    codigoEl.textContent = montado === '' ? '(vazio)' : montado;

    detalhes.textContent = '';
    detalhes.appendChild(linhaDetalhe('Disparado por', origem));
    detalhes.appendChild(linhaDetalhe('Inputs na página', String(inputs.length)));
    detalhes.appendChild(linhaDetalhe('Campos preenchidos', `${preenchidos} de ${inputs.length}`));
    detalhes.appendChild(linhaDetalhe('Eventos input', String(contagemInput)));
    detalhes.appendChild(linhaDetalhe('Eventos change', String(contagemChange)));
    if (inputs.length > 1) {
      detalhes.appendChild(linhaDetalhe('Por caixa', valores.map((v) => v || '·').join(' ')));
    }

    fundo.setAttribute('data-aberto', 'true');
    btnFechar.focus();
  }

  function fecharResultado() {
    fundo.removeAttribute('data-aberto');
    jaAbriu = false;
  }

  btnFechar.addEventListener('click', fecharResultado);
  fundo.addEventListener('click', (evento) => {
    if (evento.target === fundo) fecharResultado();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && fundo.getAttribute('data-aberto') === 'true') {
      fecharResultado();
    }
  });

  // --- Botão "Limpar" ---
  const btnLimpar = document.querySelector('[data-limpar]');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      inputs.forEach((i) => {
        i.value = '';
      });
      contagemInput = 0;
      contagemChange = 0;
      if (inputs[0]) inputs[0].focus();
    });
  }

  // --- Botão "Copiar seletor" ---
  document.querySelectorAll('[data-copiar]').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const texto = botao.getAttribute('data-copiar');
      const rotuloOriginal = botao.textContent;
      try {
        await navigator.clipboard.writeText(texto);
        botao.textContent = 'Copiado ✓';
      } catch {
        botao.textContent = 'Copie manualmente';
      }
      setTimeout(() => {
        botao.textContent = rotuloOriginal;
      }, 1400);
    });
  });
})();
