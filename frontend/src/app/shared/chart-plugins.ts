import { Chart, Plugin } from 'chart.js';

import { chartColors, themeInk } from './themes';

/**
 * Plugins visuais registrados em chart-setup.ts. Os dois leem as opções cruas
 * (`chart.config.options.plugins`), não as resolvidas pelo chart.js: o resolvedor trata funções
 * como "scriptable" e confunde chaves como `at` com métodos de array.
 */

/** Rótulo escrito direto no gráfico (fim da linha, topo da barra). */
export interface DirectLabel {
  text: string;
  /** Ponto de ancoragem: um elemento do gráfico... */
  datasetIndex?: number;
  index?: number;
  /**
   * ...ou uma posição calculada na hora (em px do canvas), que pode trazer também a cor e o
   * alinhamento (ex: dentro do segmento quando cabe, fora quando não cabe).
   */
  at?: (chart: Chart) => { x: number; y: number; color?: string; align?: CanvasTextAlign } | null;
  /** Cor do texto (padrão: texto principal do tema, `themeInk().texto`). Nunca a cor da série. */
  color?: string;
  align?: CanvasTextAlign;
  dx?: number;
  dy?: number;
}

export interface DirectLabelsOptions {
  items: DirectLabel[];
}

export const directLabelsPlugin: Plugin = {
  id: 'directLabels',
  afterDatasetsDraw(chart: Chart) {
    const opts = (chart.config.options?.plugins as { directLabels?: DirectLabelsOptions } | undefined)?.directLabels;
    if (!opts?.items?.length) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = `500 12px ${Chart.defaults.font.family}`;
    ctx.textBaseline = 'middle';
    for (const item of opts.items) {
      let pos: { x: number | null; y: number | null; color?: string; align?: CanvasTextAlign } | null = null;
      if (item.at) {
        pos = item.at(chart);
      } else if (item.datasetIndex !== undefined && item.index !== undefined) {
        const meta = chart.getDatasetMeta(item.datasetIndex);
        const el = meta.data[item.index];
        if (el && !meta.hidden && chart.isDatasetVisible(item.datasetIndex)) pos = el.tooltipPosition(true);
      }
      if (!pos || pos.x == null || pos.y == null) continue;
      ctx.fillStyle = pos.color ?? item.color ?? themeInk().texto;
      ctx.textAlign = pos.align ?? item.align ?? 'left';
      ctx.fillText(item.text, pos.x + (item.dx ?? 8), pos.y + (item.dy ?? 0));
    }
    ctx.restore();
  },
};

/** Linha do zero mais forte que a grade, nos gráficos que cruzam o zero (`plugins.zeroLine.axis`). */
export const zeroLinePlugin: Plugin = {
  id: 'zeroLine',
  beforeDatasetsDraw(chart: Chart) {
    const axis = (chart.config.options?.plugins as { zeroLine?: { axis: string } } | undefined)?.zeroLine?.axis;
    const scale = axis ? chart.scales[axis] : undefined;
    if (!scale || scale.min > 0 || scale.max < 0) return;
    const { ctx, chartArea } = chart;
    const horizontal = scale.isHorizontal();
    const p = scale.getPixelForValue(0);
    ctx.save();
    ctx.strokeStyle = chartColors().divisor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(p, chartArea.top);
      ctx.lineTo(p, chartArea.bottom);
    } else {
      ctx.moveTo(chartArea.left, p);
      ctx.lineTo(chartArea.right, p);
    }
    ctx.stroke();
    ctx.restore();
  },
};

/** Tela estreita (celular): sem espaço pra rótulo direto à direita, barras viram horizontais etc. */
export function isNarrowScreen(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Largura fixa do eixo Y: em painéis empilhados (mesmo eixo de meses), todos começam no mesmo x e
 * os meses ficam alinhados de um painel pro outro.
 */
export const PANEL_AXIS_WIDTH = 56;
export function fixedAxisWidth(scale: { width: number }): void {
  scale.width = PANEL_AXIS_WIDTH;
}

const MIL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * "R$ 5,9 mil" / "−R$ 2,7 mil" (curto, pra rótulo dentro do gráfico). `semMoeda`: "5,9 mil".
 * `comSinal`: "+R$ 5,9 mil" -- pra diferença (sobra), que não deve ser lida como altura no eixo.
 */
export function formatMil(valor: number, semMoeda = false, comSinal = false): string {
  const sinal = valor < 0 ? '−' : comSinal && valor > 0 ? '+' : '';
  return `${sinal}${semMoeda ? '' : 'R$ '}${MIL.format(Math.abs(valor) / 1000)} mil`;
}
