import { ChartConfiguration } from 'chart.js';

import { ResumoGeral, ResumoGeralAno } from '../services/resumo.service';
import {
  CHART_GRID_COLOR,
  CHART_TEXT_COLOR,
  COLOR_CAIXA_PRETENDIDO,
  COLOR_CAIXA_REAL,
  COLOR_ESSENCIAL,
  COLOR_NAO_ESSENCIAL,
  COLOR_RECEITA,
} from './dashboard-charts';
import { MESES_ABREV } from '../shared/months';

export const GERAL_CHART_OPTIONS: ChartConfiguration<'bar'>['options'] = {
  responsive: true,
  maintainAspectRatio: false,
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

/** Gráfico da direita: um grupo de barras por ano, com as 5 métricas lado a lado (totais). */
export function buildPorAnoChartData(anos: ResumoGeralAno[]): ChartConfiguration<'bar'>['data'] {
  return {
    labels: anos.map((a) => String(a.ano)),
    datasets: [
      { label: 'Essenciais', data: anos.map((a) => a.total_essenciais), backgroundColor: COLOR_ESSENCIAL, borderRadius: 4 },
      {
        label: 'Não essenciais',
        data: anos.map((a) => a.total_nao_essenciais),
        backgroundColor: COLOR_NAO_ESSENCIAL,
        borderRadius: 4,
      },
      { label: 'Receita', data: anos.map((a) => a.total_receita), backgroundColor: COLOR_RECEITA, borderRadius: 4 },
      {
        label: 'Caixa pretendido',
        data: anos.map((a) => a.total_caixa_pretendido),
        backgroundColor: COLOR_CAIXA_PRETENDIDO,
        borderRadius: 4,
      },
      { label: 'Caixa real', data: anos.map((a) => a.total_caixa_real), backgroundColor: COLOR_CAIXA_REAL, borderRadius: 4 },
    ],
  };
}

/** Gráfico da esquerda: as mesmas 5 métricas, como total geral (soma de todo o histórico, não por ano). */
export function buildTotaisGeraisChartData(geral: ResumoGeral | null): ChartConfiguration<'bar'>['data'] {
  if (!geral) {
    return { labels: [], datasets: [] };
  }
  const cores = [COLOR_ESSENCIAL, COLOR_NAO_ESSENCIAL, COLOR_RECEITA, COLOR_CAIXA_PRETENDIDO, COLOR_CAIXA_REAL];
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

export const TOTAIS_GERAIS_CHART_OPTIONS: ChartConfiguration<'bar'>['options'] = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { grid: { display: false }, ticks: { color: CHART_TEXT_COLOR } },
    y: { grid: { color: CHART_GRID_COLOR }, ticks: { color: CHART_TEXT_COLOR } },
  },
  plugins: {
    legend: { display: false },
  },
};

/** Gráfico de baixo: um grupo de barras por mês do calendário (Jan-Dez), somando todos os anos — sazonalidade. */
export function buildPorMesChartData(geral: ResumoGeral | null): ChartConfiguration<'bar'>['data'] {
  const porMes = geral?.por_mes ?? [];
  return {
    labels: porMes.map((m) => MESES_ABREV[m.mes - 1]),
    datasets: [
      { label: 'Essenciais', data: porMes.map((m) => m.total_essenciais), backgroundColor: COLOR_ESSENCIAL, borderRadius: 4 },
      {
        label: 'Não essenciais',
        data: porMes.map((m) => m.total_nao_essenciais),
        backgroundColor: COLOR_NAO_ESSENCIAL,
        borderRadius: 4,
      },
      { label: 'Receita', data: porMes.map((m) => m.total_receita), backgroundColor: COLOR_RECEITA, borderRadius: 4 },
      {
        label: 'Caixa pretendido',
        data: porMes.map((m) => m.total_caixa_pretendido),
        backgroundColor: COLOR_CAIXA_PRETENDIDO,
        borderRadius: 4,
      },
      { label: 'Caixa real', data: porMes.map((m) => m.total_caixa_real), backgroundColor: COLOR_CAIXA_REAL, borderRadius: 4 },
    ],
  };
}
