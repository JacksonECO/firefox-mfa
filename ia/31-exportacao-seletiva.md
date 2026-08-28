# 31 — Exportação seletiva com reautenticação

## Objetivo

Na exportação, permitir escolher **quais domínios** e **quais tipos de dado** (MFAs, contas do
site, configurações) entram no arquivo — de forma isolada — e exigir **sempre** a senha mestra
para concluir a operação.

## Por que / contexto

O backup da task 14 exporta tudo ou nada. Com as contas do site (task 30) no cofre, o arquivo
passa a concentrar login **e** segundo fator: quem quiser levar só os MFAs de um serviço para
outra máquina não deveria ser obrigado a carregar junto todas as senhas.

E exportar é o único momento em que **tudo existe em claro ao mesmo tempo** na memória. Se a
sessão estiver aberta (por exemplo, uma máquina destravada por alguns segundos), hoje basta
inventar uma senha de exportação para levar o cofre inteiro. Pedir a senha mestra de novo
fecha essa janela.

## Escopo

**Entra:**
- Filtro `{ incluirMfas, incluirContas, incluirConfig, dominios }` aplicado no background.
- `dominios: null` = todos; um array seleciona domínios exatos e aceita `null` para os
  registros sem site.
- Reautenticação obrigatória com a senha mestra, além da senha que criptografa o arquivo.
- `EXPORT_RESUMO`: lista de domínios com contagem de MFAs e contas, para montar a seleção.
- Arquivo v2 (com `contas`); importação continua aceitando v1 e o formato antigo (array puro).
- Importação de contas, respeitando a invariante de conta principal do domínio.

**Não entra:**
- Exportar sem senha de arquivo ("texto claro para inspeção") — não existe caminho para isso.
- Mesclar/deduplicar na importação: como já acontecia com os MFAs, importar **acrescenta**.

## Decisões técnicas

- **Duas senhas, propósitos diferentes.** A senha mestra **autoriza** a exportação (é
  reautenticação, verificada pelo decrypt do valor de controle — timing-safe); a senha de
  exportação **protege o arquivo** e continua independente da mestra, para que vazar o arquivo
  não dê pistas sobre a senha do cofre e para que o backup possa ser compartilhado com um
  segredo próprio.
- **A verificação passa pelo mesmo rate limiting do desbloqueio** (contador persistido +
  atraso progressivo). Sem isso, `EXPORT_DATA` seria um oráculo de senha mestra sem a fricção
  que a tela de login tem. `desbloquear` e `verificarSenhaMestra` compartilham o mesmo núcleo
  (`conferirSenhaMestra`), então a regra não pode divergir entre os dois caminhos.
- **O filtro é aplicado no background, ao montar o payload** — nunca no popup e nunca "depois
  de cifrar": o que não foi selecionado simplesmente não é decifrado nem entra no arquivo.
- **Contas importadas entram com `principal: false`** e deixam a decisão para a invariante do
  storage: se o domínio ainda não tem principal, a importada é promovida; se já tem, a que
  estava na máquina continua sendo — importar um backup não muda silenciosamente qual conta o
  autopreenchimento usa.
- `EXPORT_RESUMO` devolve só nome de domínio e contagens; não decifra nada.
- **Seleção de domínios vazia é recusada no background** (`NENHUM_SITE_SELECIONADO`), não só
  no popup: `dominios: []` (array vazio, diferente de `null` = todos) geraria um backup sem
  nenhum MFA/conta se só a UI barrasse isso — o background é quem não deve confiar na UI.
- **Falha na exportação devolve um código estável** (`FALHA_EXPORTACAO`), nunca a mensagem
  interna da exceção — mesma disciplina do `IMPORT_DATA`, que já usa
  `SENHA_OU_ARQUIVO_INVALIDO` em vez de vazar detalhe de implementação para a UI.

## Dependências

- Tasks 14 (backup), 25 (configurações no backup), 10/16 (rate limiting), 30 (contas).

## Critérios de aceite (teste manual)

1. Exportar sem a senha mestra é recusado; com a senha errada, a mensagem é clara.
2. Errar a senha mestra na exportação alimenta o mesmo atraso progressivo do desbloqueio.
3. Marcar só "Contas do site" e um domínio gera um arquivo que, importado num perfil limpo,
   traz exatamente aquela conta — nenhum MFA.
4. Marcar só "Códigos MFA" não leva e-mail nem senha no arquivo.
5. O arquivo exportado não contém e-mail, senha, segredo, domínio nem configuração em claro.
6. Um backup gerado antes desta versão ainda importa.

## Testes automatizados

- `backup.test.js`: round-trip com contas, ausência de qualquer dado em claro no arquivo,
  normalização do filtro e compatibilidade com o formato v1.
- `exportacao.test.js`: senha mestra obrigatória/incorreta, efeito no contador de tentativas,
  filtro por domínio e por tipo, round-trip completo pelo background, conta principal
  preservada na importação e `EXPORT_RESUMO`.

## Riscos / pontos de atenção de segurança

- O arquivo exportado é tão forte quanto a senha de exportação escolhida — a UI diz isso.
- A reautenticação não substitui o bloqueio da sessão: `EXPORT_DATA` continua exigindo sessão
  desbloqueada **e** a senha mestra.
