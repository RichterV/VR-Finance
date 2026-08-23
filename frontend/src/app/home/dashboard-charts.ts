import { ChartConfiguration } from 'chart.js';

import { CaixaMes, EvolucaoMes } from '../services/resumo.service';
import { linearTrend } from '../shared/linear-regression';
import { MESES_ABREV } from '../shared/months';

// Paleta ajustada para contraste sobre fundo Slate Dark (#0f172a).
export const COLOR_ESSENCIAL = '#60a5fa';
export const COLOR_ESSENCIAL_TENDENCIA = 'rgba(96, 165, 250, 0.35)';
export const COLOR_NAO_ESSENCIAL = '#fb923c';
export const COLOR_NAO_ESSENCIAL_TENDENCIA = 'rgba(251, 146, 60, 0.35)';
export const COLOR_CAIXA_REAL = '#16a34a';
export const COLOR_RECEITA = '#fbbf24';
export const COLOR_CAIXA_PRETENDIDO = '#86efac';
export const COLOR_PROPORCAO = '#818cf8';

export const CHART_TEXT_COLOR = '#94a3b8';
export const CHART_GRID_COLOR = 'rgba(148, 163, 184, 0.12)';

export function formatComma(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function buildLineChartData(evolucao: EvolucaoMes[]): ChartConfiguration<'line'>['data'] {
  const essenciais = evolucao.map((m) => m.essencial);
  const naoEssenciais = evolucao.map((m) => m.nao_essencial);

  return {
    labels: evolucao.map((m) => MESES_ABREV[m.mes - 1]),
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
    labels: rows.map((m) => MESES_ABREV[m.mes - 1]),
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
