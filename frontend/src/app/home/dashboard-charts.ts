import '../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { CaixaMes, EvolucaoMes, InflacaoPonto } from '../services/resumo.service';
import { DirectLabel, fixedAxisWidth, formatMil, isNarrowScreen } from '../shared/chart-plugins';
import { linearTrend } from '../shared/linear-regression';
import { MonthLabel, monthAxisLabels, monthTicks } from '../shared/month-axis';
import { chartColors, themeInk, withAlpha } from '../shared/themes';

// Cores dos gráficos: vêm do tema ativo (shared/themes.ts, escolhido no Perfil). Cada montador lê
// `chartColors()` na hora -- chamado dentro de um computed(), o gráfico se redesenha quando o tema muda.
//
// Regras da avaliação de gráficos de 2026-10-10 (validadas nos 15 temas):
// - nunca dois eixos Y no mesmo gráfico: medidas de escala diferente vão em painéis empilhados, com o
//   mesmo eixo de meses e o eixo Y com largura fixa (`fixedAxisWidth`) pra os meses alinharem;
// - no máximo o par Essenciais × Não essenciais em cor no mesmo gráfico (o único par que passa no
//   validador de daltonismo em todos os temas); o resto em contorno, traço ou painel próprio;
// - nome da série escrito no fim da linha (`directLabels`), além da legenda -- não em tela estreita.
export { chartColors };

export function formatComma(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Espaço à direita do gráfico pro rótulo direto (nada em tela estreita). */
function rightPad(px: number): number {
  return isNarrowScreen() ? 4 : px;
}

function monthAxis(labels: MonthLabel[], showTicks = true): Record<string, unknown> {
  const c = chartColors();
  return {
    grid: { display: false },
    ticks: { color: c.texto, display: showTicks, ...monthTicks(labels, isNarrowScreen()) },
  };
}

/** Eixo de valor dos painéis empilhados: largura fixa e poucos ticks. */
function panelValueAxis(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const c = chartColors();
  return {
    grid: { color: c.grade },
    border: { display: false },
    afterFit: fixedAxisWidth,
    ...extra,
    ticks: { color: c.texto, maxTicksLimit: 4, ...((extra['ticks'] as object) ?? {}) },
  };
}

// --- Evolução: essenciais × não essenciais, com tendência --------------------------------------------

export function buildLineChartData(evolucao: EvolucaoMes[]): ChartConfiguration<'line'>['data'] {
  const c = chartColors();
  const essenciais = evolucao.map((m) => m.essencial);
  const naoEssenciais = evolucao.map((m) => m.nao_essencial);
  // 24/36 meses: sem marcador fixo (vira uma parede de pontos); o ponto aparece ao tocar.
  const pointRadius = evolucao.length > 12 ? 0 : 3;

  return {
    labels: monthAxisLabels(evolucao),
    datasets: [
      {
        label: 'Essenciais',
        data: essenciais,
        borderColor: c.essencial,
        backgroundColor: c.essencial,
        pointStyle: 'circle',
        pointRadius,
        pointHoverRadius: 4,
        borderWidth: 2,
        fill: false,
      },
      {
        label: 'Não essenciais',
        data: naoEssenciais,
        borderColor: c.naoEssencial,
        backgroundColor: c.naoEssencial,
        pointStyle: 'circle',
        pointRadius,
        pointHoverRadius: 4,
        borderWidth: 2,
        fill: false,
      },
      {
        label: 'Tendência essenciais',
        data: linearTrend(essenciais),
        borderColor: withAlpha(c.essencial, 0.55),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        cubicInterpolationMode: 'default',
        fill: false,
      },
      {
        label: 'Tendência não essenciais',
        data: linearTrend(naoEssenciais),
        borderColor: withAlpha(c.naoEssencial, 0.55),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
        cubicInterpolationMode: 'default',
        fill: false,
      },
    ],
  };
}

export function lineChartOptions(evolucao: EvolucaoMes[] = []): ChartConfiguration<'line'>['options'] {
  const c = chartColors();
  const labels = monthAxisLabels(evolucao);
  const last = evolucao.length - 1;
  const items: DirectLabel[] =
    isNarrowScreen() || last < 0
      ? []
      : [
          { datasetIndex: 0, index: last, text: 'Essenciais' },
          { datasetIndex: 1, index: last, text: 'Não essenciais' },
        ];
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { right: rightPad(104) } },
    scales: {
      x: monthAxis(labels),
      y: { beginAtZero: true, grid: { color: c.grade }, ticks: { color: c.texto } },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          color: c.texto,
          filter: (item) => !item.text.startsWith('Tendência'),
        },
      },
      tooltip: { filter: (item) => item.datasetIndex < 2 },
      directLabels: { items },
    },
  } as ChartConfiguration<'line'>['options'];
}

/** Inclinação (R$/mês) das linhas de tendência -- a mesma regressão desenhada no gráfico. */
export function evolucaoTendencia(evolucao: EvolucaoMes[]): { essencial: number; naoEssencial: number } | null {
  if (evolucao.length < 2) return null;
  const slope = (values: number[]) => {
    const t = linearTrend(values);
    return t[1] - t[0];
  };
  return {
    essencial: slope(evolucao.map((m) => m.essencial)),
    naoEssencial: slope(evolucao.map((m) => m.nao_essencial)),
  };
}

/** "Tendência: essenciais subindo R$ 14/mês, não essenciais caindo R$ 79/mês." (vazio se oculto) */
export function evolucaoHeadline(evolucao: EvolucaoMes[], oculto: boolean): string {
  const t = evolucaoTendencia(evolucao);
  if (!t || oculto) return '';
  const fmt = (v: number) => (Math.round(v) === 0 ? 'estáveis' : `${v > 0 ? 'subindo' : 'caindo'} ${BRL0.format(Math.abs(v))}/mês`);
  return `Tendência: essenciais ${fmt(t.essencial)}, não essenciais ${fmt(t.naoEssencial)}.`;
}

// --- Caixa real vs. meta: 3 painéis com o mesmo eixo de meses -----------------------------------------
// Antes: colunas de receita/caixa pretendido/caixa real + linha da razão num 2º eixo Y. A receita
// (~10x o caixa) espremia as barras de caixa, e os dois zeros ficavam em alturas diferentes.

/** Traço da meta: largura ~ a da barra, menor quando há muitos meses ou a tela é estreita. */
function metaTickRadius(n: number): number {
  const narrow = isNarrowScreen();
  if (n > 12) return narrow ? 2 : 5;
  return narrow ? 7 : 12;
}

export function buildCaixaReceitaData(rows: CaixaMes[]): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  return {
    labels: monthAxisLabels(rows),
    datasets: [
      {
        label: 'Receita',
        data: rows.map((m) => m.receita),
        backgroundColor: c.receita,
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.62,
        categoryPercentage: 0.9,
      },
    ],
  };
}

export function buildCaixaMetaData(rows: CaixaMes[]): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  const ink = themeInk();
  const r = metaTickRadius(rows.length);
  return {
    labels: monthAxisLabels(rows),
    datasets: [
      {
        type: 'bar' as const,
        label: 'Caixa real',
        data: rows.map((m) => m.caixa_real),
        backgroundColor: c.caixaReal,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.62,
        categoryPercentage: 0.9,
        order: 2,
      },
      {
        type: 'line' as const,
        label: 'Caixa pretendido (meta)',
        data: rows.map((m) => m.caixa_pretendido),
        showLine: false,
        pointStyle: 'line',
        pointRadius: r,
        pointHoverRadius: r,
        pointBorderWidth: 2.5,
        pointHoverBorderWidth: 2.5,
        borderColor: ink.texto,
        backgroundColor: ink.texto,
        order: 1,
      },
    ],
  } as unknown as ChartConfiguration<'bar'>['data'];
}

export function buildCaixaRazaoData(rows: CaixaMes[]): ChartConfiguration<'line'>['data'] {
  const c = chartColors();
  return {
    labels: monthAxisLabels(rows),
    datasets: [
      {
        label: 'Caixa real ÷ gastos',
        data: rows.map((m) => m.proporcao_caixa_real / 100),
        borderColor: c.razao,
        backgroundColor: c.razao,
        pointStyle: 'circle',
        pointRadius: rows.length > 12 ? 0 : 2.5,
        pointHoverRadius: 4,
        borderWidth: 2,
        fill: false,
      },
    ],
  };
}

/** Opções dos 3 painéis. `painel` decide formato dos ticks, rótulo direto e se mostra os meses. */
export function caixaPanelOptions<T extends 'bar' | 'line' = 'bar'>(
  painel: 'receita' | 'meta' | 'razao',
  rows: CaixaMes[],
): ChartConfiguration<T>['options'] {
  const labels = monthAxisLabels(rows);
  const last = rows.length - 1;
  const narrow = isNarrowScreen();
  const ultimo = rows[last];
  const items: DirectLabel[] = [];
  if (!narrow && ultimo) {
    if (painel === 'meta') items.push({ datasetIndex: 0, index: last, text: formatMil(ultimo.caixa_real), dx: 14 });
    if (painel === 'razao') items.push({ datasetIndex: 0, index: last, text: formatComma(ultimo.proporcao_caixa_real / 100) });
  }
  const brl = (i: { dataset: { label?: string }; raw: unknown }) => `${i.dataset.label}: ${BRL0.format(Number(i.raw))}`;
  const ticks =
    painel === 'razao'
      ? { maxTicksLimit: 3, callback: (v: number) => formatComma(Number(v)) }
      : { maxTicksLimit: painel === 'receita' ? 2 : 4, callback: (v: number) => Number(v).toLocaleString('pt-BR') };
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { right: rightPad(64) } },
    scales: {
      // Só o painel de baixo mostra os meses; os de cima ficam alinhados a ele.
      x: monthAxis(labels, painel === 'razao'),
      y: panelValueAxis({ ticks, ...(painel === 'receita' ? { beginAtZero: true } : {}) }),
    },
    plugins: {
      legend: { display: false },
      zeroLine: { axis: 'y' },
      tooltip: {
        callbacks:
          painel === 'razao'
            ? { label: (i: { raw: unknown }) => `Caixa real ÷ gastos: ${formatComma(Number(i.raw))}` }
            : {
                label: brl,
                ...(painel === 'meta' ? { footer: (items: { dataIndex: number }[]) => `Receita: ${BRL0.format(rows[items[0].dataIndex].receita)}` } : {}),
              },
      },
      directLabels: { items },
    },
  } as unknown as ChartConfiguration<T>['options'];
}

/** "Caixa real ficou acima da meta em 2 de 12 meses." -- só conta meses, não mostra valor. */
export function caixaMetaHeadline(rows: CaixaMes[]): string {
  if (!rows.length) return '';
  const acima = rows.filter((m) => m.caixa_real >= m.caixa_pretendido).length;
  return `Caixa real ficou acima da meta em ${acima} de ${rows.length} ${rows.length === 1 ? 'mês' : 'meses'}.`;
}

// --- Inflação: barras em torno do zero + painel de caixa real ÷ gastos ------------------------------
// Pontos com variacao_pct: null (mês sem base de comparação) ficam sem barra -- não viram 0 (mostrar
// a ausência de dado é mais honesto que inventar).

export function buildInflacaoChartData(pontos: InflacaoPonto[]): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  return {
    labels: monthAxisLabels(pontos),
    datasets: [
      {
        label: 'Inflação da cesta',
        data: pontos.map((p) => p.variacao_pct),
        // Subiu = tom do negativo (ficou mais caro); caiu = cinza.
        backgroundColor: pontos.map((p) => ((p.variacao_pct ?? 0) > 0 ? c.gastos : c.texto)),
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.9,
      },
    ],
  };
}

export function buildInflacaoRazaoData(pontos: InflacaoPonto[]): ChartConfiguration<'line'>['data'] {
  const c = chartColors();
  return {
    labels: monthAxisLabels(pontos),
    datasets: [
      {
        label: 'Caixa real ÷ gastos',
        data: pontos.map((p) => p.caixa_real_pct),
        borderColor: c.razao,
        backgroundColor: c.razao,
        pointStyle: 'circle',
        pointRadius: 2.5,
        pointHoverRadius: 4,
        borderWidth: 2,
        fill: false,
      },
    ],
  };
}

export function inflacaoPanelOptions<T extends 'bar' | 'line' = 'bar'>(
  painel: 'inflacao' | 'razao',
  pontos: InflacaoPonto[],
): ChartConfiguration<T>['options'] {
  const labels = monthAxisLabels(pontos);
  const pct = (v: number) => `${formatComma(Number(v))}%`;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { right: rightPad(16) } },
    scales: {
      x: monthAxis(labels, painel === 'razao'),
      y: panelValueAxis({ ticks: { maxTicksLimit: painel === 'razao' ? 3 : 5, callback: pct } }),
    },
    plugins: {
      legend: { display: false },
      zeroLine: { axis: 'y' },
      tooltip: { callbacks: { label: (i: { dataset: { label?: string }; raw: unknown }) => (i.raw == null ? `${i.dataset.label}: sem base` : `${i.dataset.label}: ${pct(Number(i.raw))}`) } },
    },
  } as unknown as ChartConfiguration<T>['options'];
}
