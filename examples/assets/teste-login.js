/*
 * Harness de teste do autopreenchimento de LOGIN (e-mail/usuário + senha).
 * Vanilla JS, sem framework, sem rede — irmão do teste-mfa.js.
 *
 * Marca a página com [data-area-login] e mostra, num modal, o que a extensão
 * escreveu: qual campo virou usuário, quantos eventos input/change chegaram e
 * se a escrita usou o *setter nativo* de `value` (o caminho que formulários
 * controlados por framework reconhecem) ou uma atribuição direta.
 *
 * A senha aparece SEMPRE mascarada (tamanho + primeiro caractere): a página é
 * só um alvo de teste, não precisa exibir a senha em claro.
 *
 * Modal montado via DOM API + textContent (nunca innerHTML).
 */

(function () {
  'use strict';

  const area = document.querySelector('[data-area-login]');
  if (!area) return;

  const campoUsuario = area.querySelector('[data-campo="usuario"]');
  const campoSenha = area.querySelector('[data-campo="senha"]');
  let contagemInput = 0;
  let contagemChange = 0;
  let jaAbriu = false;

  area.addEventListener('input', () => {
    contagemInput += 1;
  });
  area.addEventListener('change', () => {
    contagemChange += 1;
  });

  // Espiona COMO cada campo foi escrito, sem impedir a escrita: uma propriedade
  // própria encobre o acessor do protótipo. Atribuição direta (`el.value = x`)
  // cai aqui; o setter nativo, usado pela extensão, passa por baixo e não é
  // registrado — é assim que distinguimos os dois caminhos.
  const escritasDiretas = new Set();
  const nativo = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  [campoUsuario, campoSenha].forEach((campo) => {
    if (!campo) return;
    Object.defineProperty(campo, 'value', {
      configurable: true,
      get() {
        return nativo.get.call(campo);
      },
      set(valor) {
        escritasDiretas.add(campo);
        nativo.set.call(campo, valor);
      },
    });
  });

  const formulario = area.tagName === 'FORM' ? area : area.querySelector('form');
  if (formulario) {
    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      abrirResultado('Envio do formulário (submit)');
    });
  }
  area.querySelectorAll('input').forEach((input) => {
    input.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        abrirResultado('Enter (keydown) no campo');
      }
    });
  });

  const btnVerificar = document.querySelector('[data-verificar]');
  if (btnVerificar) {
    btnVerificar.addEventListener('click', () => abrirResultado('Clique em "Verificar"'));
  }

  /* ------------------------------- modal ------------------------------- */

  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');

  const modal = document.createElement('div');
  modal.className = 'modal';

  const titulo = document.createElement('h2');
  titulo.className = 'modal-titulo';
  modal.appendChild(titulo);

  const destaque = document.createElement('div');
  destaque.className = 'modal-codigo';
  modal.appendChild(destaque);

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

  function mascarar(valor) {
    if (valor === '') return '(vazio)';
    return `${valor[0]}${'•'.repeat(Math.max(valor.length - 1, 1))} (${valor.length} caracteres)`;
  }

  function comoFoiEscrito(campo) {
    if (!campo || campo.value === '') return 'não preenchido';
    return escritasDiretas.has(campo)
      ? 'atribuição direta (frameworks podem ignorar)'
      : 'setter nativo de value ✓';
  }

  function abrirResultado(origem) {
    if (jaAbriu) return;
    jaAbriu = true;

    const usuario = campoUsuario ? campoUsuario.value.trim() : '';
    const senha = campoSenha ? campoSenha.value : '';
    const completo = usuario !== '' && senha !== '';

    titulo.textContent = completo ? '✅ Login preenchido' : '⚠️ Preenchimento parcial';
    destaque.textContent = usuario === '' ? '(sem usuário)' : usuario;

    detalhes.textContent = '';
    detalhes.appendChild(linhaDetalhe('Disparado por', origem));
    detalhes.appendChild(linhaDetalhe('Usuário / e-mail', usuario === '' ? '(vazio)' : usuario));
    detalhes.appendChild(linhaDetalhe('Senha', mascarar(senha)));
    detalhes.appendChild(linhaDetalhe('Escrita do usuário', comoFoiEscrito(campoUsuario)));
    detalhes.appendChild(linhaDetalhe('Escrita da senha', comoFoiEscrito(campoSenha)));
    detalhes.appendChild(linhaDetalhe('Eventos input', String(contagemInput)));
    detalhes.appendChild(linhaDetalhe('Eventos change', String(contagemChange)));

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

  const btnLimpar = document.querySelector('[data-limpar]');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      [campoUsuario, campoSenha].forEach((campo) => {
        if (campo) campo.value = '';
      });
      escritasDiretas.clear();
      contagemInput = 0;
      contagemChange = 0;
      if (campoUsuario) campoUsuario.focus();
    });
  }

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
