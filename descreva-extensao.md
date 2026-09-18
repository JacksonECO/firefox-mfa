# Descrição da extensão (addons.mozilla.org)

Campos da listagem em https://addons.mozilla.org/pt-BR/firefox/addon/mfa-num-toque, prontos
para copiar e colar no [painel de edição do developer hub](https://addons.mozilla.org/developers/).
Atualizado para incluir a task 30 (contas do site: e-mail e senha por domínio) e a task 31
(exportação seletiva), que ainda não estavam refletidas na listagem publicada.

> Cada campo abaixo está em um bloco de código isolado — copie só o conteúdo do bloco, sem o
> cabeçalho.

## Nome

```
MFA Num Toque
```

## URL da extensão

```
https://addons.mozilla.org/pt-BR/firefox/addon/mfa-num-toque
```

## Resumo

```
Códigos MFA (TOTP) e contas de login (e-mail/senha) 100% locais no Firefox. O popup mostra só os do site da aba atual e copia em um toque; tudo sempre criptografado em repouso. Sem nuvem, sem rede, sem rastreio.
```

## Descrição

```
MFA Num Toque guarda seus códigos de verificação em duas etapas (MFA / TOTP, RFC 6238) e agora também suas contas de login (e-mail e senha) por site — tudo a um toque de distância, direto no Firefox, substituindo o app autenticador do celular e o gerenciador de senhas do navegador.

Dois princípios guiam tudo.

1. Foco no site da aba atual. Ao abrir o popup, você só vê os códigos e contas do site em que está. Se houver um único código para aquele site, ele já é copiado automaticamente. Sem rolar listas enormes para achar o código certo.

2. Segurança das chaves. Segredos TOTP e credenciais do site (e-mail/senha) ficam sempre criptografados em repouso (AES-GCM) e só são decifrados em memória, no instante de gerar o código ou preencher o login. A senha mestra nunca se salva: dela deriva-se uma chave (PBKDF2-SHA256, 600.000 iterações) que vive só na memória e expira após 2 minutos de inatividade.

Principais recursos
- Códigos TOTP de 6 dígitos com cronômetro da janela de 30s
- Copiar com um toque (e autocópia quando há só 1 código pro site)
- Contas do site: e-mail e senha por domínio, com várias contas por site e uma marcada como principal
- Autopreenchimento opcional do código MFA e do login (e-mail/senha) na página
- Filtro automático pelo domínio da aba ativa, com alternância "ver todos"
- Cadastro, edição e exclusão de contas
- Senha mestra com bloqueio automático e proteção contra força bruta
- Backup: exportação seletiva e importação de um arquivo .json criptografado

Privacidade
- 100% local: nenhum dado sai do navegador, sem servidores, sem telemetria, sem rede.
- Não coleta nenhum dado.
- Permissões mínimas e código aberto (MIT), fácil de auditar.

Compatível com seus apps atuais. Como segue o padrão TOTP, o mesmo segredo gera o mesmo código aqui e em qualquer app autenticador (Google Authenticator, Authy, etc.). Dá para usar os dois em paralelo ou migrar digitando no mesmo lugar.

Código-fonte: https://github.com/JacksonECO/firefox-mfa
```

## Experimental?

```
Esta extensão está pronta para uso geral.
```

## Requer pagamento?

```
Esta extensão não requer pagamento de nenhum serviço ou hardware adicional.
```

## Categorias

```
Desenvolvimento Web
Privacidade e Segurança
```

## Email

```
(não preenchido)
```

## Site

```
https://github.com/JacksonECO/firefox-mfa/issues
```
