import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronUpOutline, trendingDownOutline, trendingUpOutline } from 'ionicons/icons';

import { ErrorStateComponent } from '../../shared/error-state.component';
import { MESES_ABREV } from '../../shared/months';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import { SparklineComponent } from '../../shared/sparkline.component';
import { Corte, Indicadores, ResumoService } from '../../services/resumo.service';
import { COLOR_CAIXA_REAL, COLOR_ESSENCIAL } from '../dashboard-charts';
import { SectionLoader } from './section-loader';
import { maskCurrency } from './value-mask';

const PCT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Indicadores calculados sobre o histórico: poupança, comprometimento futuro, custo fixo e % essencial. */
@Component({
  selector: 'app-indicadores-section',
  templateUrl: './indicadores-section.component.html',
  styleUrls: ['./indicadores-section.component.scss'],
  imports: [IonIcon, SectionSkeletonComponent, ErrorStateComponent, SparklineComponent],
})
export class IndicadoresSectionComponent {
  readonly corte = input<Corte | undefined>(undefined);
  readonly valoresOcultos = input(false);
  readonly reload = input(0);
  readonly settled = output<void>();

  private readonly resumoService = inject(ResumoService);
  readonly indicadores = new SectionLoader<Indicadores>(inject(DestroyRef), () => this.settled.emit());

  readonly mostrarFixos = signal(false);
  readonly colors = { poupanca: COLOR_CAIXA_REAL, essencial: COLOR_ESSENCIAL };

  readonly poupancaSerie = computed(() => this.indicadores.data()?.poupanca.serie.map((p) => p.valor) ?? []);
  readonly essencialSerie = computed(() => this.indicadores.data()?.essencial.serie.map((p) => p.valor) ?? []);
  /** Barras do comprometimento futuro, escaladas pelo maior mês. */
  readonly barrasFuturas = computed(() => {
    const meses = this.indicadores.data()?.comprometimento.meses ?? [];
    const max = Math.max(...meses.map((m) => m.valor ?? 0), 0) || 1;
    return meses.map((m) => ({ label: MESES_ABREV[m.mes - 1], altura: ((m.valor ?? 0) / max) * 100, valor: m.valor ?? 0 }));
  });

  constructor() {
    addIcons({ chevronDownOutline, chevronUpOutline, trendingUpOutline, trendingDownOutline });
    effect(() => {
      const corte = this.corte();
      this.reload();
      untracked(() => this.carregar(corte));
    });
  }

  carregar(corte = this.corte()): void {
    this.indicadores.load(this.resumoService.indicadores(corte));
  }

  pct(valor: number | null): string {
    return valor === null ? '—' : `${PCT.format(valor)}%`;
  }

  /** Inclinação em pontos percentuais por mês, com sinal. */
  pp(valor: number): string {
    return `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${PCT.format(Math.abs(valor))} p.p./mês`;
  }

  currency(valor: number): string {
    return maskCurrency(valor, this.valoresOcultos());
  }
}
