# 05 — Tela de desbloqueio

## Objetivo

Implementar a tela exibida sempre que o popup abre e não há uma chave de criptografia válida
em memória: cadastro da senha mestra no primeiro acesso, ou validação da senha mestra nos
acessos seguintes.

## Por que / contexto

É a porta de entrada do app e a primeira linha de defesa do diferencial de segurança: nenhuma
informação sensível é exibida sem a senha mestra correta, e a experiência precisa deixar
claro ao usuário quando a sessão expirou (2 minutos) e por quê.

## Escopo

**Entra:**
- Detecção de estado: nenhuma senha mestra cadastrada ainda (primeiro acesso) vs. senha já
  cadastrada (acesso normal).
- Tela de **cadastro** da senha mestra (primeiro acesso): campo de senha, confirmação de
  senha, validação básica de força (ex: tamanho mínimo).
- Tela de **desbloqueio** (acessos seguintes): campo de senha mestra, botão de desbloquear,
  feedback de erro em caso de senha incorreta.
- Ao desbloquear com sucesso, reinicia o timer de 2 minutos (task 02) e navega para a tela
  principal (task 06).

**Não entra:**
- A lógica de derivação/verificação de chave em si (já implementada na task 02 — esta tela
  só consome essa API).

## Decisões técnicas

- Ao abrir o popup, primeiro consulta o `background.js` (ou storage) para saber:
  1. Existe salt/valor de controle cadastrado? Se não → tela de cadastro.
  2. Existe chave válida em memória (sessão ainda ativa, dentro dos 2 minutos)? Se sim →
     pula direto para a tela principal.
  3. Caso contrário → tela de desbloqueio.
- Campo de senha do tipo `password`, com opção de "mostrar senha" (ícone de olho) — comum em
  fluxos de senha mestra, ajuda a evitar erro de digitação sem comprometer segurança (já que
  é local).
- Mensagens de erro genéricas o suficiente para não dar pistas (ex.: "Senha incorreta", sem
  detalhar o motivo técnico).
- Sem campo de "esqueci minha senha" — não há como recuperar (não existe esse conceito num
  cofre local sem backend); deixar isso documentado/explícito na UI ("se esquecer a senha
  mestra, os dados não poderão ser recuperados") para gerenciar expectativa do usuário.

## Dependências

- Task 02 (criptografia e senha mestra).
- Task 01 (setup base).

## Critérios de aceite (teste manual)

1. Primeira abertura do popup (instalação limpa): aparece a tela de cadastro de senha mestra.
2. Após cadastrar, popup navega para a tela principal (mesmo que vazia, antes da task 06
   estar completa pode ser um placeholder). Se a task 04 (cadastro de MFA) já estiver
   implementada, deve ser possível, neste ponto do roadmap, cadastrar a senha mestra e em
   seguida um MFA de teste, fechando o primeiro ciclo completo do produto.
3. Fechar e reabrir o popup dentro de 2 minutos: vai direto para a tela principal, sem pedir
   senha de novo.
4. Aguardar mais de 2 minutos e reabrir: aparece a tela de desbloqueio pedindo a senha.
5. Digitar senha errada: mensagem de erro, sem acesso liberado.
6. Digitar senha correta: acesso liberado.

## Testes automatizados

- Teste da função que decide qual tela mostrar (cadastro vs. desbloqueio vs. liberado
  direto), dados os três estados possíveis (sem salt, com salt e sem sessão, com sessão
  ativa).
- Teste de validação do formulário de cadastro (senha vazia, confirmação diferente, senha
  muito curta).

## Riscos / pontos de atenção de segurança

- Esta tela é o ponto onde o rate limiting de tentativas erradas (task 10, tratada como parte
  do MVP de segurança, não como melhoria futura) se torna visível ao usuário — o atraso
  progressivo deve ser perceptível aqui mesmo que a lógica de contagem viva no
  `background.js`.
- `nome` de exibição eventual nesta tela (não há, hoje, mas se vier a existir qualquer dado do
  usuário renderizado aqui) deve seguir a mesma regra de sanitização (`textContent`, nunca
  `innerHTML`) das demais telas.
