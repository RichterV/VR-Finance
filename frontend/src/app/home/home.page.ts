import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonRefresher,
  IonRefresherContent,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  barChartOutline,
  documentTextOutline,
  expandOutline,
  eyeOffOutline,
  eyeOutline,
  personOutline,
  pricetagsOutline,
  removeCircleOutline,
} from 'ionicons/icons';
import { BaseChartDirective } from 'ng2-charts';
import { forkJoin, Observable, Subscription, tap } from 'rxjs';

import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../modals/side-modal.animations';
import { AuthService } from '../core/auth.service';
import { HomeRefreshService } from '../core/home-refresh.service';
import { Corte, ItemPercentual, ResumoAnual, ResumoGeral, ResumoMensal, ResumoService } from '../services/resumo.service';
import { LoadingStateComponent } from '../shared/loading-state.component';
import { MESES_COMPLETOS } from '../shared/months';
import { Priority } from '../services/dropdown-options.service';
import { COMBO_CHART_OPTIONS, LINE_CHART_OPTIONS, buildComboChartData, buildLineChartData } from './dashboard-charts';
import {
  GERAL_CHART_OPTIONS,
  TOTAIS_GERAIS_CHART_OPTIONS,
  buildPorAnoChartData,
  buildPorMesChartData,
  buildTotaisGeraisChartData,
} from './relatorio-geral-charts';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonMenuButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    BaseChartDirective,
    RouterLink,
    LoadingStateComponent,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];

  readonly mes = signal(new Date().getMonth() + 1);
  readonly anoMensal = signal(new Date().getFullYear());

  readonly resumoMensal = signal<ResumoMensal | null>(null);
  readonly resumoAnual = signal<ResumoAnual | null>(null);
  readonly resumoGeral = signal<ResumoGeral | null>(null);

  /** Verdadeiro até a primeira carga dos 3 resumos terminar (evita as seções aparecerem vazias/escalonadas). */
  readonly loading = computed(() => this.resumoMensal() === null || this.resumoAnual() === null || this.resumoGeral() === null);

  /** Modo privacidade: valores ocultos por padrão, como em apps de banco. Só se aplica à Home. */
  readonly valoresOcultos = signal(true);

  /**
   * "Mostrar apenas até o mês selecionado" — quando ligado, Anual e Geral só consideram lançamentos
   * até o mês/ano do seletor do Resumo Mensal (ignora meses futuros já lançados, ex: parcelas). É um
   * único estado compartilhado entre as 3 seções; na Mensal não tem efeito, já que ela mesma só olha
   * pra um mês.
   */
  readonly limitarAteMesSelecionado = signal(false);

  private get corteAtual(): Corte | undefined {
    return this.limitarAteMesSelecionado() ? { ateAno: this.anoMensal(), ateMes: this.mes() } : undefined;
  }

  readonly lineChartData = computed(() => buildLineChartData(this.resumoAnual()?.evolucao_12_meses ?? []));
  readonly lineChartOptions = computed(() => this.maskChartOptions(LINE_CHART_OPTIONS, ['y']));

  readonly comboChartData = computed(() => buildComboChartData(this.resumoAnual()?.caixa_pretendido_vs_real ?? []));
  readonly comboChartOptions = computed(() => this.maskChartOptions(COMBO_CHART_OPTIONS, ['y', 'y1']));

  readonly porAnoChartData = computed(() => buildPorAnoChartData(this.resumoGeral()?.anos ?? []));
  readonly porAnoChartOptions = computed(() => this.maskChartOptions(GERAL_CHART_OPTIONS, ['y']));

  readonly totaisGeraisChartData = computed(() => buildTotaisGeraisChartData(this.resumoGeral()));
  readonly totaisGeraisChartOptions = computed(() => this.maskChartOptions(TOTAIS_GERAIS_CHART_OPTIONS, ['y']));

  readonly porMesChartData = computed(() => buildPorMesChartData(this.resumoGeral()));
  readonly porMesChartOptions = computed(() => this.maskChartOptions(GERAL_CHART_OPTIONS, ['y']));

  private refreshSubscription?: Subscription;

  constructor(
    readonly auth: AuthService,
    private readonly resumoService: ResumoService,
    private readonly modalCtrl: ModalController,
    private readonly homeRefresh: HomeRefreshService,
  ) {
    addIcons({
      removeCircleOutline,
      addCircleOutline,
      pricetagsOutline,
      personOutline,
      barChartOutline,
      expandOutline,
      eyeOutline,
      eyeOffOutline,
      documentTextOutline,
    });
    const currentYear = new Date().getFullYear();
    this.anos = Array.from({ length: 6 }, (_, i) => currentYear - i);
  }

  ngOnInit(): void {
    this.reloadAll().subscribe();
    this.refreshSubscription = this.homeRefresh.refresh$.subscribe(() => this.reloadAll().subscribe());
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
  }

  /** Clicar em "Início" ja na Home (menu lateral do desktop) ou puxar a tela pra baixo (pull-to-refresh no app) cai aqui. */
  onPullToRefresh(event: CustomEvent): void {
    this.reloadAll().subscribe(() => (event.target as HTMLIonRefresherElement).complete());
  }

  /** Recarrega os 3 resumos de uma vez -- usado na carga inicial, no pull-to-refresh/"Início" e apos salvar um lancamento. */
  private reloadAll(): Observable<[ResumoMensal, ResumoAnual, ResumoGeral]> {
    return forkJoin([
      this.resumoService.mensal(this.anoMensal(), this.mes()),
      this.resumoService.anual(this.anoMensal(), 12, this.corteAtual),
      this.resumoService.geral(this.corteAtual),
    ]).pipe(
      tap(([mensal, anual, geral]) => {
        this.resumoMensal.set(mensal);
        this.resumoAnual.set(anual);
        this.resumoGeral.set(geral);
      }),
    );
  }

  /** Itens do grupo (essencial/não essencial), do maior para o menor percentual. */
  itemsForPriority(items: ItemPercentual[], priority: Priority): ItemPercentual[] {
    return items.filter((item) => item.priority === priority).sort((a, b) => b.percentual - a.percentual);
  }

  /** Maior percentual do grupo — usado para a barra mais alta preencher 100% e as demais seguirem a proporção. */
  maxPercentual(items: ItemPercentual[]): number {
    return items[0]?.percentual || 1;
  }

  /** Percentual de `valor` sobre `total` (ex: essenciais sobre o total de gastos do período). */
  percentDoTotal(valor: number, total: number): number {
    return total ? (valor / total) * 100 : 0;
  }

  toggleValores(): void {
    this.valoresOcultos.update((oculto) => !oculto);
  }

  /** Valor em R$, mascarado no modo privacidade. */
  maskCurrency(valor: number): string {
    return this.valoresOcultos() ? '••••••' : valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Contagem simples (qtd. de gastos/receitas), mascarada no modo privacidade. */
  maskCount(valor: number): string {
    return this.valoresOcultos() ? '••' : String(valor);
  }

  /** Percentual de um item sobre o total do grupo, mascarado no modo privacidade. */
  maskItemPercent(valor: number): string {
    return this.valoresOcultos() ? '••%' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  /** "(XX,X%)" ao lado do valor de Essenciais/Não essenciais, mascarado no modo privacidade. */
  maskPercentParen(valor: number, total: number): string {
    if (this.valoresOcultos()) return '(••%)';
    const percentual = this.percentDoTotal(valor, total).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    return `(${percentual}%)`;
  }

  /** Largura da barra de percentual — zerada no modo privacidade pra não vazar proporções. */
  maskWidth(largura: number): number {
    return this.valoresOcultos() ? 0 : largura;
  }

  /** Some com os ticks numéricos dos eixos de valor do gráfico e desliga o tooltip, no modo privacidade. */
  private maskChartOptions(base: any, axisKeys: string[]): any {
    if (!this.valoresOcultos()) return base;
    const scales: Record<string, any> = { ...(base.scales ?? {}) };
    for (const key of axisKeys) {
      if (scales[key]) {
        scales[key] = { ...scales[key], ticks: { ...scales[key].ticks, callback: () => '' } };
      }
    }
    return {
      ...base,
      scales,
      plugins: { ...base.plugins, tooltip: { ...(base.plugins?.tooltip ?? {}), enabled: false } },
    };
  }

  onMesChange(value: number): void {
    this.mes.set(value);
    this.loadResumoMensal();
    if (this.limitarAteMesSelecionado()) {
      this.loadResumoAnual();
      this.loadResumoGeral();
    }
  }

  onAnoMensalChange(value: number): void {
    this.anoMensal.set(value);
    this.loadResumoMensal();
    this.loadResumoAnual();
    if (this.limitarAteMesSelecionado()) {
      this.loadResumoGeral();
    }
  }

  setLimitarAteMesSelecionado(value: boolean): void {
    this.limitarAteMesSelecionado.set(value);
    this.loadResumoAnual();
    this.loadResumoGeral();
  }

  private loadResumoMensal(): void {
    this.resumoService.mensal(this.anoMensal(), this.mes()).subscribe((resumo) => this.resumoMensal.set(resumo));
  }

  private loadResumoAnual(): void {
    this.resumoService.anual(this.anoMensal(), 12, this.corteAtual).subscribe((resumo) => this.resumoAnual.set(resumo));
  }

  private loadResumoGeral(): void {
    this.resumoService.geral(this.corteAtual).subscribe((resumo) => this.resumoGeral.set(resumo));
  }

  private sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  async abrirAdicionarGasto(): Promise<void> {
    const { AdicionarGastoModalComponent } = await import(
      '../modals/adicionar-gasto/adicionar-gasto-modal.component'
    );
    const modal = await this.modalCtrl.create({ component: AdicionarGastoModalComponent, ...this.sideModalOptions() });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reloadAll().subscribe();
    }
  }

  async abrirAdicionarReceita(): Promise<void> {
    const { AdicionarReceitaModalComponent } = await import(
      '../modals/adicionar-receita/adicionar-receita-modal.component'
    );
    const modal = await this.modalCtrl.create({ component: AdicionarReceitaModalComponent, ...this.sideModalOptions() });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reloadAll().subscribe();
    }
  }

  async abrirItens(): Promise<void> {
    const { ItensModalComponent } = await import('../modals/itens/itens-modal.component');
    const modal = await this.modalCtrl.create({ component: ItensModalComponent, ...this.sideModalOptions() });
    await modal.present();
  }

  async abrirPerfil(): Promise<void> {
    const { PerfilModalComponent } = await import('../modals/perfil/perfil-modal.component');
    const modal = await this.modalCtrl.create({ component: PerfilModalComponent, ...this.sideModalOptions() });
    await modal.present();
  }

  async abrirDetalhesMes(): Promise<void> {
    const { DetalhesMesModalComponent } = await import('../modals/detalhes-mes/detalhes-mes-modal.component');
    const modal = await this.modalCtrl.create({
      component: DetalhesMesModalComponent,
      componentProps: { ano: this.anoMensal(), mes: this.mes() },
      cssClass: 'fullscreen-modal',
    });
    await modal.present();
  }

  async expandirGrafico(chartType: 'line' | 'bar', title: string): Promise<void> {
    const { ChartExpandModalComponent } = await import('../modals/chart-expand/chart-expand-modal.component');
    const modal = await this.modalCtrl.create({
      component: ChartExpandModalComponent,
      componentProps: { chartType, title, ano: this.anoMensal() },
      cssClass: 'fullscreen-modal',
    });
    await modal.present();
  }
}
