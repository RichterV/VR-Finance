import { Component, computed, input } from '@angular/core';

/**
 * Mini-gráfico de tendência (SVG inline, sem chart.js) pros cards do dashboard. Decorativo
 * (aria-hidden): o valor do card já é o texto. Pontos null viram buraco na linha. Quando a série
 * cruza o zero (ex: caixa real negativo em algum mês), uma linha fraca marca o zero.
 */
@Component({
  selector: 'app-sparkline',
  template: `
    @if (path()) {
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        @if (zeroY() !== null) {
          <line class="zero" x1="0" [attr.y1]="zeroY()" [attr.x2]="width" [attr.y2]="zeroY()" />
        }
        <path class="area" [attr.d]="area()" [attr.fill]="color()" />
        <path class="line" [attr.d]="path()" [attr.stroke]="color()" />
        @if (last(); as p) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.4" [attr.fill]="color()" />
        }
      </svg>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 28px;
      }
      svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .line {
        fill: none;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }
      .area {
        opacity: 0.12;
      }
      .zero {
        stroke: rgba(var(--app-muted-rgb), 0.45);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
    `,
  ],
})
export class SparklineComponent {
  readonly values = input.required<(number | null)[]>();
  readonly color = input('#7fb59a');

  readonly width = 100;
  readonly height = 28;

  private readonly points = computed(() => {
    const values = this.values();
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length < 2) return [];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const span = max - min || 1;
    const step = this.width / (values.length - 1);
    return values.map((v, i) =>
      v === null ? null : { x: i * step, y: this.height - 2 - ((v - min) / span) * (this.height - 4) },
    );
  });

  /** Altura do zero no SVG, só quando a série tem valores dos dois lados dele. */
  readonly zeroY = computed(() => {
    const valid = this.values().filter((v): v is number => v !== null);
    if (valid.length < 2) return null;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    if (!(min < 0 && max > 0)) return null;
    return this.height - 2 - ((0 - min) / (max - min)) * (this.height - 4);
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
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    return `M${pts[0].x.toFixed(1)},${this.height} L${line} L${pts[pts.length - 1].x.toFixed(1)},${this.height} Z`;
  });

  readonly last = computed(() => {
    const pts = this.points();
    return pts.length ? pts[pts.length - 1] : null;
  });
}
