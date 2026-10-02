import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular';
import { BaseChartDirective } from 'ng2-charts';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import { Corte, ResumoInflacao, ResumoService } from '../../services/resumo.service';
import { describeInflacao } from '../chart-descriptions';
import { INFLACAO_CHART_OPTIONS, buildInflacaoChartData } from '../dashboard-charts';
import { SectionLoader } from './section-loader';
import { maskChartOptions } from './value-mask';

const PCT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Análise inflacionária: inflação pessoal da cesta, mês a mês ou ano a ano. */
@Component({
  selector: 'app-inflacao-section',
  templateUrl: './inflacao-section.component.html',
  imports: [IonSegment, IonSegmentButton, IonLabel, BaseChartDirective, SectionSkeletonComponent, ErrorStateComponent],
  styles: [':host { display: flex; flex-direction: column; gap: 20px; }'],
})
export class InflacaoSectionComponent {
  readonly corte = input<Corte | undefined>(undefined);
  readonly valoresOcultos = input(false);
  readonly reload = input(0);
  readonly settled = output<void>();

  private readonly resumoService = inject(ResumoService);
  private readonly modals = inject(ModalLauncherService);
  readonly resumo = new SectionLoader<ResumoInflacao>(inject(DestroyRef), () => this.settled.emit());

  /** Mês a mês / Ano a ano -- alterna qual série é exibida. */
  readonly janela = signal<'mensal' | 'anual'>('mensal');
  readonly pontos = computed(() => {
    const resumo = this.resumo.data();
    if (!resumo) return [];
    return this.janela() === 'mensal' ? resumo.mensal : resumo.anual;
  });
  readonly headline = computed(() => {
    const resumo = this.resumo.data();
    if (!resumo) return null;
    return this.janela() === 'mensal' ? resumo.headline_mom_pct : resumo.headline_yoy_pct;
  });
  readonly chartData = computed(() => buildInflacaoChartData(this.pontos()));
  readonly chartOptions = computed(() => maskChartOptions(INFLACAO_CHART_OPTIONS, ['y', 'y1'], this.valoresOcultos()));
  readonly chartLabel = computed(() => describeInflacao(this.pontos(), this.janela(), this.valoresOcultos()));

  constructor() {
    effect(() => {
      const corte = this.corte();
      this.reload();
      untracked(() => this.carregar(corte));
    });
  }

  carregar(corte = this.corte()): void {
    this.resumo.load(this.resumoService.inflacao(12, corte));
  }

  headlineTexto(valor: number): string {
    return `${valor > 0 ? '+' : ''}${PCT.format(valor)}%`;
  }

  abrirCategorias(): void {
    void this.modals.categorias();
  }
}
