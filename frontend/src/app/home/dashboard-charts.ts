import '../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { CaixaMes, EvolucaoMes, InflacaoPonto } from '../services/resumo.service';
import { linearTrend } from '../shared/linear-regression';
import { monthAxisLabels } from '../shared/month-axis';
import { chartColors, withAlpha } from '../shared/themes';

// Cores dos gráficos: vêm do tema ativo (shared/themes.ts, escolhido no Perfil). Cada montador lê
// `chartColors()` na hora -- chamado dentro de um computed(), o gráfico se redesenha quando o tema muda.
// Mesmo papel de cada série em todos os temas: a linha de razão é sempre uma cor fria e diferente das
// colunas; gastos/inflação usam o tom do negativo.
export { chartColors };

export function formatComma(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function buildLineChartData(evolucao: EvolucaoMes[]): ChartConfiguration<'line'>['data'] {
  const c = chartColors();
  const essenciais = evolucao.map((m) => m.essencial);
  const naoEssenciais = evolucao.map((m) => m.nao_essencial);

  return {
    labels: monthAxisLabels(evolucao),
    datasets: [
      {
        label: 'Essenciais',
        data: essenciais,
        borderColor: c.essencial,
        backgroundColor: c.essencial,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Não essenciais',
        data: naoEssenciais,
        borderColor: c.naoEssencial,
        backgroundColor: c.naoEssencial,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Caixa real',
        data: evolucao.map((m) => m.caixa),
        borderColor: c.caixaReal,
        backgroundColor: c.caixaReal,
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
        borderColor: withAlpha(c.essencial, 0.35),
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
      },
      {
        label: 'Tendência não essenciais',
        data: linearTrend(naoEssenciais),
        borderColor: withAlpha(c.naoEssencial, 0.35),
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
      },
    ],
  };
}

export function lineChartOptions(): ChartConfiguration<'line'>['options'] {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.texto } },
      y: { grid: { color: c.grade }, ticks: { color: c.texto } },
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
    },
  };
}

export function buildComboChartData(rows: CaixaMes[]): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  const datasets = [
    {
      type: 'bar' as const,
      label: 'Receita',
      data: rows.map((m) => m.receita),
      backgroundColor: c.receita,
      yAxisID: 'y',
      order: 2,
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      type: 'bar' as const,
      label: 'Caixa pretendido',
      data: rows.map((m) => m.caixa_pretendido),
      backgroundColor: c.caixaPretendido,
      yAxisID: 'y',
      order: 2,
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      type: 'bar' as const,
      label: 'Caixa real',
      data: rows.map((m) => m.caixa_real),
      backgroundColor: c.caixaReal,
      yAxisID: 'y',
      order: 2,
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      type: 'line' as const,
      label: 'Caixa real / Gastos',
      data: rows.map((m) => m.proporcao_caixa_real / 100),
      borderColor: c.razao,
      backgroundColor: c.razao,
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

export function comboChartOptions(): ChartConfiguration<'bar'>['options'] {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false }, ticks: { color: c.texto } },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: c.grade },
        ticks: { color: c.texto },
        title: { display: true, text: 'R$', color: c.texto },
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Caixa real / Gastos', color: c.texto },
        grid: { drawOnChartArea: false },
        ticks: { color: c.texto, callback: (value: number) => formatComma(Number(value)) },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          color: c.texto,
          generateLabels: (chart: { data: { datasets: Array<Record<string, unknown>> }; isDatasetVisible: (i: number) => boolean }) =>
            chart.data.datasets.map((ds, i) => {
              const isLine = ds['type'] === 'line';
              return {
                text: ds['label'] as string,
                fillStyle: isLine ? 'transparent' : (ds['backgroundColor'] as string),
                strokeStyle: ds['borderColor'] as string,
                fontColor: c.texto,
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
}

// pontos com variacao_pct: null (mes sem base de comparacao) viram gap real no grafico -- Chart.js
// nao interpola um `null` no meio de um dataset de linha a menos que spanGaps:true seja setado,
// o que nunca fazemos aqui de proposito (mostrar a ausencia de dado é mais honesto que inventar).
export function buildInflacaoChartData(pontos: InflacaoPonto[]): ChartConfiguration<'line'>['data'] {
  const c = chartColors();
  return {
    labels: monthAxisLabels(pontos),
    datasets: [
      {
        label: 'Inflação (%)',
        data: pontos.map((p) => p.variacao_pct),
        borderColor: c.gastos,
        backgroundColor: c.gastos,
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
        borderColor: c.razao,
        backgroundColor: c.razao,
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

export function inflacaoChartOptions(): ChartConfiguration<'line'>['options'] {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.texto } },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: c.grade },
        ticks: { color: c.texto, callback: (value: number) => `${formatComma(Number(value))}%` },
        title: { display: true, text: 'Inflação (%)', color: c.texto },
      },
      y1: {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: c.texto, callback: (value: number) => `${formatComma(Number(value))}%` },
        title: { display: true, text: 'Caixa real / Gastos (%)', color: c.texto },
      },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, color: c.texto },
      },
    },
  } as unknown as ChartConfiguration<'line'>['options'];
}
