import '../shared/chart-setup';
import { Chart, ChartConfiguration } from 'chart.js';

import { ResumoGeral, ResumoGeralAno, ResumoGeralMes } from '../services/resumo.service';
import { DirectLabel, formatMil } from '../shared/chart-plugins';
import { MESES_ABREV } from '../shared/months';
import { chartColors, themeInk, withAlpha } from '../shared/themes';

// Relatório geral (avaliação de gráficos de 2026-10-10): antes eram 3 gráficos com 5 séries
// coloridas cada -- conjunto reprovado no validador de daltonismo nos 15 temas, e 60 barras no
// celular. Agora só Essenciais × Não essenciais têm cor forte (o único par que passa em todos os
// temas). Cada barra é a receita inteira: Essenciais + Não essenciais + a sobra (caixa real, em tom
// claro), com o contorno da receita em volta -- o topo da pilha bate com a receita no eixo, e o número
// do caixa real fica dentro do pedaço que ele mede. (Na 1ª versão a sobra era só um espaço vazio e o
// número ficava no topo do contorno: lido contra o eixo, "R$ 26 mil" parecia estar na altura de 50 mil.)
// O caixa pretendido fica no tooltip.

type Linha = Pick<
  ResumoGeralAno,
  'total_essenciais' | 'total_nao_essenciais' | 'total_receita' | 'total_caixa_pretendido' | 'total_caixa_real'
>;

const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Índice do dataset da sobra (caixa real) -- usado pelo rótulo e pelo tooltip. */
export const SOBRA_DATASET = 3;

/**
 * Contorno da receita + Essenciais, Não essenciais e Sobra (caixa real ≥ 0) empilhados, na mesma
 * posição e largura. Num período em que gastou mais que recebeu, a sobra é 0 e os gastos passam do
 * contorno.
 */
function buildHistoricoData(rows: Linha[], labels: string[], horizontal: boolean): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  const largura = { grouped: false, barPercentage: 0.62, categoryPercentage: 0.9 };
  const gastos = { stack: 'gastos', order: 1, ...largura };
  // 2px da cor do cartão separando cada segmento do de baixo (sem borda em volta das barras).
  const folga = { borderColor: themeInk().cartao, borderWidth: horizontal ? { left: 2 } : { bottom: 2 } };
  return {
    labels,
    datasets: [
      {
        label: 'Receita',
        data: rows.map((r) => r.total_receita),
        backgroundColor: 'transparent',
        borderColor: c.texto,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
        stack: 'receita',
        // order menor = desenhado por cima: o contorno fica visível sobre a pilha.
        order: 0,
        ...largura,
      },
      {
        label: 'Essenciais',
        data: rows.map((r) => r.total_essenciais),
        backgroundColor: c.essencial,
        borderSkipped: false,
        ...gastos,
      },
      {
        label: 'Não essenciais',
        data: rows.map((r) => r.total_nao_essenciais),
        backgroundColor: c.naoEssencial,
        borderSkipped: false,
        ...folga,
        ...gastos,
      },
      {
        label: 'Caixa real (sobra)',
        data: rows.map((r) => Math.max(r.total_caixa_real, 0)),
        // Véu claro do texto do tema (não uma cor de série): a região é marcada pelo contorno da
        // receita (≥ 3:1) e pelo número dentro dela. Verde translúcido escurecia sobre o fundo
        // escuro, e um bloco sólido quase branco incomoda a vista (mesma razão de não ter branco).
        backgroundColor: withAlpha(themeInk().texto, 0.16),
        borderRadius: horizontal ? { topRight: 4, bottomRight: 4 } : { topLeft: 4, topRight: 4 },
        borderSkipped: false,
        ...folga,
        ...gastos,
      },
    ],
  } as ChartConfiguration<'bar'>['data'];
}

export function buildPorAnoChartData(anos: ResumoGeralAno[]): ChartConfiguration<'bar'>['data'] {
  return buildHistoricoData(anos, anos.map((a) => String(a.ano)), false);
}

export function buildPorMesChartData(geral: ResumoGeral | null, horizontal = false): ChartConfiguration<'bar'>['data'] {
  const porMes = geral?.por_mes ?? [];
  return buildHistoricoData(porMes, porMes.map((m: ResumoGeralMes) => MESES_ABREV[m.mes - 1]), horizontal);
}

/**
 * Quais barras levam o caixa real escrito: todas quando cabem (até 6 barras, ou barras horizontais);
 * senão só o maior e o menor, pra não virar um número em cada barra.
 */
export function caixaLabelIndexes(rows: Linha[], horizontal: boolean): number[] {
  const idx = rows.map((_, i) => i);
  if (horizontal || rows.length <= 6) return idx;
  const v = rows.map((r) => r.total_caixa_real);
  const maior = v.indexOf(Math.max(...v));
  const menor = v.indexOf(Math.min(...v));
  return maior === menor ? [maior] : [maior, menor];
}

/** Opções do "Por ano" / "Por mês". `compacto`: rótulo sem "R$" (colunas estreitas no celular). */
export function historicoChartOptions(
  rows: Linha[],
  { horizontal = false, compacto = false }: { horizontal?: boolean; compacto?: boolean } = {},
): ChartConfiguration<'bar'>['options'] {
  const c = chartColors();
  const ink = themeInk();
  const items: DirectLabel[] = caixaLabelIndexes(rows, horizontal).map((i) => {
    const text = formatMil(rows[i].total_caixa_real, compacto, true);
    return {
    text,
    dx: 0,
    // Dentro da sobra, quando cabe; senão logo depois da ponta mais distante (receita ou gastos --
    // num período que gastou mais que recebeu, os gastos passam do contorno), no tom de bom/ruim.
    at: (chart: Chart) => {
      type Bar = { x: number; y: number; base: number; width: number; height: number };
      const receita = chart.getDatasetMeta(0).data[i] as unknown as Bar | undefined;
      const gastosTopo = chart.getDatasetMeta(2).data[i] as unknown as Bar | undefined;
      const sobra = chart.getDatasetMeta(SOBRA_DATASET).data[i] as unknown as Bar | undefined;
      if (!receita || !gastosTopo || !sobra) return null;
      const fora = { color: rows[i].total_caixa_real >= 0 ? ink.positivo : ink.negativo };
      // O plugin já pôs a fonte do rótulo no ctx: dá pra medir se o texto cabe dentro da sobra.
      const larguraTexto = chart.ctx.measureText(text).width;
      if (horizontal) {
        if (Math.abs(sobra.x - sobra.base) >= larguraTexto + 12 && sobra.height >= 16)
          return { x: (sobra.x + sobra.base) / 2, y: sobra.y, align: 'center', color: ink.texto };
        return { x: Math.max(receita.x, gastosTopo.x, sobra.x) + 6, y: receita.y, align: 'left', ...fora };
      }
      if (Math.abs(sobra.base - sobra.y) >= 20 && sobra.width >= larguraTexto + 8)
        return { x: sobra.x, y: (sobra.y + sobra.base) / 2, align: 'center', color: ink.texto };
      return { x: receita.x, y: Math.min(receita.y, gastosTopo.y, sobra.y) - 10, align: 'center', ...fora };
    },
    };
  });
  const valor = { grid: { color: c.grade }, border: { display: false }, stacked: true, beginAtZero: true, ticks: { color: c.texto, maxTicksLimit: 5 } };
  // Horizontal (celular): os 12 meses sempre aparecem (o pulo automático escondia Fev, Abr...).
  const categoria = { grid: { display: false }, stacked: true, ticks: { color: c.texto, autoSkip: !horizontal } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    layout: { padding: horizontal ? { right: 84 } : { top: 22, right: 40 } },
    scales: horizontal ? { y: categoria, x: valor } : { x: categoria, y: valor },
    plugins: {
      legend: {
        position: 'top',
        labels: { color: c.texto, boxWidth: 10, boxHeight: 10 },
      },
      tooltip: {
        callbacks: {
          // A sobra desenhada nunca é negativa; o tooltip mostra o caixa real de verdade.
          label: (i: { datasetIndex: number; dataIndex: number; dataset: { label?: string }; raw: unknown }) =>
            i.datasetIndex === SOBRA_DATASET
              ? `Caixa real: ${BRL0.format(rows[i.dataIndex].total_caixa_real)}`
              : `${i.dataset.label}: ${BRL0.format(Number(i.raw))}`,
          footer: (tooltipItems: { dataIndex: number }[]) =>
            `Caixa pretendido: ${BRL0.format(rows[tooltipItems[0].dataIndex].total_caixa_pretendido)}`,
        },
      },
      directLabels: { items },
    },
  } as unknown as ChartConfiguration<'bar'>['options'];
}

/** Segmento da faixa "Para onde foi a receita". */
export interface FluxoSegmento {
  chave: 'essencial' | 'nao_essencial' | 'caixa';
  rotulo: string;
  valor: number;
  /** % da receita (pode passar de 100 nos gastos quando o caixa real é negativo). */
  pct: number;
  cor: string;
}

/**
 * A receita do histórico dividida em Essenciais + Não essenciais + Caixa real (a soma fecha, porque
 * caixa real = receita − gastos). Com caixa real negativo, a faixa mostra só os gastos (que passaram
 * da receita) -- o aviso fica com quem desenha.
 */
export function buildFluxo(geral: ResumoGeral | null): FluxoSegmento[] {
  if (!geral || geral.total_receita <= 0) return [];
  const c = chartColors();
  const base = geral.total_receita;
  const segs: FluxoSegmento[] = [
    { chave: 'essencial', rotulo: 'Essenciais', valor: geral.total_essenciais, pct: 0, cor: c.essencial },
    { chave: 'nao_essencial', rotulo: 'Não essenciais', valor: geral.total_nao_essenciais, pct: 0, cor: c.naoEssencial },
    { chave: 'caixa', rotulo: 'Caixa real', valor: geral.total_caixa_real, pct: 0, cor: c.caixaReal },
  ];
  return segs.map((s) => ({ ...s, pct: (s.valor / base) * 100 }));
}
