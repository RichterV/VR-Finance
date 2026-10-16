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

// Colunas, não linhas: serviço é um evento esporádico (a maioria dos meses é zero), e a linha curva
// entre um serviço e outro sugeria um gasto contínuo que não existe.
export function buildVeiculosChartData(resumo: VehiclesResumo | null): ChartConfiguration<'bar'>['data'] {
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
        backgroundColor: color,
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.8,
        categoryPercentage: 0.8,
      };
    }),
  };
}

export function veiculosChartOptions(): ChartConfiguration<'bar'>['options'] {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.texto } },
      y: { beginAtZero: true, grid: { color: c.grade }, border: { display: false }, ticks: { color: c.texto } },
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { usePointStyle: true, color: c.texto },
      },
    },
  };
}
