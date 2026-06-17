# 06 — Geração de código TOTP e cronômetro

## Objetivo

Gerar o código TOTP de 6 dígitos a partir do segredo descriptografado em memória, e exibir um
cronômetro visual sincronizado com a janela de validade de 30 segundos do código.

## Por que / contexto

É o núcleo funcional do produto (o "M" de MFA em si) e também o ponto mais sensível em termos
de segurança: o segredo só existe em claro durante o instante de geração do código, em
memória, nunca tocando o disco.

## Escopo

**Entra:**
- Descriptografar o `secretCriptografado` de um MFA (usando a chave em memória da task 02) só
  no momento de gerar o código — nunca antes, nunca armazenado descriptografado em
  variáveis de longa duração.
- Implementar/integrar o algoritmo TOTP (RFC 6238) usando a lib leve escolhida, gerando o
  código de 6 dígitos a partir do segredo Base32 e do timestamp atual.
- Cronômetro visual (ex: barra de progresso ou contador numérico) mostrando quanto tempo
  falta até o código atual expirar (janela de 30s, sincronizada com `Math.floor(Date.now() /
  1000 / 30)`).
- Regenerar automaticamente o código quando a janela de 30s expira, sem precisar fechar e
  reabrir o popup.

**Não entra:**
- UI completa do card (task 07) — aqui é só a lógica de geração de código + cronômetro,
  exposta como uma função/componente que a task 07 consome.

## Decisões técnicas

- Lib leve e auditada para TOTP, evitando reimplementar HMAC-SHA1 e o algoritmo manualmente
  (reduz risco de bugs sutis). Critério de escolha: pequena, sem dependências transitivas
  problemáticas, compatível com ES modules/ambiente de extensão (sem `Node.js` específico).
- Sincronizar a janela de 30s com o relógio do sistema (não com o momento em que o popup foi
  aberto), para que o código bata com o de outros geradores (ex: app do banco) e com o tempo
  de expiração visualmente coerente.
- O timer de atualização do cronômetro na UI pode usar `setInterval` de 1s apenas enquanto o
  popup estiver aberto (popups de extensão são fechados quando perdem foco, então não há
  necessidade de lógica de background para isso).
- A descriptografia do segredo para gerar o código deve acontecer a cada vez que o código for
  exibido/regenerado — ou, como otimização aceitável, manter o segredo em claro em uma
  variável de escopo local enquanto aquele card estiver na tela, descartando ao trocar de
  tela/fechar o popup (nunca persistir, nunca logar).

## Dependências

- Task 02 (criptografia) — fornece `descriptografar`.
- Task 03 (modelo de dados) — fornece o registro do MFA com o segredo criptografado.

## Critérios de aceite (teste manual)

1. Cadastrar um MFA de teste com um segredo conhecido (ex: gerado por uma ferramenta de
   referência TOTP) e confirmar que o código gerado pelo plug-in é idêntico ao gerado por
   essa ferramenta de referência no mesmo instante.
2. O cronômetro mostra corretamente o tempo restante até a próxima janela de 30s.
3. Ao esgotar o tempo, o código muda automaticamente sem nenhuma ação do usuário.
4. Inspecionar memória/variáveis durante o uso (via DevTools) confirma que o segredo em claro
   não fica acessível fora do escopo esperado, e nunca aparece em `console.log`.

## Testes automatizados

- Testes unitários do gerador de código TOTP usando os **vetores de teste oficiais do RFC
  6238** (segredos e timestamps conhecidos com o código esperado), garantindo conformidade
  com a especificação.
- Teste da função de cálculo de tempo restante na janela de 30s, dado um timestamp arbitrário.

## Riscos / pontos de atenção de segurança

- Nunca expor o segredo em claro em qualquer log, mensagem de erro, ou estado persistido
  (ex: não guardar em `browser.storage`, nem em `localStorage`).
- Atenção ao "drift" de relógio: se o relógio do sistema do usuário estiver muito errado, o
  código gerado não vai bater com o do serviço de destino — isso é uma limitação inerente ao
  TOTP, não um bug do plug-in, mas vale deixar documentado.
