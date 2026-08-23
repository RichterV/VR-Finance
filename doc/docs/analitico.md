# Analítico

Resumo Mensal, Resumo Anual e Relatório Geral não são páginas separadas no frontend — vivem juntos na
Home (`/home`), como três seções de um dashboard único. Cada seção (exceto a geral) tem seu próprio
seletor de período: a mensal, mês + ano; a anual, só ano. Default: mês/ano atuais.

Um ícone de olho no header da Home oculta/revela todos os valores financeiros da página, inclusive os
eixos dos gráficos — por padrão os valores ficam ocultos (o olho abre "fechado"). É um recurso só de
UI (não some nada no backend), pensado pra poder abrir o app em público sem expor números.

## Resumo Anual (`GET /resumo/anual?ano=&meses=`)

Métricas do ano selecionado:

- Receita total e total de gastos, separado em essenciais e não essenciais
- Quantidade de gastos (cada parcela conta como 1) e quantidade de receitas
- Média mensal de gastos e de receitas (total do ano ÷ nº de meses com dados)
- Total de caixa pretendido (soma de `cash_value` das receitas do ano)
- Total de caixa real (receita total do ano − gasto total do ano)
- Percentual de cada item do dropdown sobre o total de gastos do ano, por prioridade — exibidos como
  barras **ordenadas do maior pro menor**, escaladas pelo maior valor do próprio grupo (não por 100%
  absoluto — dificilmente um item isolado chega perto disso, então escalar por 100% deixaria as barras
  praticamente vazias)

### Gráfico 1 — Linhas ("Evolução")

Evolução mês a mês, numa janela rolante a partir do mês atual (últimos 12/24/36 meses — o parâmetro
`meses` da API; no dashboard da Home é sempre 12, o seletor de janela só aparece no modal expandido):
gastos essenciais, gastos não essenciais e caixa real.

Estilo: linhas suavizadas (curva, não segmentos retos); "Caixa real" desenhada com traço tracejado e
marcador em X (as outras duas usam marcador circular); uma linha de tendência (regressão linear simples,
`frontend/src/app/shared/linear-regression.ts`) para essenciais e para não essenciais, sem entrar na
legenda do gráfico.

### Gráfico 2 — Colunas + linha ("Caixa pretendido vs. real")

Usa a mesma janela rolante do Gráfico 1 — **não é mais** "meses do ano selecionado no header"; os dois
gráficos sempre olham pra trás a partir de hoje, independente do `ano` escolhido no seletor da seção
(essa mudança foi proposital, pra manter os dois gráficos consistentes entre si).

- 3 colunas agrupadas por mês, eixo esquerdo (R$): Receita, Caixa pretendido, Caixa real — com cores/
  tons bem distintos entre si (dourado / verde claro / verde escuro) e cantos arredondados
- Linha no eixo secundário direito: `caixa real / gastos totais` do mês, como **razão** (0,5 / 1,0 /
  1,5...), não porcentagem — desenhada por cima das colunas (via `order` do dataset no Chart.js), com
  a legenda mostrando um ícone de linha, não um marcador de ponto (pra diferenciar visualmente das
  barras na mesma legenda)

Os dois gráficos têm um ícone de expandir no canto que abre um modal fullscreen com um seletor pra
trocar a janela entre últimos 12/24/36 meses.

### Checkbox "Mostrar apenas até o mês selecionado"

Disponível nas seções Mensal, Anual e Geral, com **o mesmo estado compartilhado entre as três** (é um
único checkbox lógico, não um por seção). Desabilitada por padrão. Quando habilitada, os totais e
percentuais dessas seções passam a considerar só os lançamentos até o fim do mês/ano selecionado no
seletor mensal (ex: mês=março/2026 → considera até 31/03/2026, ignorando gastos futuros já lançados no
banco). Os dois gráficos de janela rolante (Evolução e Caixa pretendido vs. real) **não são afetados**
— continuam sempre "últimos N meses a partir de hoje", pra manter comportamento consistente entre si.
No backend, isso é o parâmetro `ate_ano`/`ate_mes` de `/resumo/anual` e `/resumo/geral` (não existe em
`/resumo/mensal`, que já analisa um único mês por definição).

## Resumo Mensal (`GET /resumo/mensal?ano=&mes=`)

Mesmas métricas do resumo anual (sem receita total exposta separadamente, mas calculada por trás), mas
calculadas só para o mês selecionado, com duas diferenças:

- Médias são **por lançamento** (total do mês ÷ quantidade de lançamentos), não mensais
- Inclui o valor destacado **"Disponível pra gastar"**:

```
Disponível pra gastar = Receita total do mês − Gasto total do mês − Caixa pretendido do mês
```

Pode ficar negativo se o usuário gastou mais do que a receita menos a reserva pretendida. No frontend,
esse valor é o **primeiro card** da grade de métricas mensais (mesmo tamanho dos outros cards), com
destaque visual — fundo em gradiente indigo, ou vermelho se o valor for negativo.

### Botão "Ver detalhes"

Ao lado do seletor de mês/ano, abre um modal fullscreen, read-only, com todas as descrições dos
lançamentos daquele mês — duas tabelas empilhadas (Gastos, Receitas), sempre ordenadas do maior valor
pro menor. Na tabela de gastos, os **3 maiores** são destacados: a linha divisória fica vermelha e o
valor em R$ fica em vermelho (só isso — o fundo da linha não é destacado).

## Relatório Geral (`GET /resumo/geral?ate_ano=&ate_mes=`)

Seção abaixo do Resumo Anual, sem seletor de período próprio (usa o mesmo checkbox de corte descrito
acima). Mostra **totais** (não médias) de todo o histórico, em 3 gráficos:

- **Gráfico da direita** — colunas agrupadas **por ano**: gastos essenciais e não essenciais, receita,
  caixa pretendido e caixa real, um grupo de colunas por ano com dados (`anos` da API)
- **Gráfico da esquerda** — as mesmas categorias, mas como um **total único agregando todo o
  histórico** (não quebrado por ano) — dá a visão consolidada de tudo que já foi lançado
- **Gráfico de baixo**, abaixo dos dois anteriores e ocupando a largura de ambos: totais por **mês do
  calendário** (jan–dez), somando o mesmo mês em todos os anos — revela sazonalidade (ex: dezembro
  sempre mais alto), independente de qual ano cada lançamento caiu (`por_mes` da API, agregado no
  backend por `defaultdict` sobre `date.month`)

## Manutenção Veículos (`/veiculos`)

Fora do dashboard da Home, seção própria com:

- Cards de resumo por veículo: total gasto, quantidade de serviços, data do último serviço
  (`GET /veiculos/resumo?meses=`)
- Gráfico de evolução mensal, uma linha por veículo, últimos N meses (mesma janela dos cards)
- Tabela de veículos cadastrados e tabela paginada de serviços (mesmo padrão "carregar mais" de 25 em
  25 de `/dados`), com edição/exclusão em ambas

## Visualizar dados (`/dados`)

Não é uma tela analítica (não calcula métricas), mas é onde o usuário gerencia os lançamentos que
alimentam os resumos acima:

- Duas tabelas — Gastos e Receitas — ordenadas por data decrescente (mais recente primeiro), 25 linhas
  por vez com um botão "Carregar mais" ao pé de cada tabela (`GET /gastos` / `GET /receitas` retornam
  `{items, total}`, não uma lista direta)
- Filtro opcional por mês e/ou ano; sem filtro por padrão, mostra tudo
- Cada linha tem ações de editar (modal pré-preenchido, `PUT`) e excluir (`DELETE`, com confirmação
  via alert antes de remover)
