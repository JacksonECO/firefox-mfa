# 22 — Documentação do autopreenchimento (configuração do seletor)

## Objetivo

Documentar de forma clara e acionável como configurar o valor do autopreenchimento (o seletor
CSS), para que uma pessoa — ou uma IA assistente — consiga preenchê-lo corretamente para
qualquer site.

## Por que / contexto

O campo de configuração é um seletor CSS livre; sem orientação, é fácil errar (campo errado,
seletor instável, não saber lidar com "6 caixas separadas"). Um guia objetivo reduz esse atrito
e os erros.

## Escopo

**Entra:**
- Documento [`docs/autopreenchimento.md`](../docs/autopreenchimento.md) com: o que é o valor,
  como a extensão decide preencher (1 campo vs. múltiplos), exemplos prontos por situação, como
  descobrir o seletor via DevTools, dicas/limites e um resumo "para uma IA configurar".
- Texto de ajuda do popup melhorado, com exemplos inline e referência ao guia.
- Link no README.

**Não entra:**
- Mudança de comportamento do autopreenchimento (a opção por domínio é a task 23).

## Dependências

- Task 18 (autopreenchimento).

## Critérios de aceite (teste manual)

1. O guia cobre campo único e "um input por dígito", com exemplos de seletores.
2. A ajuda do popup mostra exemplos e aponta para o guia.

## Testes automatizados

- Não aplicável (tarefa de documentação).
