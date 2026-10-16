import '../../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { CasaResumo } from '../../services/casa.service';
import { buildVeiculosChartData, veiculosChartOptions } from '../veiculos/veiculos-chart';

// Mesmo gráfico de Manutenção Veículos (colunas por mês, uma série por imóvel): serviço da casa
// também é evento esporádico. Reaproveita o montador de lá, trocando só o nome da série.
export function buildCasaChartData(resumo: CasaResumo | null): ChartConfiguration<'bar'>['data'] {
  if (!resumo) return { labels: [], datasets: [] };
  return buildVeiculosChartData({
    veiculos: [],
    meses: resumo.meses,
    series: resumo.series.map((s) => ({ vehicle_name: s.imovel_name, valores: s.valores })),
  });
}

export function casaChartOptions(series: number): ChartConfiguration<'bar'>['options'] {
  const options = veiculosChartOptions()!;
  // Um imóvel só (o caso comum): a legenda repetiria o nome que já está no cartão.
  return { ...options, plugins: { ...options.plugins, legend: { ...options.plugins!.legend, display: series > 1 } } };
}

/** Barras de "Por categoria": largura proporcional à maior categoria (escala comum). */
export function categoriaBarPct(total: number, maior: number): number {
  if (maior <= 0) return 0;
  return Math.max(2, Math.round((total / maior) * 100));
}
