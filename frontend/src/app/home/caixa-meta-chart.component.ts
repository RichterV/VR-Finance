import { Component, computed, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';

import { CaixaMes } from '../services/resumo.service';
import { chartColors, themeInk } from '../shared/themes';
import { describeCaixa } from './chart-descriptions';
import {
  buildCaixaMetaData,
  buildCaixaRazaoData,
  buildCaixaReceitaData,
  caixaMetaHeadline,
  caixaPanelOptions,
} from './dashboard-charts';
import { maskChartOptions } from './sections/value-mask';

/**
 * "Caixa pretendido vs. real" em 3 painéis com o mesmo eixo de meses: receita (contexto), caixa real
 * com o traço da meta (o principal) e a razão caixa real ÷ gastos. Substituiu o gráfico de colunas +
 * linha num 2º eixo Y. Usado no Resumo anual e no modal de gráfico expandido (`expanded`).
 */
@Component({
  selector: 'app-caixa-meta-chart',
  imports: [BaseChartDirective],
  template: `
    @if (headline()) {
      <p class="chart-headline">{{ headline() }}</p>
    }
    <div class="panels" [class.expanded]="expanded()">
      <p class="panel-label"><i class="sw" [style.background]="cores().receita"></i>Receita</p>
      <div class="panel panel--receita">
        <canvas baseChart role="img" [attr.aria-label]="'Receita por mês'" [type]="'bar'" [data]="receitaData()" [options]="receitaOptions()"></canvas>
      </div>
      <p class="panel-label">
        <span><i class="sw" [style.background]="cores().caixaReal"></i>Caixa real</span>
        <span><i class="sw tick" [style.background]="cores().meta"></i>Caixa pretendido (meta)</span>
      </p>
      <div class="panel panel--meta">
        <canvas baseChart role="img" [attr.aria-label]="label()" [type]="'bar'" [data]="metaData()" [options]="metaOptions()"></canvas>
      </div>
      <p class="panel-label"><i class="sw line" [style.background]="cores().razao"></i>Caixa real ÷ gastos</p>
      <div class="panel panel--razao">
        <canvas baseChart role="img" [attr.aria-label]="'Razão entre caixa real e gastos por mês'" [type]="'line'" [data]="razaoData()" [options]="razaoOptions()"></canvas>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; min-height: 0; }
      .chart-headline { margin: 0 0 var(--sp-2); font-size: var(--fs-sm); color: var(--app-text-secondary); }
      .panels { display: flex; flex-direction: column; flex: 1; min-height: 0; }
      .panel-label {
        display: flex; flex-wrap: wrap; gap: 4px var(--sp-4); align-items: center;
        margin: var(--sp-2) 0 2px; font-size: var(--fs-xs); color: var(--app-text-secondary);
      }
      .panel-label:first-child { margin-top: 0; }
      .panel-label span { display: inline-flex; align-items: center; }
      .sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
      .sw.tick, .sw.line { width: 14px; height: 2px; border-radius: 1px; }
      .panel { position: relative; }
      .panel--receita { height: 64px; }
      .panel--meta { height: 150px; }
      .panel--razao { height: 96px; }
      .expanded .panel--receita { flex: 1 1 0; min-height: 80px; }
      .expanded .panel--meta { flex: 3 1 0; min-height: 180px; }
      .expanded .panel--razao { flex: 1.4 1 0; min-height: 110px; }
    `,
  ],
})
export class CaixaMetaChartComponent {
  readonly rows = input.required<CaixaMes[]>();
  readonly valoresOcultos = input(false);
  readonly expanded = input(false);

  readonly cores = computed(() => {
    const c = chartColors();
    return { receita: c.receita, caixaReal: c.caixaReal, razao: c.razao, meta: themeInk().texto };
  });

  readonly headline = computed(() => caixaMetaHeadline(this.rows()));
  readonly label = computed(() => describeCaixa(this.rows(), this.valoresOcultos()));

  readonly receitaData = computed(() => buildCaixaReceitaData(this.rows()));
  readonly metaData = computed(() => buildCaixaMetaData(this.rows()));
  readonly razaoData = computed(() => buildCaixaRazaoData(this.rows()));

  readonly receitaOptions = computed(() => maskChartOptions(caixaPanelOptions('receita', this.rows()), ['y'], this.valoresOcultos()));
  readonly metaOptions = computed(() => maskChartOptions(caixaPanelOptions('meta', this.rows()), ['y'], this.valoresOcultos()));
  readonly razaoOptions = computed(() => maskChartOptions(caixaPanelOptions<'line'>('razao', this.rows()), ['y'], this.valoresOcultos()));
}
