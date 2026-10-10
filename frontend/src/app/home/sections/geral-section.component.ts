import { Component, DestroyRef, computed, effect, inject, input, output, untracked } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';

import { ErrorStateComponent } from '../../shared/error-state.component';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import { Corte, ResumoGeral, ResumoService } from '../../services/resumo.service';
import { describePorAno, describePorMes, describeTotaisGerais } from '../chart-descriptions';
import {
  buildPorAnoChartData,
  buildPorMesChartData,
  buildTotaisGeraisChartData,
  geralChartOptions,
  totaisGeraisChartOptions,
} from '../relatorio-geral-charts';
import { SectionLoader } from './section-loader';
import { maskChartOptions } from './value-mask';

/** Relatório geral: totais de todo o histórico, por ano e por mês do calendário. */
@Component({
  selector: 'app-geral-section',
  templateUrl: './geral-section.component.html',
  imports: [BaseChartDirective, SectionSkeletonComponent, ErrorStateComponent],
  styles: [':host { display: flex; flex-direction: column; gap: 20px; }'],
})
export class GeralSectionComponent {
  readonly corte = input<Corte | undefined>(undefined);
  readonly valoresOcultos = input(false);
  readonly reload = input(0);
  readonly settled = output<void>();

  private readonly resumoService = inject(ResumoService);
  readonly resumo = new SectionLoader<ResumoGeral>(inject(DestroyRef), () => this.settled.emit());

  readonly porAnoChartData = computed(() => buildPorAnoChartData(this.resumo.data()?.anos ?? []));
  readonly totaisGeraisChartData = computed(() => buildTotaisGeraisChartData(this.resumo.data()));
  readonly porMesChartData = computed(() => buildPorMesChartData(this.resumo.data()));
  readonly geralOptions = computed(() => maskChartOptions(geralChartOptions(), ['y'], this.valoresOcultos()));
  readonly totaisOptions = computed(() => maskChartOptions(totaisGeraisChartOptions(), ['y'], this.valoresOcultos()));
  readonly labels = computed(() => ({
    totais: describeTotaisGerais(this.resumo.data(), this.valoresOcultos()),
    porAno: describePorAno(this.resumo.data(), this.valoresOcultos()),
    porMes: describePorMes(this.resumo.data(), this.valoresOcultos()),
  }));

  constructor() {
    effect(() => {
      const corte = this.corte();
      this.reload();
      untracked(() => this.carregar(corte));
    });
  }

  carregar(corte = this.corte()): void {
    this.resumo.load(this.resumoService.geral(corte));
  }
}
