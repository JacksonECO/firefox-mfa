# 30 — Contas do site: e-mail e senha por domínio (com autopreenchimento)

## Objetivo

Guardar, com o mesmo nível de segurança dos segredos TOTP (ou melhor), **e-mail/usuário e
senha por domínio**, permitindo **mais de uma conta por site** com uma marcada como
**principal**, e preencher esses campos na página do jeito que já é feito com o código MFA.

## Por que / contexto

Hoje o cofre resolve metade do login: o segundo fator. Quem usa a extensão ainda depende de
outro lugar para o usuário e a senha do site — normalmente o gerenciador do navegador, que
guarda tudo sob a sessão do perfil, sem senha mestra própria. Trazer as credenciais para cá
resolve o login inteiro (usuário + senha + código) sob a mesma senha mestra, o mesmo AES-GCM
e a mesma regra de "nada em claro em repouso".

Mais de uma conta por site é o caso comum (pessoal e trabalho no mesmo serviço); daí a conta
principal, que é a única que o autopreenchimento usa.

## Escopo

**Entra:**
- Coleção `credItems` no storage, separada dos MFAs, ligada ao site pelo campo `dominio`
  (comparação exata, minúsculo — a mesma regra dos MFAs).
- E-mail e senha cifrados em repouso com AES-GCM, **cada um com o seu próprio IV**.
- Várias contas por domínio, com **exatamente uma principal** (invariante garantida no
  storage, não na UI).
- Tela dedicada "Contas de \<site\>" (lista com switch de principal, mostrar/ocultar e-mail,
  editar, excluir) e formulário próprio de criar/editar.
- Ícone no card do MFA quando o site tem conta salva; clicar preenche o login na página.
- Entradas: "+ E-mail e senha" na tela principal (cobre sites sem MFA nenhum) e o bloco
  "E-mail e senha deste site" dentro do formulário de MFA.
- Autopreenchimento de login opt-in: seletores padrão + overrides por domínio, sem enviar o
  formulário por padrão.
- Exceção de localhost (task 26) replicada: conta local pode ser salva sem criptografia e
  aparece/preenche no fluxo sem senha mestra.
- Recifragem das contas na troca da senha mestra (task 17).

**Não entra:**
- Gerador de senhas, verificação de vazamento ou avaliação de força da senha do site — quem
  define a política é o site; a senha forte que importa aqui é a mestra.
- Importar do gerenciador de senhas do Firefox (formato próprio; fica como evolução).
- Vincular conta a um MFA específico: a conta é do **domínio**, como o filtro do produto.

## Decisões técnicas

- **Por que dois IVs (e-mail e senha separados):** a lista de contas precisa mostrar o e-mail
  para o usuário distinguir "pessoal" de "trabalho", mas não precisa da senha. Com campos
  separados, `LIST_CONTAS` decifra só o e-mail e **nunca toca no ciphertext da senha**. A
  senha sai do background em um ponto só: `REVEAL_CONTA`, no formulário de edição — a mesma
  exceção deliberada que o `REVEAL_SECRET` já tinha.
- **O e-mail também é cifrado.** É dado pessoal e liga a pessoa ao serviço; o domínio fica em
  claro porque é a chave de busca (como nos MFAs).
- **A injeção do login roda no background, não no popup.** No autofill de MFA (ia/18) o popup
  injeta, mas ali trafega só o código de 6 dígitos. Aqui trafegaria a senha do site: então o
  popup manda `AUTOFILL_LOGIN { dominio, tabId }` e quem chama `scripting.executeScript` é o
  background, dono da chave. A senha nunca entra no processo do popup.
- **Invariante de conta principal no storage** (`normalizarPrincipais`): a primeira conta de
  um domínio nasce principal; marcar outra desmarca a anterior; excluir a principal promove a
  mais antiga restante. Fica fora da UI de propósito — importar um backup também precisa dela.
- **`validarConta` não valida formato de e-mail.** Muitos sites logam com usuário, CPF ou
  telefone no mesmo campo; exigir "@" recusaria contas legítimas. O campo se chama "E-mail ou
  usuário" e a validação é só "não vazio".
- **Senha em branco na edição = manter a atual**, evitando recifrar à toa (mesma ideia do
  `segredoFoiAlterado` dos MFAs).
- **Heurística do autofill:** ignora campo invisível, desabilitado, somente-leitura e
  `type="hidden"`; se o seletor de usuário não casar, usa o campo de texto visível
  imediatamente anterior ao de senha no mesmo formulário; escreve pelo **setter nativo** de
  `value` antes de disparar `input`/`change` (formulários controlados por framework ignoram a
  atribuição direta); só dispara Enter se a opção "enviar" estiver ligada.
- **Nenhuma permissão nova no manifest:** `activeTab` + `scripting`, já presentes, cobrem a
  injeção. A concessão do `activeTab` vale para a extensão inteira depois do clique no ícone,
  então o background consegue injetar.
- `schemaVersion` 1 → 2, com migração registrada que só garante a coleção `credItems`.

## Dependências

- Task 02 (cripto/sessão), 03 (storage), 09 (edição), 17 (troca de senha), 18/23 (autofill),
  26 (localhost sem criptografia).

## Critérios de aceite (teste manual)

1. Cadastrar duas contas no mesmo site; só uma fica marcada como principal; trocar o switch
   move a marcação.
2. Excluir a conta principal promove a outra automaticamente.
3. Na tela principal, o card do site mostra o ícone de conta salva; sites sem conta, não.
4. Clicar no ícone preenche e-mail e senha na página aberta (sem enviar o formulário).
5. Com o autopreenchimento de login ligado, abrir a extensão no site já preenche os campos.
6. Editar a conta mostra e-mail e senha salvos; salvar com a senha em branco mantém a anterior.
7. Um site sem MFA nenhum consegue ter conta, pelo botão "+ E-mail e senha".
8. Em localhost, a opção "sem criptografia" aparece; com o cofre bloqueado, a conta local
   aparece e preenche. Em outros domínios, nada aparece sem a senha mestra.
9. Trocar a senha mestra mantém todas as contas acessíveis.

## Testes automatizados

- `conta.test.js`: validação/normalização, e-mail que não é e-mail, senha opcional na edição.
- `contas-storage.test.js`: nada em claro no storage, IVs distintos, invariante de principal
  (criar/trocar/excluir/mudar de domínio), localhost sem cripto e conversão.
- `contas-background.test.js`: `LIST_CONTAS` nunca devolve senha; tudo exige sessão; validação
  no background; `semCriptografia` só em localhost; recifragem na troca de senha.
- `autofill-login.test.js`: normalização retrocompatível da config, resolução de seletores e a
  função injetada exercitada sobre um `document` falso (invisíveis, fallback, Enter).
- `popup-estrutura.test.js`: todo id usado no JS existe no HTML; o template da lista não tem
  campo de senha; `REVEAL_CONTA` é enviado de um ponto só.

## Riscos / pontos de atenção de segurança

- A senha do site existe em claro na memória do background durante a injeção e o reveal.
  Strings JS são imutáveis (não dá para `.fill(0)`): o que se faz é manter o escopo mínimo e
  não registrar nada em log.
- Preencher o campo errado em páginas complexas: mitigado pelos overrides por domínio e por
  **não enviar** o formulário por padrão.
- Conta de localhost sem criptografia fica em claro no storage — é o mesmo trade-off explícito
  da task 26, restrito a localhost e validado no background.
