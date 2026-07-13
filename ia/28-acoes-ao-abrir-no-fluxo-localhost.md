# 28 — Autocópia/autopreenchimento também no fluxo localhost

## Objetivo

Fazer as ações "ao abrir" (autocópia da task 15 e autopreenchimento da task 18) valerem
**também** no fluxo localhost sem senha mestra (task 26). Hoje, ao abrir o popup em um
localhost com exatamente 1 MFA local sem criptografia, o código aparece, mas **não** é
copiado nem injetado na página, mesmo com essas opções ligadas nas configurações.

## Por que / contexto

O fluxo localhost (task 26) existe justamente para acelerar o dia a dia de desenvolvimento:
abrir o popup e ter o código pronto. As ações "ao abrir" são o que fecham o fluxo de um passo
(tasks 15/18), mas só estavam ligadas em `abrirPrincipal` — a tela localhost (`abrirLocalhost`)
apenas renderizava a lista. Resultado: a config está marcada, mas nada acontece nesse fluxo.

## Escopo

**Entra:**
- Ao abrir a tela localhost com **exatamente 1** MFA local sem cripto: buscar o código
  (`GET_CODE_LOCALHOST`) e aplicar autocópia + autopreenchimento conforme a config, com um
  aviso discreto — exatamente como a tela principal faz com 1 MFA do domínio.
- Nova mensagem **`GET_CONFIG_PUBLICO`** (sem exigir sessão) que devolve só a config **não
  sensível** necessária para essas ações: `autocopiar` e `autofill`. O `GET_CONFIG` normal
  continua exigindo desbloqueio (expõe rate limit/timeout junto).
- Extrair de `executarAcoesAoAbrir` um helper compartilhado (`aplicarCodigoAoAbrir`) usado
  pelas duas telas, para a regra de copiar/preencher/avisar/fechar ser única.
- Elemento de aviso próprio na tela localhost (`localhost-aviso`).

**Não entra:**
- Mudar o gatilho (continua: exatamente 1 MFA; 0 ou 2+ não disparam).
- Expor qualquer config sensível sem sessão — `GET_CONFIG_PUBLICO` devolve só `autocopiar` e
  `autofill` (ambos não sensíveis: flags e seletores CSS/mapa de domínios).

## Decisões técnicas

- `GET_CONFIG_PUBLICO` no background **não** chama `registrarAtividade` (não há sessão) e só lê
  `storage.obterConfigAutofill()`/`storage.obterAutocopiar()`. É leitura de dado não sensível —
  os mesmos campos já saem no `GET_CONFIG` autenticado.
- `aplicarCodigoAoAbrir(codigo, config, elAviso)` concentra: autocópia (respeita
  `autocopiar === true`, ver task 29), `preencherNaAba`, escolha da mensagem de aviso e o
  `window.close()` opcional do `fecharAoPreencher`.
- `preencherNaAba` já resolve o seletor via `dominioAtual`, que é definido antes de
  `abrirLocalhost` em `rotearVistaInicial` — então o override por domínio (task 23) funciona
  para `localhost` também.
- A autocópia/preenchimento no localhost só roda na abertura (igual ao principal): a tela
  localhost só é montada uma vez, na rota inicial.

## Dependências

- Task 26 (fluxo localhost), task 15 (autocópia), task 18 (autopreenchimento), task 23
  (seletor por domínio), task 24/29 (config de autocópia).

## Critérios de aceite (teste manual)

1. Com autocópia ligada e 1 MFA local sem cripto: abrir o popup em localhost copia o código e
   mostra o aviso, sem digitar a senha.
2. Com autopreenchimento ligado e seletor correto: o código é injetado no campo do localhost.
3. Com 0 ou 2+ MFAs locais: nada é copiado/preenchido automaticamente.
4. As opções desligadas: nada acontece (só a lista aparece).

## Testes automatizados

- `GET_CONFIG_PUBLICO` devolve `autocopiar`/`autofill` **sem** exigir sessão e **não** expõe
  rate limit nem timeout.
- `GET_CONFIG_PUBLICO` reflete o que foi salvo via `SET_AUTOCOPY`/`SET_AUTOFILL`.

## Riscos / pontos de atenção de segurança

- `GET_CONFIG_PUBLICO` roda sem sessão: por isso devolve **apenas** dados não sensíveis. Não
  toca em segredo, chave, salt nem valor de controle.
- O código injetado/copiado continua sendo só o de 6 dígitos (nunca o segredo), e o registro
  já é, por definição do fluxo, um localhost sem cripto.
