import { Component, DestroyRef, computed, effect, inject, input, output, untracked } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { expandOutline } from 'ionicons/icons';
import { BaseChartDirective } from 'ng2-charts';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import { Corte, ResumoAnual, ResumoService } from '../../services/resumo.service';
import { CaixaMetaChartComponent } from '../caixa-meta-chart.component';
import { describeEvolucao } from '../chart-descriptions';
import { buildLineChartData, evolucaoHeadline, lineChartOptions } from '../dashboard-charts';
import { PercentuaisItensComponent } from './percentuais-itens.component';
import { SectionLoader } from './section-loader';
import { maskChartOptions, maskCount, maskCurrency, maskPercent } from './value-mask';

/** Números do ano + gráficos de Evolução e Caixa real vs. meta + categorias do ano (recolhidas). */
@Component({
  selector: 'app-anual-section',
  templateUrl: './anual-section.component.html',
  imports: [IonIcon, BaseChartDirective, CaixaMetaChartComponent, PercentuaisItensComponent, SectionSkeletonComponent, ErrorStateComponent],
  styles: [':host { display: flex; flex-direction: column; gap: 20px; }'],
})
export class AnualSectionComponent {
  readonly ano = input.required<number>();
  readonly corte = input<Corte | undefined>(undefined);
  readonly valoresOcultos = input(false);
  readonly reload = input(0);
  readonly settled = output<void>();

  private readonly resumoService = inject(ResumoService);
  private readonly modals = inject(ModalLauncherService);
  readonly resumo = new SectionLoader<ResumoAnual>(inject(DestroyRef), () => this.settled.emit());

  readonly lineChartData = computed(() => buildLineChartData(this.resumo.data()?.evolucao_12_meses ?? []));
  readonly lineChartOptions = computed(() =>
    maskChartOptions(lineChartOptions(this.resumo.data()?.evolucao_12_meses ?? []), ['y'], this.valoresOcultos()),
  );
  readonly lineChartLabel = computed(() => describeEvolucao(this.resumo.data()?.evolucao_12_meses ?? [], this.valoresOcultos()));
  readonly lineHeadline = computed(() => evolucaoHeadline(this.resumo.data()?.evolucao_12_meses ?? [], this.valoresOcultos()));

  constructor() {
    addIcons({ expandOutline });
    effect(() => {
      const ano = this.ano();
      const corte = this.corte();
      this.reload();
      untracked(() => this.carregar(ano, corte));
    });
  }

  carregar(ano = this.ano(), corte = this.corte()): void {
    this.resumo.load(this.resumoService.anual(ano, 12, corte));
  }

  expandir(chartType: 'line' | 'bar', title: string): void {
    void this.modals.graficoExpandido(chartType, title, this.ano());
  }

  currency(valor: number): string {
    return maskCurrency(valor, this.valoresOcultos());
  }

  count(valor: number): string {
    return maskCount(valor, this.valoresOcultos());
  }

  /** "78,9%" de `valor` sobre `total` (ex: Essenciais sobre o total de gastos). */
  percentOf(valor: number, total: number): string {
    return maskPercent(total ? (valor / total) * 100 : 0, this.valoresOcultos());
  }
}
