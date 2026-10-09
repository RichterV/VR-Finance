import { Component, DestroyRef, computed, effect, inject, input, output, untracked } from '@angular/core';

import { ErrorStateComponent } from '../../shared/error-state.component';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import { SparklineComponent } from '../../shared/sparkline.component';
import { ResumoAnual, ResumoMensal, ResumoService } from '../../services/resumo.service';
import { COLOR_CAIXA_REAL, COLOR_ESSENCIAL, COLOR_INFLACAO, COLOR_NAO_ESSENCIAL } from '../dashboard-charts';
import { PercentuaisItensComponent } from './percentuais-itens.component';
import { SectionLoader } from './section-loader';
import { maskCount, maskCurrency, maskPercentParen } from './value-mask';

/** Quantos meses (terminando no selecionado) cada mini-tendência dos cards mostra. */
const MESES_TENDENCIA = 6;

/** Cards do Resumo mensal + barras por categoria. */
@Component({
  selector: 'app-mensal-section',
  templateUrl: './mensal-section.component.html',
  styleUrls: ['./mensal-section.component.scss'],
  imports: [PercentuaisItensComponent, SectionSkeletonComponent, ErrorStateComponent, SparklineComponent],
})
export class MensalSectionComponent {
  readonly ano = input.required<number>();
  readonly mes = input.required<number>();
  readonly valoresOcultos = input(false);
  /** Incrementado pela Home pra forçar recarga (pull-to-refresh, lançamento salvo). */
  readonly reload = input(0);
  readonly settled = output<void>();

  private readonly resumoService = inject(ResumoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly resumo = new SectionLoader<ResumoMensal>(this.destroyRef, () => this.settled.emit());
  private readonly tendencia = new SectionLoader<ResumoAnual>(this.destroyRef);

  readonly colors = { gastos: COLOR_INFLACAO, essencial: COLOR_ESSENCIAL, naoEssencial: COLOR_NAO_ESSENCIAL, caixa: COLOR_CAIXA_REAL };

  readonly series = computed(() => {
    const evolucao = this.tendencia.data()?.evolucao_12_meses ?? [];
    return {
      gastos: evolucao.map((m) => m.essencial + m.nao_essencial),
      essencial: evolucao.map((m) => m.essencial),
      naoEssencial: evolucao.map((m) => m.nao_essencial),
      caixa: evolucao.map((m) => m.caixa),
    };
  });

  constructor() {
    effect(() => {
      const ano = this.ano();
      const mes = this.mes();
      this.reload();
      untracked(() => this.carregar(ano, mes));
    });
  }

  carregar(ano = this.ano(), mes = this.mes()): void {
    this.resumo.load(this.resumoService.mensal(ano, mes));
    this.tendencia.load(this.resumoService.anual(ano, MESES_TENDENCIA, { ateAno: ano, ateMes: mes }));
  }

  currency(valor: number): string {
    return maskCurrency(valor, this.valoresOcultos());
  }

  count(valor: number): string {
    return maskCount(valor, this.valoresOcultos());
  }

  percentParen(valor: number, total: number): string {
    return maskPercentParen(valor, total, this.valoresOcultos());
  }
}
