# 10 — Design system visual

## Objetivo

Definir e aplicar um guia visual consistente em todo o plug-in: estilo arredondado, sóbrio e
futurista, sem exageros visuais e sem aparência datada (anos 2000).

## Por que / contexto

Um produto que lida com segurança e dados sensíveis precisa transmitir confiança através do
visual. Um design inconsistente ou datado prejudica a percepção de qualidade/seriedade do
produto, mesmo que a segurança por trás esteja correta.

## Escopo

**Entra:**
- Paleta de cores sóbria e futurista (tons neutros/escuros como base, com uma cor de destaque
  usada com moderação para ações principais e estados como "copiado").
- Cantos arredondados consistentes em todos os componentes (cards, botões, inputs, modais).
- Tipografia: fonte do sistema (sem necessidade de carregar fontes externas via rede,
  reforçando o princípio offline-first) com uma escala clara de tamanhos (título, corpo,
  legendas).
- Espaçamento consistente (escala de espaçamento, ex: múltiplos de 4px).
- Estados visuais: hover, foco (acessibilidade de teclado), "copiado com sucesso", erro de
  validação, estado vazio, estado de carregamento.
- Definição de variáveis CSS (custom properties) centralizando cores, raios de borda,
  espaçamentos e tipografia, para reuso em todos os componentes das tasks 04–09.
- Decisão sobre suporte a tema claro/escuro (recomendado: detectar preferência do sistema via
  `prefers-color-scheme` e seguir automaticamente, sem necessidade de toggle manual no MVP).

**Não entra:**
- Redesenho de fluxos/funcionalidades — esta task é puramente visual, aplicada sobre os
  componentes já funcionais das tasks anteriores.

## Decisões técnicas

- Criar um arquivo `popup/theme.css` (ou similar) com as variáveis centrais:
  ```css
  :root {
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 20px;
    --color-bg: ...;
    --color-surface: ...;
    --color-text: ...;
    --color-accent: ...;
    --spacing-1: 4px;
    --spacing-2: 8px;
    --spacing-3: 16px;
    --spacing-4: 24px;
    /* ... */
  }
  ```
- Todos os componentes (cards, botões, inputs, modais) devem usar essas variáveis em vez de
  valores fixos espalhados pelo CSS, para manter consistência e facilitar ajustes futuros.
- Evitar gradientes pesados, sombras exageradas, ou animações longas — preferir transições
  curtas e sutis (ex: 150-200ms) coerentes com uma estética "sóbria e futurista".
- Ícones: usar um conjunto simples e consistente (ex: SVGs inline, sem depender de fontes de
  ícone carregadas externamente).

## Dependências

- Tasks 04, 05, 06, 07, 08, 09 — esta task revisita/aplica estilos sobre os componentes já
  implementados por elas. Pode ser feita de forma incremental (aplicar o tema conforme cada
  tela é construída) ou como uma passada final de polimento — a critério de quem
  implementar, mas o guia (variáveis, paleta, espaçamento) deve existir desde o início para
  evitar retrabalho.

## Critérios de aceite (teste manual)

1. Todos os componentes (botões, cards, inputs, modais) têm cantos arredondados consistentes
   entre si (mesma escala de raio para elementos do mesmo "nível").
2. Não há nenhuma cor, espaçamento ou raio de borda "hardcoded" fora das variáveis centrais
   (revisão visual do CSS).
3. A interface se adapta ao tema claro/escuro do sistema operacional automaticamente.
4. Estados de hover/foco são visualmente claros e consistentes em todos os elementos
   interativos.
5. Visualmente, a interface não usa elementos associados a estilos datados (ex: bordas 3D,
   gradientes fortes, sombras pesadas, ícones pixelados).

## Testes automatizados

- Não aplicável diretamente (é uma task de estilo visual). Caso haja interesse, pode-se
  adicionar um teste de regressão visual (screenshot) no futuro — fora do escopo do MVP.

## Riscos / pontos de atenção

- Manter a acessibilidade (contraste de cores adequado, foco visível via teclado) mesmo
  buscando uma estética sóbria — não sacrificar legibilidade por estilo.
