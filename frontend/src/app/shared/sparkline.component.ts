import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';

let nextGradientId = 0;

/**
 * Mini-gráfico de tendência (SVG inline, sem chart.js) pros cards do dashboard. Decorativo
 * (aria-hidden): o valor do card já é o texto. Pontos null viram buraco na linha. Quando a série
 * cruza o zero (ex: caixa real negativo em algum mês), uma linha fraca marca o zero.
 *
 * O viewBox acompanha o tamanho real do elemento (ResizeObserver): com um viewBox fixo e
 * `preserveAspectRatio="none"`, num cartão largo o desenho era esticado só na horizontal -- a linha
 * ficava achatada e o ponto final virava uma elipse. A altura vem do CSS (maior no desktop).
 */
@Component({
  selector: 'app-sparkline',
  template: `
    @if (path()) {
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" [attr.stop-color]="color()" stop-opacity="0.22" />
            <stop offset="1" [attr.stop-color]="color()" stop-opacity="0" />
          </linearGradient>
        </defs>
        @if (zeroY() !== null) {
          <line class="zero" x1="0" [attr.y1]="zeroY()" [attr.x2]="width()" [attr.y2]="zeroY()" />
        }
        <path [attr.d]="area()" [attr.fill]="'url(#' + gradientId + ')'" />
        <path class="line" [attr.d]="path()" [attr.stroke]="color()" />
        @if (last(); as p) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" [attr.fill]="color()" />
        }
      </svg>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 32px;
      }
      @media (min-width: 768px) {
        :host {
          height: 44px;
        }
      }
      svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .line {
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .zero {
        stroke: rgba(var(--app-muted-rgb), 0.45);
        stroke-width: 1;
        stroke-dasharray: 2 3;
      }
    `,
  ],
})
export class SparklineComponent {
  readonly values = input.required<(number | null)[]>();
  readonly color = input('#7fb59a');

  /** Folga em cima/embaixo pro traço e o ponto final não encostarem na borda. */
  private readonly pad = 4;
  readonly gradientId = `sparkline-fill-${nextGradientId++}`;

  readonly width = signal(100);
  readonly height = signal(32);

  constructor() {
    const el = inject(ElementRef).nativeElement as HTMLElement;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        this.width.set(Math.round(width));
        this.height.set(Math.round(height));
      }
    });
    observer.observe(el);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  private readonly range = computed(() => {
    const valid = this.values().filter((v): v is number => v !== null);
    if (valid.length < 2) return null;
    return { min: Math.min(...valid), max: Math.max(...valid) };
  });

  private y(v: number, min: number, span: number): number {
    const h = this.height();
    return h - this.pad - ((v - min) / span) * (h - this.pad * 2);
  }

  private readonly points = computed(() => {
    const range = this.range();
    if (!range) return [];
    const values = this.values();
    const span = range.max - range.min || 1;
    // Série constante fica no meio, não colada no rodapé.
    const flat = range.max === range.min;
    const step = this.width() / (values.length - 1);
    return values.map((v, i) =>
      v === null
        ? null
        : { x: i * step, y: flat ? this.height() / 2 : this.y(v, range.min, span) },
    );
  });

  /** Altura do zero no SVG, só quando a série tem valores dos dois lados dele. */
  readonly zeroY = computed(() => {
    const range = this.range();
    if (!range || !(range.min < 0 && range.max > 0)) return null;
    return this.y(0, range.min, range.max - range.min);
  });

  readonly path = computed(() => {
    let d = '';
    let penDown = false;
    for (const p of this.points()) {
      if (!p) {
        penDown = false;
        continue;
      }
      d += `${penDown ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
      penDown = true;
    }
    return d.trim();
  });

  readonly area = computed(() => {
    const pts = this.points().filter((p): p is { x: number; y: number } => p !== null);
    if (pts.length < 2) return '';
    const h = this.height();
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    return `M${pts[0].x.toFixed(1)},${h} L${line} L${pts[pts.length - 1].x.toFixed(1)},${h} Z`;
  });

  readonly last = computed(() => {
    const pts = this.points();
    return pts.length ? pts[pts.length - 1] : null;
  });
}
