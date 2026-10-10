# Analítico

Resumo Mensal, Indicadores, Resumo Anual, Relatório Geral e Análise inflacionária não são páginas
separadas — vivem juntos na Home (`/home`), como seções de um dashboard único, nessa ordem. Cada seção
carrega os próprios dados e, se falhar, mostra o erro com "Tentar novamente" só nela (ver
[Arquitetura](arquitetura.md#home-em-secoes-independentes)).

## Controles compartilhados da Home

### Seletor de período e botão de reset

Só a seção **Mensal** tem seletor de período (mês + ano, padrão: mês/ano atuais). A seção Anual usa o
**ano** desse mesmo seletor — não tem seletor próprio, pra não ficar ambíguo qual "ano" afeta os
gráficos. Geral e Inflação não têm seletor.

À esquerda do seletor fica o botão "voltar período ao padrão" (ícone de setas circulares,
`shared/reset-period-button.component.ts`): volta mês/ano pro mês atual e fica desabilitado quando já
está lá. O mesmo botão existe nos filtros de mês/ano de `/dados`, `/devedores` e `/veiculos`, onde o
padrão é "todos" (sem filtro). Ele mexe **só** no período, nunca em busca/status/outros filtros.

### Checkbox "Mostrar apenas até o mês selecionado"

Um único checkbox lógico, compartilhado por Mensal, Indicadores, Anual, Geral e Inflação. **Ligado por
padrão** — desligado, parcelas futuras já lançadas (uma compra em 6x, por exemplo) inflavam os totais
anuais/gerais e a cesta de inflação com meses que ainda nem chegaram.

Ligado, os totais e percentuais passam a considerar só lançamentos até o fim do mês/ano do seletor
(parâmetros `ate_ano`/`ate_mes` da API). Os gráficos de janela rolante — Evolução, Caixa pretendido
vs. real e a janela da Análise inflacionária — **também** passam a terminar nesse mês em vez de hoje
(ex: corte em junho → o último ponto é junho). Desligado, esses gráficos voltam a mostrar os últimos N
meses a partir de hoje. Não se aplica ao Resumo Mensal, que já analisa um único mês.

### Olho de esconder valores

Um ícone de olho no header oculta/revela todos os valores em R$ da Home, inclusive eixos de gráfico e
mini-gráficos. Por padrão (a cada abertura) os valores ficam **ocultos** — pensado pra abrir o app em
público sem expor números. Percentuais continuam visíveis. É só de UI, não afeta o backend.

## Resumo Mensal (`GET /resumo/mensal?ano=&mes=`)

Métricas do mês selecionado:

- Total de gastos, separado em essenciais e não essenciais (com o % de cada sobre o total)
- Quantidade de gastos (cada parcela que cai no mês conta como 1) e de receitas
- Média **por lançamento** (total do mês ÷ quantidade) — num único mês, "média mensal" não faria
  sentido
- Caixa pretendido (soma de `cash_value` das receitas) e caixa real (receita − gastos)
- "Para onde foi o dinheiro": percentual de cada categoria sobre o total, numa lista só, **ordenada
  do maior pro menor** e numa escala comum (a barra da maior categoria enche a largura; não por 100%,
  senão as barras ficariam quase vazias). A cor e o ponto dizem a prioridade. Mostra as 8 maiores, com
  "Ver as N categorias"
- Ao lado da lista, os **Indicadores** (ver abaixo)
- Mini-gráficos (sparklines) de tendência dos últimos 6 meses nos cards de gastos, essenciais, não
  essenciais e caixa real (com uma linha fraca no zero quando a série cruza o zero)

O primeiro card é **"Disponível pra gastar"**, com destaque em gradiente verde (vermelho se negativo):

```
Disponível pra gastar = Receita total do mês − Gasto total do mês − Caixa pretendido do mês
```

Usa o caixa **pretendido**, não o real: a ideia é mostrar quanto ainda dá pra gastar sem comer a
reserva que se planejou guardar.

### Projeção do fim do mês (`GET /resumo/previsao`)

!!! note "Card removido da Home em 2026-10-05"
    A pedido do usuário, o card saiu do Resumo mensal (web e celular). O endpoint continua no backend,
    sem nenhuma tela chamando — a descrição abaixo fica como referência caso ele volte.

Era exibido **só quando o seletor estava no mês atual**. Estima quanto vai sobrar no fim do mês:

```
Saldo previsto = Receita − Já lançado no mês − Gasto variável que ainda falta − Caixa pretendido
```

- **Já lançado no mês**: tudo que tem data no mês, inclusive parcelas e lançamentos com data futura.
- **Variável que falta**: o quanto você costuma gastar em avulsos (não parcelados) **depois** do
  "dia de hoje" — mediana, nos seus últimos 12 meses, do gasto avulso com data depois desse dia —
  menos os avulsos já lançados com data futura neste mês (eles já estão em "Já lançado"). Como é medido
  pelo histórico de cada usuário, vale pra qualquer padrão: quem gasta pesado no começo do mês, no
  meio ou no fim. Uma versão anterior extrapolava pelo ritmo (gasto até hoje ÷ fração do mês já gasta
  até esse dia) e, no começo do mês, duas compras maiores chegavam a projetar o dobro do mês normal.
- **Receita**: a lançada no mês; se nada foi lançado ainda, a mediana dos últimos 6 meses (mediana,
  não média, pra 13º e PLR não puxarem pra cima), com o caixa pelo % padrão do usuário.
- **Faixa**: "entre X e Y" vem dos percentis 25/75 do mesmo valor (gasto depois do dia de hoje); sempre contém
  o valor central e some quando os dois extremos coincidem.
  Com menos de 3 meses de histórico, aparece o aviso "projeção aproximada".

"Como calculamos" abre a decomposição num balão (popover) em vez de expandir o card — na web, expandir
esticava a linha inteira de cards.

### Botão "Ver detalhes"

Ao lado do seletor, abre um modal **só de leitura** com a visão completa do mês (editar e excluir ficam
em Visualizar dados). Os dados vêm de `GET /resumo/mensal/detalhes` mais as listas de `/gastos` e
`/receitas`:

- **Navegação**: setas "‹ ›" trocam de mês sem fechar o modal; um selo diz se o mês está em andamento
  ("dia 5 de 31"), encerrado ou é futuro.
- **Resumo**: Disponível pra gastar, Receita, Gastos, Caixa pretendido e Caixa real, cada um comparado
  com a média dos 3 meses anteriores que tiveram lançamento (mesma regra do resumo da virada do mês).
  Disponível e Caixa real, que podem ser negativos, comparam pela diferença em R$ ("R$ 300 acima da
  média"), não em %. Cor pelo sentido: gasto subir é vermelho, receita subir é verde, caixa
  pretendido é neutro. Uma barra mostra quanto da receita foi pra gastos, pra caixa e quanto sobra
  (ou quanto passou da receita).
- **Para onde foi o dinheiro**: total por categoria (com parcelas), % do mês, quantidade de
  lançamentos e variação contra a média (categoria que não apareceu nos meses base = "Novo neste
  mês"). Mostra as 8 maiores, com "Ver todas". Tocar numa categoria filtra a lista.
- **Como o gasto se compõe**: recorrentes, parcelas, avulsos essenciais e não essenciais.
- **Ainda vai cair este mês** (mês atual ou futuro): até hoje × programado, com a lista do que tem
  data depois de hoje.
- **Lançamentos**: agrupados por categoria (padrão), ou por valor ou por data; chips Essencial, Não
  essencial, Parcelado, Recorrente e Com anexo; o anexo abre a lista com pré-visualização. Na visão por
  valor, os 3 maiores ganham um selo neutro "1º/2º/3º maior" (antes eram destacados em vermelho, que no
  app significa negativo).
- Respeita o olho da Home: R$ ocultos, percentuais visíveis.

## Indicadores (`GET /resumo/indicadores?ate_ano=&ate_mes=`)

Bloco ao lado das categorias do Resumo mensal. O mês de referência é o do corte (checkbox ligado) ou o mês atual.
Percentuais ficam sempre visíveis, mesmo com o olho fechado.

| Indicador | Como é calculado |
|---|---|
| **Taxa de poupança** | Caixa real ÷ receita, numa janela móvel dos últimos 3 meses (somas, não média de percentuais), com sparkline da série mensal |
| **Comprometimento futuro** | Parcelas já lançadas nos próximos 6 meses ÷ (receita média dos últimos 6 meses × 6), com a distribuição por mês |
| **Custo fixo** | Soma das contas que se repetem ÷ receita média de 3 meses (ver regra abaixo) |
| **% essencial** | Gastos essenciais ÷ total, mês a mês, com tendência em pontos percentuais por mês (regressão linear) |

**Regra do custo fixo** (recorrência detectada pela descrição): gasto avulso com a mesma descrição
(ignorando maiúsculas e acentos), uma vez por mês, em pelo menos 3 dos últimos 4 meses, com valor
estável (todos até 15% da mediana). Cada conta entra pela mediana. **Séries com fim definido ficam de
fora** — eram compras parceladas lançadas como avulsas (o histórico importado não marcava parcelas) e
viravam "conta fixa" por engano:

- sai a série que tem lançamento depois do mês seguinte ao de referência (o app não deixa lançar tão
  adiantado — só parcela chega lá);
- sai a série que já parou (sem lançamento no mês de referência; no mês em andamento, só depois que o
  dia de costume passou, porque a conta pode só não ter sido lançada ainda);
- série ligada a uma [recorrência](#gastos-e-receitas-recorrentes) sempre conta.

A lista "Ver n contas" abre num balão (popover) em vez de expandir o card — na web, expandir esticava a linha inteira de cards.

## Resumo Anual (`GET /resumo/anual?ano=&meses=&ate_ano=&ate_mes=`)

Métricas do ano do seletor (calendário jan–dez, limitado ao corte se o checkbox estiver ligado):

- Receita total e total de gastos, separado em essenciais e não essenciais (com o %)
- Quantidade de gastos (cada parcela conta como 1 — uma compra em 3x são 3 gastos) e de receitas
- Média **mensal** de gastos e de receitas (total ÷ número de meses com dados)
- Caixa pretendido e caixa real do ano
- Categorias do ano: a mesma lista do mensal, começando recolhida ("Categorias no ano")

### Gráfico 1 — Linhas ("Gastos essenciais × não essenciais")

Janela rolante de 12 meses terminando no mês atual (ou no do corte): gastos essenciais e não
essenciais, com o eixo a partir do zero e o nome escrito no fim de cada linha. Linhas de tendência
(regressão linear, `shared/linear-regression.ts`) fora da legenda, e uma frase com a inclinação
("essenciais subindo R$ 14/mês"). O caixa real fica no Gráfico 2.

### Gráfico 2 — Painéis empilhados ("Caixa real vs. meta")

Mesma janela do Gráfico 1 — não são os meses do ano selecionado; os dois gráficos sempre olham pra trás
a partir de hoje (ou do corte), pra ficarem consistentes entre si.

Três painéis com o mesmo eixo de meses, cada um com o próprio eixo Y (nunca dois eixos no mesmo
gráfico — os zeros ficavam em alturas diferentes):

- **Receita** do mês, num painel baixo
- **Caixa real** em barra, com o **caixa pretendido** como um traço (a meta) — mais a frase "Caixa
  real ficou acima da meta em X de N meses"
- `caixa real ÷ gastos` do mês, como **razão** (0,5 / 1,0 / 1,5), não porcentagem — igual à planilha
  original em Excel

Os dois gráficos têm um ícone de expandir que abre um modal fullscreen com seletor de janela 12/24/36
meses (parâmetro `meses`).

Nos gráficos mensais (Evolução, Caixa real vs. meta, Análise inflacionária e o de Manutenção
Veículos), o ano aparece embaixo do mês no primeiro ponto e em cada janeiro, uma linha tracejada marca
a virada do ano e o tooltip mostra mês/ano ("Fev/2025") — `shared/month-axis.ts`.

## Relatório Geral (`GET /resumo/geral?ate_ano=&ate_mes=`)

Sem seletor próprio (só o checkbox de corte). Mostra **totais** (não médias) de todo o histórico:

- **Para onde foi a receita**: uma faixa dividida em essenciais + não essenciais + caixa real (a soma
  é a receita), com os totais embaixo, inclusive o caixa pretendido
- **Por ano**: cada barra é a receita do ano, dividida em essenciais + não essenciais + a sobra
  (caixa real, em cinza no topo), dentro do contorno da receita. O caixa real vai escrito dentro da
  sobra quando cabe, senão logo acima, com sinal ("+R$ 5,9 mil"). Num ano em que se gastou mais que a
  receita, os gastos passam do contorno. O caixa pretendido aparece ao tocar
- **Por mês do calendário**: o mesmo, por mês (jan–dez) somando todos os anos — revela sazonalidade
  (ex: dezembro sempre mais alto). No celular, vira barras horizontais

Só essenciais e não essenciais têm cor própria: é o único par de cores que continua distinguível para
daltônicos em todos os 15 temas.

## Análise inflacionária (`GET /resumo/inflacao?ate_ano=&ate_mes=`)

Índice de inflação **pessoal** — não é o IPCA nem índice oficial nenhum. Mede quanto os gastos do
próprio usuário numa "cesta" de categorias essenciais estão subindo. Como o app guarda totais por
categoria/mês (não preço × quantidade), o índice é "spend-based": soma a cesta inteira a cada mês e
mede a variação % dessa soma — o que pondera cada categoria pelo próprio peso, sem peso manual.

- **Cesta**: marcada no modal Categorias, com um toggle "Cesta de inflação" em cada categoria
  essencial. Não é versionada no tempo: reflete a seleção **atual** e o índice é recalculado sobre todo
  o histórico — trocar a cesta muda o gráfico retroativamente, de propósito.
- **Mês a mês / Ano a ano** (`ion-segment`), sobre uma janela rolante de 12 meses que segue o corte.
- Card de destaque com a variação mais recente (verde/vermelho conforme o sinal).
- Dois painéis com o mesmo eixo de meses: a inflação da cesta em barras em torno do zero (colorida
  quando ficou mais cara, cinza quando mais barata) e, embaixo, `caixa real ÷ gastos` do mês (%) — dá
  pra ver se o caixa acompanha a própria inflação. Mês sem gasto na cesta-base fica sem barra, não
  zero (pra não inventar dado).
- Sem nenhuma categoria na cesta: mensagem com atalho pro modal Categorias.

!!! note "Módulo opcional"
    A análise é o módulo `analise_inflacionaria`, sem tela própria. Sem ele, a seção some da Home, os
    toggles somem de Categorias e o backend responde 403 em `/resumo/inflacao` (e no
    `PUT /dropdown-options/{id}` que tente mudar `include_in_inflation`). A marcação continua no banco.

## Alerta de anomalia ao salvar gasto (`GET /gastos/anomalia?item_id=&value=`)

Em Adicionar/Editar gasto (não parcelado), antes de salvar, o app pergunta se o valor está muito acima
do normal da categoria e pede confirmação. Usa um z-score **robusto** (mediana e MAD, que não se
deixam puxar por um gasto atípico antigo) sobre os gastos avulsos da categoria nos últimos 12 meses:

- precisa de pelo menos 6 lançamentos de referência, senão nunca alerta;
- alerta com z > 3,5 **e** diferença de pelo menos R$ 50;
- se os valores forem sempre iguais (MAD = 0), alerta a partir de 3× a mediana.

Se a checagem falhar (rede, servidor), o gasto é salvo normalmente — o alerta ajuda, não bloqueia.

## Resumo da virada do mês (`GET /notificacoes`)

No dia 1, aparece no sino da Home (e num card no topo) um resumo do mês que acabou. É gerado **sob
demanda, sem cron**: ao listar as notificações, o backend grava o resumo do mês anterior se ainda não
existir. Regras:

- Só o mês anterior, nunca meses mais antigos — quem ficou meses sem abrir o app não recebe uma
  enxurrada. Mês sem nenhum lançamento não gera resumo.
- **No máximo 12 resumos**: os de mês de referência fora dos últimos 12 meses são apagados.
- O conteúdo é uma **foto** do momento da geração; lançamentos editados depois não mudam o resumo.

Conteúdo:

- Gastos, receita, caixa real e caixa pretendido, com variação contra a **média dos 3 meses
  anteriores** (só meses com algum lançamento)
- Taxa de poupança (caixa real ÷ receita), com o pretendido como meta
- Categorias que **subiram** e que **caíram** (até 3 cada) e **gastos pontuais**
- Parcelamentos novos e encerrados
- Inflação da cesta (só com o módulo) e parcelas de devedor em atraso (só com o módulo)

Nas categorias entram só gastos **sem parcela** (uma compra em 10x não pode aparecer como "subiu" por
10 meses), e só variações com `|variação| ≥ 20%` **e** `|diferença| ≥ R$ 50` — abaixo disso é ruído.
Uma categoria precisa ter gasto em 2 dos 3 meses-base pra ter média; senão, se passar de R$ 50, vira
"pontual". O modal do resumo respeita o olho de esconder valores (só os R$ somem).

## Gastos e receitas recorrentes

"Repetir todo mês" + "Dia do mês" em Adicionar gasto/receita. O lançamento salvo é o primeiro; a regra
gera os próximos a partir do mês seguinte. Opcionalmente, "Tem data de término" define o último mês
(inclusive) já no cadastro — ao ligar, vem preenchido com 12 lançamentos contando o atual, e o campo
mostra quantos lançamentos serão e a data do último; sem data, a recorrência repete sem fim. Efeito nos
números:

- Cada mês gerado é um gasto/receita comum, criado **na virada do mês** já com a data do dia escolhido
  — por isso já conta no resumo mensal, nos indicadores e na **projeção do fim do mês** desde o dia 1,
  como uma parcela. Na projeção ele entra em "já lançado", não em "variável que falta".
- Dia que não existe no mês vira o último dia (31 → 30/04, 28/02).
- Meses em que ninguém abriu o app são todos criados ao voltar.
- Gasto recorrente não passa pelo alerta de anomalia e não pode ser parcelado.
- No custo fixo dos Indicadores, uma série ligada a uma recorrência sempre conta.

A aba **Recorrências** de `/dados` lista as regras (ativa/pausada/encerrada, próxima data) e permite
editar (vale dos próximos em diante, inclusive um mês de término opcional), pausar/retomar (retomar não
cria os meses parados) e excluir — para de gerar e mantém os lançamentos já criados, que viram avulsos.

## Visualizar dados (`/dados`)

Não calcula métricas, mas é onde se gerenciam os lançamentos que alimentam tudo acima:

- Abas Gastos, Receitas e Recorrências; tabelas por data decrescente, 25 linhas por vez com "Carregar
  mais" (`GET /gastos`/`GET /receitas` retornam `{ items, total }`)
- Filtro opcional por mês e/ou ano (sem filtro por padrão), ordenação por coluna (client-side, sobre o
  que já foi carregado)
- Editar abre o modal pré-preenchido; em gasto parcelado, a edição replica no grupo inteiro. Excluir
  some na hora com "Desfazer" por 5 s
- Lançamento gerado por recorrência mostra um ícone de repetição ao lado da data

## Manutenção Veículos (`/veiculos`)

Módulo opcional, fora da Home:

- **Cards por veículo**: total gasto, quantidade de serviços e último serviço
  (`GET /veiculos/resumo?ano=&mes=`). O filtro de mês/ano no topo (vazio por padrão = histórico
  inteiro) afeta **só** esses cards
- **Gráfico "Evolução de gastos"**: uma linha por veículo, sempre a janela rolante dos últimos 12
  meses, independente do filtro — mostrar uma janela fixa é justamente o propósito dele
- Tabelas de veículos e de serviços (paginada, com busca e filtro por veículo próprios)
- Quilometragem obrigatória e sempre crescente por veículo: um serviço não pode ter km menor que o
  anterior nem maior que o seguinte

## Ferramentas (`/ferramentas`)

Duas calculadoras, 100% client-side e sem salvar nada (`pages/ferramentas/calculators.ts`, funções
puras testadas):

- **Juros compostos**: valor inicial + aporte mensal reajustado uma vez por ano, com a rentabilidade
  anual convertida pra taxa mensal equivalente (`(1 + anual)^(1/12) − 1`). Mostra valor acumulado,
  total investido, rendimento e a taxa mensal.
- **À vista vs. a prazo**: decide por **valor presente líquido** — cada parcela (paga no fim do mês k)
  é descontada pelo CDI mensal líquido de IR (o custo de oportunidade) e a soma é comparada com o
  preço à vista: VP maior que o à vista → vale pagar à vista. A alíquota de IR segue a tabela
  regressiva pelo prazo (22,5% / 20% / 17,5% / 15%), com opção de definir manualmente. Uma tabela mês
  a mês colapsável simula investir o valor à vista e ir pagando as parcelas, só como informação (se o
  saldo zerar antes do fim, a tabela para ali com um aviso; a conclusão por VPL não muda).

## Exportar Dados (`/exportar-dados`, `GET /export/{modulo}`)

Módulo opcional. Um cartão por módulo (Gastos, Receitas, Manutenção Veículos, Operações Bolsa,
Devedores, Categorias — só os habilitados pro usuário), cada um baixando um `.zip` só daquele módulo:

- CSV com `;`, encoding latin-1 e vírgula decimal — abre direto no Excel em português
- Pasta `anexos/` com os comprovantes dos registros exportados; a coluna `anexos` do CSV traz o nome
  do arquivo dentro do zip. Anexo de grupo parcelado aparece em todas as parcelas no CSV, mas entra
  uma vez só no zip
- Categorias exporta ativas e inativas (é cópia de backup); Veículos gera dois CSVs
- No navegador baixa direto; no APK abre a folha de compartilhar, porque arquivos gravados pelo app em
  `Documents` ficam invisíveis pros outros apps a partir do Android 11
