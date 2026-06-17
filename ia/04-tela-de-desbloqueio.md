# 04 — Tela de desbloqueio

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
  principal (task 05).

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
2. Após cadastrar, popup navega para a tela principal (mesmo que vazia, antes da task 05
   estar completa pode ser um placeholder).
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

- Não permitir múltiplas tentativas ilimitadas sem nenhum atraso pode facilitar força bruta
  local — como é um cofre local (sem rede), o risco principal é alguém com acesso físico ao
  perfil do navegador; ainda assim, considerar um pequeno atraso progressivo após algumas
  tentativas erradas como melhoria futura (documentar, não bloqueante para o MVP).
