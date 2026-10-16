import { Chart, Plugin, TooltipItem } from 'chart.js';

import { MESES_ABREV } from './months';
import { chartColors } from './themes';

/** Rótulo do eixo X de um gráfico mensal: "Fev", ou ["Jan", "2025"] quando o ano aparece. */
export type MonthLabel = string | [string, string];

/**
 * Rótulos de uma série mensal: o ano entra numa segunda linha só no 1º ponto e em cada virada de ano
 * (o resto continua curto -- com 36 meses, "Jan/25" em todos apertaria o eixo).
 */
export function monthAxisLabels(points: { ano: number; mes: number }[]): MonthLabel[] {
  return points.map((p, i) => {
    const mes = MESES_ABREV[p.mes - 1];
    return i === 0 || p.ano !== points[i - 1].ano ? [mes, String(p.ano)] : mes;
  });
}

/**
 * Ticks do eixo X pra janelas longas (24/36 meses). O pulo automático do chart.js escondia os
 * janeiros, e com eles o ano: só o 1º rótulo mostrava o ano. Aqui o rótulo com ano aparece sempre, e
 * entre eles um mês a cada `passo` (3; 6 em tela estreita), pulando o que ficaria colado num rótulo
 * com ano. Até 12 meses, o pulo automático dá conta (retorna `{}`).
 */
export function monthTicks(labels: readonly MonthLabel[], narrow = false): Record<string, unknown> {
  if (labels.length <= 12) return {};
  const passo = narrow ? 6 : 3;
  const comAno = labels.map((l, i) => (Array.isArray(l) ? i : -1)).filter((i) => i >= 0);
  const folga = Math.ceil(passo / 2);
  const mostrar = labels.map((l, i) => {
    // O 1º rótulo cede o lugar se um janeiro vier colado nele ("Nov 2023" encostava em "Jan 2024").
    if (Array.isArray(l)) return !(i === 0 && comAno.some((j) => j > 0 && j < folga));
    if (i % passo !== 0) return false;
    return comAno.every((j) => Math.abs(j - i) >= folga);
  });
  return {
    autoSkip: false,
    callback: (_value: unknown, index: number) => (mostrar[index] ? labels[index] : ''),
  };
}

/** Índices em que um ano novo começa (sem contar o 1º ponto) -- onde vai a divisória. */
export function yearBoundaries(labels: readonly unknown[]): number[] {
  const result: number[] = [];
  labels.forEach((label, i) => {
    if (i > 0 && Array.isArray(label)) result.push(i);
  });
  return result;
}

/** "Fev/2025" pro tooltip: o ano vem do rótulo com ano mais próximo à esquerda. Sem ano, o rótulo. */
export function monthTooltipTitle(labels: readonly unknown[], index: number): string {
  const own = labels[index];
  const mes = Array.isArray(own) ? String(own[0]) : String(own ?? '');
  for (let i = index; i >= 0; i--) {
    const label = labels[i];
    if (Array.isArray(label)) return `${mes}/${label[1]}`;
  }
  return mes;
}


/** Linha vertical tracejada entre dezembro e janeiro, nos gráficos com `monthAxisLabels`. */
export const yearDividerPlugin: Plugin = {
  id: 'yearDivider',
  beforeDatasetsDraw(chart: Chart) {
    const boundaries = yearBoundaries(chart.data.labels ?? []);
    const x = chart.scales['x'];
    if (!boundaries.length || !x) return;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = chartColors().divisor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const i of boundaries) {
      const px = (x.getPixelForValue(i - 1) + x.getPixelForValue(i)) / 2;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
    }
    ctx.restore();
  },
};

/** Título padrão do tooltip (registrado em chart-setup): mês/ano nos gráficos mensais. */
export function defaultTooltipTitle(items: TooltipItem<any>[]): string {
  if (!items.length) return '';
  const { chart, dataIndex } = items[0];
  return monthTooltipTitle(chart.data.labels ?? [], dataIndex);
}
