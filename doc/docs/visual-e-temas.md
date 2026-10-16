# Visual e temas

O app tem um tema escuro **fixo** — não segue o claro/escuro do sistema (seguir já causou uma mistura
de fundo escuro do sistema com cartões brancos do app). Dentro do escuro, cada usuário escolhe uma
entre **15 paletas**. A interface foi pensada para ser calma para a vista (há usuário com visão
sensível): sem branco puro, pouco contraste de cor entre superfícies, sem brilhos e sem blocos
inteiros coloridos.

## Temas por usuário

Escolhidos em **Perfil > Aparência**, numa grade de miniaturas: tocar aplica na hora e salva sozinho
(sem botão). Padrão = **Sálvia suave** (para contas novas e para as que já existiam).

| chave | nome | chave | nome |
|---|---|---|---|
| `salvia` | Sálvia suave (padrão) | `oceano` | Oceano |
| `atual` | Ardósia e verde | `lavanda` | Ameixa e lavanda |
| `grafite` | Grafite e esmeralda | `oled` | Preto OLED |
| `petroleo` | Azul-petróleo | `cobre` | Carvão e cobre |
| `musgo` | Musgo | `floresta` | Floresta |
| `indigo` | Noite índigo | `nordico` | Nórdico |
| `cafe` | Café com sálvia | `sepia` | Sépia noturno |
| `ambar` | Ardósia e âmbar | | |

(`atual` é o tema verde que era o padrão antes de 2026-10-10 — a chave ficou com esse nome porque é o
valor gravado no banco.)

### Como funciona

- **Persistência**: coluna `users.theme` (default `'salvia'`), `PUT /auth/me/theme`, e `theme` no
  `UserOut`. A lista de chaves válidas fica em `schemas.ThemeKey` (422 com chave desconhecida).
- **Cópia local**: o tema também vai para o `localStorage` (`vrfinance_tema`) e um script inline no
  `index.html` aplica antes do Angular carregar — sem piscar o tema padrão. Por isso o **login usa o
  último tema do aparelho** (logout não volta para o padrão).
- **CSS**: `theme/variables.scss` é o tema padrão (`:root`) e `theme/_temas.scss` tem um bloco
  `:root[data-tema="x"]` por tema, redefinindo só os tokens de cor; os derivados (bordas, tints
  translúcidos) usam `var()` e acompanham sozinhos. Trocar = mudar um atributo no `<html>`, sem
  recarregar. Custo medido: ~2,4 KB comprimidos a mais.
- **`core/theme.service.ts`** (instanciado no `AppComponent`) aplica o tema do usuário logado e faz a
  troca **otimista**: aplica, salva; se o `PUT` falhar, volta ao anterior. A resposta não é usada,
  para não desfazer toques seguidos.
- **Gráficos**: o chart.js não lê CSS, então as cores de gráfico de cada tema ficam em
  `shared/themes.ts` (`THEMES`, junto com nome, descrição e amostras do seletor). O tema ativo é um
  sinal de módulo (`activeTheme`); os montadores leem `chartColors()` na hora e as opções são funções
  (`lineChartOptions()`, `comboChartOptions()`…) chamadas dentro de `computed()` — trocar o tema
  redesenha os gráficos.

!!! tip "Tema novo"
    Um bloco em `theme/_temas.scss`, uma entrada em `THEMES` (`shared/themes.ts`) e a chave em
    `schemas.ThemeKey`. Os dois arquivos foram gerados da mesma tabela de paletas (shade = 12% para o
    preto, tint = 10% para o branco, texto sobre positivo/negativo/aviso = 78% para o preto).

Ícone, splash do Android e favicon **não** mudam por usuário (são do sistema) — ficam na Sálvia
suave (ver [Gerar o app Android](build-app.md#icone-do-app-e-splash)).

## Paleta padrão "Sálvia suave"

Tudo dessaturado, com pouca diferença de cor. Valores em `theme/variables.scss`:

| papel | token | cor |
|---|---|---|
| fundo | `--ion-background-color` | `#141716` |
| superfície (cartão) | `--app-surface` | `#1b201e` |
| superfície elevada | `--app-surface-raised` | `#242a28` |
| texto / secundário | `--app-text-primary` / `--app-text-secondary` | `#dde3df` / `#99a49e` |
| marca (primary) | `--ion-color-primary` | `#7fb59a` |
| positivo (success) | `--app-positive` | `#95c9a8` — um degrau mais claro que a marca, de propósito (marca ≠ "ganho") |
| negativo (danger) | `--app-negative` | `#d98c84` |
| aviso | `--ion-color-warning` | `#d4ae63` |

Texto sobre qualquer cor de destaque é **escuro**, não branco. Bordas e trilhos usam
`rgba(var(--app-muted-rgb), …)` — o RGB do texto secundário — em vez de cores soltas.

## Design system

Regras que valem para toda tela nova (revisão visual de 2026-10-09):

- **Tokens** (`theme/variables.scss`): tipografia em 6 passos (`--fs-xs` 0,75 · `--fs-sm` 0,875 ·
  `--fs-md` 1 · `--fs-lg` 1,25 · `--fs-xl` 1,75 · `--fs-hero` 2,25rem), raios `--r-sm` 8px
  (controles) / `--r-md` 12px (cartões, modais) / `--r-pill`, espaços `--sp-1…7` (4 a 48px), pesos só
  400/500/600. Use os tokens, não valores soltos.
- **Fonte própria**: IBM Plex Sans (`@fontsource/ibm-plex-sans`, só o subconjunto latino), embutida no
  build — web e APK com a mesma letra, sem rede. Os gráficos usam a mesma.
- **Cartões sem vidro nem sombra**: o mixin `ds.app-card` (`theme/_mixins.scss`) é superfície opaca +
  borda; `ds.app-card-compact` para cartão aninhado. Sombra (`--app-shadow-float`) só no que flutua:
  modal, popover, toast, botão flutuante. Mixin em vez de `%placeholder` porque os estilos de
  componente do Angular são compilados um a um.
- **Destaque sem bloco de cor**: "Disponível pra gastar", inflação do mês, conclusão de Ferramentas,
  sugestões de "Anexar a um lançamento" — superfície neutra + faixa lateral de 3px
  (`ds.app-card-accent`) + número colorido.
- **Caixa normal** nos botões ("Salvar gasto", não "SALVAR GASTO"); botão sólido desabilitado fica
  cinza legível.
- **Tabelas**: estilo único em `global.scss` escopado por `.table-card`; coluna numérica com `td.num`
  **e** `th.num`. Ações com lugar fixo (`.icon-slot` reserva o espaço de um ícone que a linha não
  tem; o de anexo é sempre o primeiro). No celular, tabela com `.has-cards` vira `.entry-list` (ver
  [Funcionalidades](funcionalidades.md#celular-e-desktop)).
- **Campos fora dos modais** (filtros, buscas) com o mesmo visual dos campos dos modais: 44px, raio
  8px. O `ion-input` não usa shadow DOM — o seletor precisa de `.sc-ion-input-md-h` para vencer a
  especificidade do Ionic.
- **Abas de página**: `ion-segment.page-tabs` (sublinhado, à esquerda no desktop, divididas no
  celular).
- **Dropdowns**: todo `ion-select` com `interface="popover"` ganha o visual do app via
  `ion-popover.select-popover`; o select de Categoria usa `CATEGORY_SELECT_POPOVER_OPTIONS`
  (`shared/select-popover.ts`) para abrir com a largura do campo.
- **Acessibilidade**: `aria-label` em todo botão só de ícone (o Ionic move o `aria-label` do
  `ion-button` pro botão interno — em teste, selecione por `title`), checado por
  `scripts/check-a11y.mjs`; piso de 0,75rem para texto; `prefers-reduced-motion` respeitado.

## Gráficos

Redesenho de 2026-10-10 (avaliado com prints e um validador de paleta nos 15 temas). Só forma e
interação — nenhum cálculo mudou. As regras ficam também no comentário do topo de
`home/dashboard-charts.ts`:

- **Nunca eixo duplo.** Medidas de escalas diferentes vão em **painéis empilhados** com o mesmo eixo de
  meses; o eixo Y tem largura fixa (`fixedAxisWidth`, `shared/chart-plugins.ts`) para os meses
  alinharem, e só o painel de baixo mostra os meses.
- **No máximo o par Essenciais × Não essenciais em cor** no mesmo gráfico — é o único par que passa no
  validador de daltonismo em todos os temas. O resto vira contorno, traço, cinza ou painel próprio.
- **Rótulo direto** (`directLabels`): nome no fim da linha, valor em cima da barra; some em tela
  estreita e com o olho de esconder valores. Texto na cor de texto do tema (`themeInk()`), nunca na
  cor da série. `zeroLine` desenha o zero mais forte que a grade.
- **Eixo de meses** (`shared/month-axis.ts`): o ano aparece embaixo do mês no 1º ponto e em cada
  janeiro, uma linha tracejada marca a virada do ano, tooltip "Fev/2025". Em 24/36 meses, um rótulo a
  cada 3 meses (6 no celular).
- `shared/chart-setup.ts` registra só o que é usado (linha, barra, escalas, legenda, tooltip) com
  `locale: 'pt-BR'` e curva `monotone` (passa pelos pontos; a suavização por `tension` inventava picos).
- Gráfico novo: cores sempre de `chartColors()`, nunca fixas.

Os gráficos de cada seção estão descritos em [Analítico](analitico.md). Os PDFs do backend têm
paleta própria de papel (fundo `#f2efe9`, nunca branco puro) — ver
[Módulos opcionais](modulos-opcionais.md#relatorios-em-pdf).
