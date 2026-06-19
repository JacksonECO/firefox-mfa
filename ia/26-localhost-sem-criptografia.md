# 26 — MFAs de localhost sem criptografia (fluxo isolado sem senha mestra)

## Objetivo

Permitir, **opcionalmente e só para localhost**, cadastrar MFAs sem criptografia, de modo que,
ao abrir o popup em um domínio localhost, seja possível ver e usar esses códigos **sem digitar
a senha mestra** — num fluxo isolado, restrito a esses MFAs, com um botão "Entrar" para o
acesso completo.

## Por que / contexto

Em desenvolvimento local (localhost), digitar a senha mestra a cada uso atrapalha o fluxo. O
usuário pode aceitar guardar **esses** segredos em claro, em troca de conveniência — desde que
isso seja explícito, opcional e **estritamente isolado a localhost**, sem afetar a segurança
dos demais domínios.

## Escopo

**Entra:**
- Opção "sem criptografia" no cadastro, **visível só quando o domínio é localhost**.
- Registro sem criptografia: `secretEmClaro` + `semCriptografia: true` (sem `secretCriptografado`).
- Fluxo localhost sem senha mestra: ao abrir em localhost com a sessão bloqueada e havendo
  MFAs locais sem cripto, mostra uma tela só com esses MFAs (código + cronômetro + copiar) e um
  botão "Entrar com a senha mestra". Sem editar, adicionar ou ver qualquer outra coisa.
- Mensagens sem sessão `LIST_LOCALHOST { dominio }` e `GET_CODE_LOCALHOST { id }`, que só
  operam sobre registros `semCriptografia` cujo domínio é localhost.
- Logado, tudo funciona normalmente (GET_CODE/REVEAL/edição) também para os sem-cripto.
- Também é possível ter MFAs de localhost **com** criptografia (a opção é por cadastro).

**Não entra:**
- Converter entre com/sem criptografia na edição — o modo é definido na criação e preservado
  (para trocar, exclua e recadastre).
- Qualquer registro sem cripto fora de localhost (rejeitado no background).

## Decisões técnicas

- `dominio.js`: `ehLocalhost(dominio)` (localhost, 127.0.0.1, ::1, `*.localhost`).
- `storage.js`: `salvarMfaSemCripto` / `atualizarMfaSemCripto` (guardam em claro).
- `background.js`: valida `ehLocalhost` antes de aceitar `semCriptografia`; `LIST_LOCALHOST` e
  `GET_CODE_LOCALHOST` checam `semCriptografia === true && ehLocalhost(dominio)` — nunca tocam
  em segredo criptografado nem de outro domínio sem a senha mestra. `GET_CODE`/`REVEAL_SECRET`/
  export/import passam a tratar os dois modos.
- Isolamento: toda operação que não seja o par localhost continua exigindo sessão desbloqueada
  (já garantido pelos guards existentes).
- Documentado como **exceção única e explícita** à regra "nada sensível em claro" (CLAUDE.md).

## Dependências

- Tasks 03/04/06/07/09 (dados, cadastro, listagem, código, edição), task 02 (sessão).

## Critérios de aceite (teste manual)

1. Em localhost, o cadastro mostra a opção "sem criptografia"; em outros domínios, não.
2. Cadastrar um MFA local sem cripto e bloquear: ao reabrir em localhost, ele aparece sem pedir
   a senha; só ele e similares aparecem; nada mais é acessível.
3. "Entrar com a senha mestra" leva ao desbloqueio e ao acesso completo.
4. Em domínios não-localhost, nada muda (sempre exige a senha mestra).

## Testes automatizados

- `ehLocalhost` (loopback e `*.localhost`).
- Cadastro sem cripto só em localhost; LIST/GET_CODE_LOCALHOST devolvem só os locais sem cripto
  e recusam criptografados/outros domínios; sem sessão, nada além do par localhost funciona;
  logado, GET_CODE/REVEAL também atendem os sem-cripto.

## Riscos / pontos de atenção de segurança

- O segredo de um MFA sem cripto fica **em claro** no storage — é o trade-off explícito,
  limitado a localhost e por escolha do usuário. A UI avisa disso.
- A validação de localhost é feita **no background** (não confia no popup), tanto no cadastro
  quanto na leitura, evitando que um domínio comum acesse o fluxo sem senha.
