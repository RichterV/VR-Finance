import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowDown,
  arrowForward,
  arrowUp,
  calendarOutline,
  checkmarkCircleOutline,
  close,
  eyeOffOutline,
  eyeOutline,
  flashOutline,
  trendingDownOutline,
  trendingUpOutline,
} from 'ionicons/icons';

import { MESES_COMPLETOS } from '../../shared/months';
import { IndicadorMensal, Notificacao, NotificacoesService, VariacaoCategoria } from '../../services/notificacoes.service';
import { PrioDotComponent } from '../../shared/prio-dot.component';

interface Kpi {
  key: string;
  label: string;
  indicador: IndicadorMensal;
  /** true = subir é bom (receita, caixa); false = subir é ruim (gastos). */
  subirEhBom: boolean;
}

/** Resumo da virada do mês (aberto pelo card da Home ou pela lista de notificações). Só leitura. */
@Component({
  selector: 'app-resumo-mensal-modal',
  templateUrl: './resumo-mensal-modal.component.html',
  styleUrls: ['./resumo-mensal-modal.component.scss'],
  imports: [PrioDotComponent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent],
})
export class ResumoMensalModalComponent implements OnInit {
  @Input({ required: true }) notificacao!: Notificacao;
  /** Mesmo modo privacidade do olho da Home -- esconde só os R$, os % continuam visíveis. */
  @Input() valoresOcultos = false;

  readonly ocultos = signal(false);

  readonly p = computed(() => this.notificacao.payload);

  readonly tituloMes = computed(() => `${MESES_COMPLETOS[this.p().mes - 1]} de ${this.p().ano}`);

  /** "junho a agosto" -- os meses que formam a média de comparação. */
  readonly periodoBase = computed(() => {
    const { ano, mes, meses_base } = this.p();
    const inicio = new Date(ano, mes - 1 - meses_base, 1);
    const fim = new Date(ano, mes - 2, 1);
    return `${MESES_COMPLETOS[inicio.getMonth()].toLowerCase()} a ${MESES_COMPLETOS[fim.getMonth()].toLowerCase()}`;
  });

  readonly kpis = computed<Kpi[]>(() => [
    { key: 'gastos', label: 'Gastos', indicador: this.p().gastos, subirEhBom: false },
    { key: 'receita', label: 'Receita', indicador: this.p().receita, subirEhBom: true },
    { key: 'caixa_real', label: 'Caixa real', indicador: this.p().caixa_real, subirEhBom: true },
    { key: 'caixa_pretendido', label: 'Caixa pretendido', indicador: this.p().caixa_pretendido, subirEhBom: true },
  ]);

  readonly mesEstavel = computed(() => !this.p().subiram.length && !this.p().cairam.length && !this.p().pontuais.length);
  readonly temParcelamentos = computed(
    () => this.p().parcelamentos_novos.length > 0 || this.p().parcelamentos_encerrados.length > 0,
  );
  readonly totalLiberado = computed(() => this.p().parcelamentos_encerrados.reduce((s, x) => s + x.valor_parcela, 0));

  constructor(
    private readonly modalCtrl: ModalController,
    private readonly notificacoes: NotificacoesService,
    private readonly router: Router,
  ) {
    addIcons({
      close,
      eyeOutline,
      eyeOffOutline,
      arrowUp,
      arrowDown,
      arrowForward,
      trendingUpOutline,
      trendingDownOutline,
      flashOutline,
      calendarOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
    });
  }

  ngOnInit(): void {
    this.ocultos.set(this.valoresOcultos);
    if (!this.notificacao.lida) {
      this.notificacoes.markRead(this.notificacao.id).subscribe();
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  toggleOcultos(): void {
    this.ocultos.update((v) => !v);
  }

  async verDevedores(): Promise<void> {
    await this.modalCtrl.dismiss();
    await this.router.navigateByUrl('/devedores');
  }

  money(valor: number): string {
    return this.ocultos() ? 'R$ ••••' : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  pct(valor: number, comSinal = true): string {
    const texto = Math.abs(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
    if (!comSinal) return `${texto}%`;
    return `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${texto}%`;
  }

  /** "bom"/"ruim" de uma variação, pela semântica do indicador (gasto subindo é ruim). */
  tom(variacao: number | null, subirEhBom: boolean): 'good' | 'bad' | 'neutral' {
    if (variacao === null || Math.abs(variacao) < 0.05) return 'neutral';
    return variacao > 0 === subirEhBom ? 'good' : 'bad';
  }

  /** Largura (%) das barras mês vs. média de uma categoria, escaladas pelo maior dos dois. */
  barras(c: VariacaoCategoria): { valor: number; media: number } {
    const max = Math.max(c.valor, c.media) || 1;
    return { valor: (c.valor / max) * 100, media: (c.media / max) * 100 };
  }

  /** Posição (0–100) da taxa de poupança e da meta na régua -- negativa (gastou mais que recebeu) fica em 0. */
  clampPct(valor: number | null): number {
    return Math.max(0, Math.min(100, valor ?? 0));
  }
}
