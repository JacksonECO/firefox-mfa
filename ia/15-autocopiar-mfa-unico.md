# 15 — Autocópia do código quando há um único MFA do domínio

## Objetivo

Quando o popup abre na tela principal (após digitar a senha mestra ou com a sessão já ativa)
e existe **exatamente um** MFA para o domínio da aba ativa, copiar automaticamente o código de
6 dígitos para a área de transferência — sem exigir o clique. Além disso, ordenar a lista
alfabeticamente quando o usuário está vendo "todos" os MFAs.

## Por que / contexto

Reforça o diferencial de foco no domínio atual: no caso mais comum (um serviço, um MFA), o
usuário abre o popup, digita a senha e o código já está pronto para colar no formulário de
login — fluxo de um passo. Clicar no código continua copiando normalmente (já existe na
task 08); esta task só adianta esse passo no caso de MFA único.

## Escopo

**Entra:**
- Após renderizar a tela principal, se o modo é "domínio" e há exatamente 1 item, buscar o
  código (`GET_CODE`) e copiá-lo via `navigator.clipboard.writeText`, com um aviso discreto
  ("Código copiado automaticamente").
- A autocópia ocorre só na abertura do popup (após desbloqueio / sessão já ativa), não em
  re-renderizações (ex: alternar "ver todos", voltar de um formulário).
- Ordenação alfabética (por `nome`) da lista quando em modo "todos"/"todos-fallback".
- Confirmar (e cobrir por teste) que clicar no código também copia (task 08).

**Não entra:**
- Autopreenchimento na página (task 18) — aqui é só a área de transferência.
- Autocópia quando há 0 ou 2+ MFAs do domínio (ambíguo qual copiar).

## Decisões técnicas

- `decidirListagem` ordena os itens por `nome` (localeCompare pt, sem diferenciar acento/caixa)
  nos modos que listam todos; o modo "domínio" preserva a ordem (normalmente 1 item).
- A autocópia usa a mesma função `copiarParaClipboard` da task 08. Falha de clipboard é
  silenciosa aqui (não atrapalha; o usuário ainda pode clicar para copiar).
- `abrirPrincipal({ autoCopiar })` recebe a intenção: `true` nas entradas iniciais
  (rota inicial, pós-desbloqueio, pós-criação de senha), `false` ao voltar de formulários.

## Dependências

- Task 06 (listagem por domínio), task 07 (GET_CODE), task 08 (copiarParaClipboard).

## Critérios de aceite (teste manual)

1. Domínio com exatamente 1 MFA: abrir o popup e desbloquear → o código já está copiado
   (colar em um editor confirma), com aviso na tela.
2. Domínio com 2+ MFAs ou nenhum: não copia automaticamente.
3. Clicar no código (em qualquer card) copia normalmente.
4. Em "Ver todos", a lista aparece em ordem alfabética por nome.

## Testes automatizados

- `decidirListagem` ordena por nome nos modos "todos"/"todos-fallback".
- `copiarParaClipboard` (task 08) já coberto — copia exatamente o código exibido.

## Riscos / pontos de atenção

- A autocópia mexe na área de transferência sem clique explícito; é aceitável porque é
  consequência direta de o usuário abrir o popup, e só o código (não o segredo) é copiado.
