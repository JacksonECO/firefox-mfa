# 29 — Autocópia desligada por padrão + aviso de conflito com a área de transferência

## Objetivo

Inverter o padrão da autocópia (task 15/24): passar a vir **desligada** por padrão e exibir,
nas configurações, um aviso de que ligá-la **pode atrapalhar o cadastro de novos MFAs**.

## Por que / contexto

A autocópia mexe na área de transferência sem clique. O caso problemático: ao **cadastrar um
novo MFA**, o usuário normalmente copia o segredo do serviço para colar no formulário da
extensão. Se, ao abrir o popup em um site com 1 MFA, a extensão sobrescrever a área de
transferência com o código de 6 dígitos, ela **apaga o segredo que o usuário acabou de
copiar**. Por isso o padrão seguro/menos surpreendente é vir desligada, e a UI precisa avisar
do efeito colateral antes de o usuário ligar.

## Escopo

**Entra:**
- `storage.obterAutocopiar()` passa a retornar **`false`** quando ausente (padrão desligado).
- O popup só autocopia quando `autocopiar === true` (nunca por ausência/`undefined`).
- O checkbox de configurações reflete `autocopiar === true` (desmarcado por padrão).
- Aviso textual na seção "Geral", abaixo do checkbox, explicando o risco de sobrescrever a
  área de transferência ao adicionar novos MFAs.

**Não entra:**
- Mudar o gatilho da autocópia (continua: 1 MFA do domínio, só na abertura).
- Mudar o autopreenchimento (task 18), que já era opt-in/desligado.

## Decisões técnicas

- A única fonte do padrão é `storage.obterAutocopiar()`; trocar o fallback de `true` para
  `false` propaga para `GET_CONFIG`, `GET_CONFIG_PUBLICO` (task 28) e export.
- O popup decide autocópia com `config.autocopiar === true` (comparação estrita) em vez de
  `!== false`, para que ausência de config nunca copie.
- O aviso é texto estático no HTML (não vem de dado do usuário) — sem risco de XSS.

## Dependências

- Task 15 (autocópia), task 24 (config de autocópia), task 28 (helper compartilhado das ações
  ao abrir).

## Critérios de aceite (teste manual)

1. Instalação limpa (ou config nunca tocada): abrir o popup com 1 MFA do site **não** copia
   automaticamente; clicar no código ainda copia.
2. Configurações mostram o checkbox **desmarcado** por padrão e o aviso do efeito colateral.
3. Ligar a opção: volta a copiar ao abrir; desligar: para de copiar.

## Testes automatizados

- `GET_CONFIG.autocopiar` é `false` por padrão; `SET_AUTOCOPY` alterna e persiste.
- `obterAutocopiar()` retorna `false` quando ausente e o valor salvo quando presente.

## Riscos / pontos de atenção

- Mudança de comportamento para quem dependia do padrão ligado: aceitável, é o objetivo da
  task. Quem tinha ligado explicitamente mantém `true` salvo.
