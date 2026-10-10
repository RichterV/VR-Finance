import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';

import { ErrorStateComponent } from '../../shared/error-state.component';
import { isNarrowScreen } from '../../shared/chart-plugins';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import { Corte, ResumoGeral, ResumoService } from '../../services/resumo.service';
import { describePorAno, describePorMes, describeTotaisGerais } from '../chart-descriptions';
import { buildFluxo, buildPorAnoChartData, buildPorMesChartData, historicoChartOptions } from '../relatorio-geral-charts';
import { SectionLoader } from './section-loader';
import { maskChartOptions, maskCurrency, maskPercent } from './value-mask';

/**
 * Relatório geral: a receita de todo o histórico dividida em gastos e caixa real (faixa), e os
 * mesmos números por ano e por mês do calendário. No celular, "Por mês" vira barras horizontais
 * (12 linhas em vez de 12 grupos de colunas espremidos).
 */
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
  private readonly destroyRef = inject(DestroyRef);
  readonly resumo = new SectionLoader<ResumoGeral>(this.destroyRef, () => this.settled.emit());

  /** Tela estreita (< 768px), acompanhando a rotação/redimensionamento. */
  readonly narrow = signal(isNarrowScreen());

  readonly fluxo = computed(() => buildFluxo(this.resumo.data()));
  readonly porAnoChartData = computed(() => buildPorAnoChartData(this.resumo.data()?.anos ?? []));
  readonly porMesChartData = computed(() => buildPorMesChartData(this.resumo.data(), this.narrow()));
  readonly porAnoOptions = computed(() =>
    maskChartOptions(
      historicoChartOptions(this.resumo.data()?.anos ?? [], { compacto: this.narrow() }),
      ['y'],
      this.valoresOcultos(),
    ),
  );
  readonly porMesOptions = computed(() =>
    maskChartOptions(
      historicoChartOptions(this.resumo.data()?.por_mes ?? [], { horizontal: this.narrow() }),
      [this.narrow() ? 'x' : 'y'],
      this.valoresOcultos(),
    ),
  );
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
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(max-width: 767px)');
      const onChange = () => this.narrow.set(mq.matches);
      mq.addEventListener?.('change', onChange);
      this.destroyRef.onDestroy(() => mq.removeEventListener?.('change', onChange));
    }
  }

  carregar(corte = this.corte()): void {
    this.resumo.load(this.resumoService.geral(corte));
  }

  currency(valor: number): string {
    return maskCurrency(valor, this.valoresOcultos());
  }

  percent(valor: number): string {
    return maskPercent(valor, this.valoresOcultos());
  }
}
