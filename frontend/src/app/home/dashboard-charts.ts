import '../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { CaixaMes, EvolucaoMes, InflacaoPonto } from '../services/resumo.service';
import { linearTrend } from '../shared/linear-regression';
import { monthAxisLabels } from '../shared/month-axis';

// Cores das séries -- paleta "Sálvia suave" (2026-10-10), as mesmas 6 cores em todos os gráficos do
// app e nos tokens --chart-* de theme/variables.scss. Todas passam de 3:1 sobre o cartão (#1b201e).
export const COLOR_ESSENCIAL = '#86a9cc';
export const COLOR_ESSENCIAL_TENDENCIA = 'rgba(134, 169, 204, 0.35)';
export const COLOR_NAO_ESSENCIAL = '#d39a6a';
export const COLOR_NAO_ESSENCIAL_TENDENCIA = 'rgba(211, 154, 106, 0.35)';
export const COLOR_CAIXA_REAL = '#7fb59a';
export const COLOR_RECEITA = '#d4bb6a';
export const COLOR_CAIXA_PRETENDIDO = '#b9d8c4';
// Lilás deliberadamente não-verde -- é a linha de razão sobre as colunas de receita/caixa do gráfico
// "Caixa pretendido vs. real"; verde aqui destruiria a diferenciação da série.
export const COLOR_PROPORCAO = '#b39cc8';
// Gastos/inflação (linha da inflação, mini-gráfico de "Gastos do mês"): o mesmo tom do negativo.
export const COLOR_INFLACAO = '#d98c84';

export const CHART_TEXT_COLOR = '#99a49e';
export const CHART_GRID_COLOR = 'rgba(153, 164, 158, 0.12)';

export function formatComma(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function buildLineChartData(evolucao: EvolucaoMes[]): ChartConfiguration<'line'>['data'] {
  const essenciais = evolucao.map((m) => m.essencial);
  const naoEssenciais = evolucao.map((m) => m.nao_essencial);

  return {
    labels: monthAxisLabels(evolucao),
    datasets: [
      {
        label: 'Essenciais',
        data: essenciais,
        borderColor: COLOR_ESSENCIAL,
        backgroundColor: COLOR_ESSENCIAL,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Não essenciais',
        data: naoEssenciais,
        borderColor: COLOR_NAO_ESSENCIAL,
        backgroundColor: COLOR_NAO_ESSENCIAL,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Caixa real',
        data: evolucao.map((m) => m.caixa),
        borderColor: COLOR_CAIXA_REAL,
        backgroundColor: COLOR_CAIXA_REAL,
        pointStyle: 'crossRot',
        pointRadius: 5,
        borderWidth: 2,
        borderDash: [6, 4],
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Tendência essenciais',
        data: linearTrend(essenciais),
        borderColor: COLOR_ESSENCIAL_TENDENCIA,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
      },
      {
        label: 'Tendência não essenciais',
        data: linearTrend(naoEssenciais),
        borderColor: COLOR_NAO_ESSENCIAL_TENDENCIA,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
      },
    ],
  };
}

export const LINE_CHART_OPTIONS: ChartConfiguration<'line'>['options'] = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { grid: { display: false }, ticks: { color: CHART_TEXT_COLOR } },
    y: { grid: { color: CHART_GRID_COLOR }, ticks: { color: CHART_TEXT_COLOR } },
  },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        usePointStyle: true,
        color: CHART_TEXT_COLOR,
        filter: (item) => !item.text.startsWith('Tendência'),
      },
    },
  },
};

export function buildComboChartData(rows: CaixaMes[]): ChartConfiguration<'bar'>['data'] {
  const datasets = [
    {
      type: 'bar' as const,
      label: 'Receita',
      data: rows.map((m) => m.receita),
      backgroundColor: COLOR_RECEITA,
      yAxisID: 'y',
      order: 2,
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      type: 'bar' as const,
      label: 'Caixa pretendido',
      data: rows.map((m) => m.caixa_pretendido),
      backgroundColor: COLOR_CAIXA_PRETENDIDO,
      yAxisID: 'y',
      order: 2,
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      type: 'bar' as const,
      label: 'Caixa real',
      data: rows.map((m) => m.caixa_real),
      backgroundColor: COLOR_CAIXA_REAL,
      yAxisID: 'y',
      order: 2,
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      type: 'line' as const,
      label: 'Caixa real / Gastos',
      data: rows.map((m) => m.proporcao_caixa_real / 100),
      borderColor: COLOR_PROPORCAO,
      backgroundColor: COLOR_PROPORCAO,
      pointStyle: 'circle',
      pointRadius: 4,
      borderWidth: 2,
      tension: 0.4,
      yAxisID: 'y1',
      fill: false,
      order: 1,
    },
  ];
  return {
    labels: monthAxisLabels(rows),
    datasets,
  } as unknown as ChartConfiguration<'bar'>['data'];
}

export const COMBO_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { grid: { display: false }, ticks: { color: CHART_TEXT_COLOR } },
    y: {
      type: 'linear',
      position: 'left',
      grid: { color: CHART_GRID_COLOR },
      ticks: { color: CHART_TEXT_COLOR },
      title: { display: true, text: 'R$', color: CHART_TEXT_COLOR },
    },
    y1: {
      type: 'linear',
      position: 'right',
      title: { display: true, text: 'Caixa real / Gastos', color: CHART_TEXT_COLOR },
      grid: { drawOnChartArea: false },
      ticks: { color: CHART_TEXT_COLOR, callback: (value: number) => formatComma(Number(value)) },
    },
  },
  plugins: {
    legend: {
      position: 'top',
      labels: {
        usePointStyle: true,
        color: CHART_TEXT_COLOR,
        generateLabels: (chart: { data: { datasets: Array<Record<string, unknown>> }; isDatasetVisible: (i: number) => boolean }) =>
          chart.data.datasets.map((ds, i) => {
            const isLine = ds['type'] === 'line';
            return {
              text: ds['label'] as string,
              fillStyle: isLine ? 'transparent' : (ds['backgroundColor'] as string),
              strokeStyle: ds['borderColor'] as string,
              fontColor: CHART_TEXT_COLOR,
              lineWidth: isLine ? 2 : 0,
              pointStyle: isLine ? 'line' : 'rect',
              datasetIndex: i,
              hidden: !chart.isDatasetVisible(i),
            };
          }),
      },
    },
  },
} as unknown as ChartConfiguration<'bar'>['options'];

// pontos com variacao_pct: null (mes sem base de comparacao) viram gap real no grafico -- Chart.js
// nao interpola um `null` no meio de um dataset de linha a menos que spanGaps:true seja setado,
// o que nunca fazemos aqui de proposito (mostrar a ausencia de dado é mais honesto que inventar).
export function buildInflacaoChartData(pontos: InflacaoPonto[]): ChartConfiguration<'line'>['data'] {
  return {
    labels: monthAxisLabels(pontos),
    datasets: [
      {
        label: 'Inflação (%)',
        data: pontos.map((p) => p.variacao_pct),
        borderColor: COLOR_INFLACAO,
        backgroundColor: COLOR_INFLACAO,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        yAxisID: 'y',
        fill: false,
      },
      {
        label: 'Caixa real / Gastos (%)',
        data: pontos.map((p) => p.caixa_real_pct),
        borderColor: COLOR_PROPORCAO,
        backgroundColor: COLOR_PROPORCAO,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        yAxisID: 'y1',
        fill: false,
      },
    ],
  };
}

export const INFLACAO_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { grid: { display: false }, ticks: { color: CHART_TEXT_COLOR } },
    y: {
      type: 'linear',
      position: 'left',
      grid: { color: CHART_GRID_COLOR },
      ticks: { color: CHART_TEXT_COLOR, callback: (value: number) => `${formatComma(Number(value))}%` },
      title: { display: true, text: 'Inflação (%)', color: CHART_TEXT_COLOR },
    },
    y1: {
      type: 'linear',
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { color: CHART_TEXT_COLOR, callback: (value: number) => `${formatComma(Number(value))}%` },
      title: { display: true, text: 'Caixa real / Gastos (%)', color: CHART_TEXT_COLOR },
    },
  },
  plugins: {
    legend: {
      position: 'top',
      labels: { usePointStyle: true, color: CHART_TEXT_COLOR },
    },
  },
} as unknown as ChartConfiguration<'line'>['options'];
