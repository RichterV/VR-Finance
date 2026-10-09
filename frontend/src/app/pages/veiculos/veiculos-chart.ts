import '../../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { CHART_GRID_COLOR, CHART_TEXT_COLOR } from '../../home/dashboard-charts';
import { VehiclesResumo } from '../../services/veiculos.service';
import { monthAxisLabels } from '../../shared/month-axis';

const SERIES_COLORS = ['#60a5fa', '#fb923c', '#34d399', '#f472b6', '#a78bfa', '#fbbf24'];

export function buildVeiculosChartData(resumo: VehiclesResumo | null): ChartConfiguration<'line'>['data'] {
  if (!resumo) {
    return { labels: [], datasets: [] };
  }

  return {
    labels: monthAxisLabels(
      resumo.meses.map((m) => {
        const [ano, mes] = m.split('-').map(Number);
        return { ano, mes };
      }),
    ),
    datasets: resumo.series.map((serie, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length];
      return {
        label: serie.vehicle_name,
        data: serie.valores,
        borderColor: color,
        backgroundColor: color,
        pointStyle: 'circle',
        pointRadius: 4,
        borderWidth: 2,
        tension: 0.4,
        fill: false,
      };
    }),
  };
}

export const VEICULOS_CHART_OPTIONS: ChartConfiguration<'line'>['options'] = {
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
      labels: { usePointStyle: true, color: CHART_TEXT_COLOR },
    },
  },
};
