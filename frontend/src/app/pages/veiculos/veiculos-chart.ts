import '../../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { VehiclesResumo } from '../../services/veiculos.service';
import { monthAxisLabels } from '../../shared/month-axis';
import { chartColors } from '../../shared/themes';

// Uma cor por veículo, na ordem da paleta de gráficos do tema ativo (shared/themes.ts).
function seriesColors(): string[] {
  const c = chartColors();
  return [c.essencial, c.naoEssencial, c.caixaReal, c.razao, c.receita, c.caixaPretendido];
}

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
      const cores = seriesColors();
      const color = cores[i % cores.length];
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

export function veiculosChartOptions(): ChartConfiguration<'line'>['options'] {
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
        labels: { usePointStyle: true, color: c.texto },
      },
    },
  };
}
