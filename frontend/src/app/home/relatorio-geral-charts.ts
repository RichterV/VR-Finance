import '../shared/chart-setup';
import { ChartConfiguration } from 'chart.js';

import { ResumoGeral, ResumoGeralAno } from '../services/resumo.service';
import { chartColors } from '../shared/themes';
import { MESES_ABREV } from '../shared/months';

export function geralChartOptions(): ChartConfiguration<'bar'>['options'] {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
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

/** Gráfico da direita: um grupo de barras por ano, com as 5 métricas lado a lado (totais). */
export function buildPorAnoChartData(anos: ResumoGeralAno[]): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  return {
    labels: anos.map((a) => String(a.ano)),
    datasets: [
      { label: 'Essenciais', data: anos.map((a) => a.total_essenciais), backgroundColor: c.essencial, borderRadius: 4 },
      {
        label: 'Não essenciais',
        data: anos.map((a) => a.total_nao_essenciais),
        backgroundColor: c.naoEssencial,
        borderRadius: 4,
      },
      { label: 'Receita', data: anos.map((a) => a.total_receita), backgroundColor: c.receita, borderRadius: 4 },
      {
        label: 'Caixa pretendido',
        data: anos.map((a) => a.total_caixa_pretendido),
        backgroundColor: c.caixaPretendido,
        borderRadius: 4,
      },
      { label: 'Caixa real', data: anos.map((a) => a.total_caixa_real), backgroundColor: c.caixaReal, borderRadius: 4 },
    ],
  };
}

/** Gráfico da esquerda: as mesmas 5 métricas, como total geral (soma de todo o histórico, não por ano). */
export function buildTotaisGeraisChartData(geral: ResumoGeral | null): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  if (!geral) {
    return { labels: [], datasets: [] };
  }
  const cores = [c.essencial, c.naoEssencial, c.receita, c.caixaPretendido, c.caixaReal];
  return {
    labels: ['Essenciais', 'Não essenciais', 'Receita', 'Caixa pretendido', 'Caixa real'],
    datasets: [
      {
        label: 'Total geral',
        data: [
          geral.total_essenciais,
          geral.total_nao_essenciais,
          geral.total_receita,
          geral.total_caixa_pretendido,
          geral.total_caixa_real,
        ],
        backgroundColor: cores,
        borderRadius: 4,
      },
    ],
  };
}

export function totaisGeraisChartOptions(): ChartConfiguration<'bar'>['options'] {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      // Rótulos de duas palavras quebram em duas linhas ("Não / essenciais") e nenhum é pulado -- os
      // rótulos do eixo X não inclinam mais (chart-setup.ts), e aqui cada barra precisa do nome.
      x: {
        grid: { display: false },
        ticks: {
          color: c.texto,
          autoSkip: false,
          callback(this: { getLabelForValue(v: number): string }, value: string | number) {
            return this.getLabelForValue(Number(value)).split(' ');
          },
        },
      },
      y: { grid: { color: c.grade }, ticks: { color: c.texto } },
    },
    plugins: {
      legend: { display: false },
    },
  };
}

/** Gráfico de baixo: um grupo de barras por mês do calendário (Jan-Dez), somando todos os anos — sazonalidade. */
export function buildPorMesChartData(geral: ResumoGeral | null): ChartConfiguration<'bar'>['data'] {
  const c = chartColors();
  const porMes = geral?.por_mes ?? [];
  return {
    labels: porMes.map((m) => MESES_ABREV[m.mes - 1]),
    datasets: [
      { label: 'Essenciais', data: porMes.map((m) => m.total_essenciais), backgroundColor: c.essencial, borderRadius: 4 },
      {
        label: 'Não essenciais',
        data: porMes.map((m) => m.total_nao_essenciais),
        backgroundColor: c.naoEssencial,
        borderRadius: 4,
      },
      { label: 'Receita', data: porMes.map((m) => m.total_receita), backgroundColor: c.receita, borderRadius: 4 },
      {
        label: 'Caixa pretendido',
        data: porMes.map((m) => m.total_caixa_pretendido),
        backgroundColor: c.caixaPretendido,
        borderRadius: 4,
      },
      { label: 'Caixa real', data: porMes.map((m) => m.total_caixa_real), backgroundColor: c.caixaReal, borderRadius: 4 },
    ],
  };
}
