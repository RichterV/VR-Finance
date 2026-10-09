import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonFabList,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonRefresher,
  IonRefresherContent,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  barChartOutline,
  close,
  documentTextOutline,
  eyeOffOutline,
  eyeOutline,
  notificationsOutline,
  personOutline,
  pricetagsOutline,
  removeCircleOutline,
  statsChartOutline,
} from 'ionicons/icons';
import { Subscription, catchError, debounceTime, of } from 'rxjs';

import { AuthService } from '../core/auth.service';
import { HomeRefreshService } from '../core/home-refresh.service';
import { ModalLauncherService } from '../core/modal-launcher.service';
import { Notificacao, NotificacoesService } from '../services/notificacoes.service';
import { Corte } from '../services/resumo.service';
import { MESES_COMPLETOS } from '../shared/months';
import { ResetPeriodButtonComponent } from '../shared/reset-period-button.component';
import { AnualSectionComponent } from './sections/anual-section.component';
import { GeralSectionComponent } from './sections/geral-section.component';
import { IndicadoresSectionComponent } from './sections/indicadores-section.component';
import { InflacaoSectionComponent } from './sections/inflacao-section.component';
import { MensalSectionComponent } from './sections/mensal-section.component';

/** Lançamentos salvos em sequência viram uma recarga só da Home. */
const REFRESH_DEBOUNCE_MS = 400;
/** Voltar pra Home só recarrega se os dados tiverem mais que isso (ou houver recarga pendente). */
const STALE_AFTER_MS = 30_000;
/** Pull-to-refresh nunca fica girando mais que isso, mesmo se alguma seção não responder. */
const REFRESHER_TIMEOUT_MS = 15_000;

/**
 * Dashboard único: cada seção (Mensal, Indicadores, Anual, Geral, Inflação) é um componente que
 * carrega os próprios dados e trata o próprio erro. A Home só guarda o estado compartilhado
 * (período, corte, privacidade) e dispara recargas.
 */
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
    IonRefresher,
    IonRefresherContent,
    IonFab,
    IonFabButton,
    IonFabList,
    NgTemplateOutlet,
    RouterLink,
    ResetPeriodButtonComponent,
    MensalSectionComponent,
    IndicadoresSectionComponent,
    AnualSectionComponent,
    GeralSectionComponent,
    InflacaoSectionComponent,
  ],
})
export class HomePage implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly notificacoes = inject(NotificacoesService);
  readonly modals = inject(ModalLauncherService);
  private readonly homeRefresh = inject(HomeRefreshService);
  private readonly route = inject(ActivatedRoute);

  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];

  readonly mes = signal(new Date().getMonth() + 1);
  readonly anoMensal = signal(new Date().getFullYear());

  /** Módulo opcional: sem ele, a seção "Análise inflacionária" some (e /resumo/inflacao nem é chamado). */
  readonly inflacaoHabilitada = computed(() => this.auth.hasModule('analise_inflacionaria'));

  /** Modo privacidade: valores ocultos sempre que a Home abre, como em apps de banco. */
  readonly valoresOcultos = signal(true);

  /**
   * "Mostrar apenas até o mês selecionado" — quando ligado, Indicadores, Anual, Geral e Inflação só
   * consideram lançamentos até o mês/ano do seletor do Resumo Mensal (ignora parcelas futuras já
   * lançadas). Um único estado compartilhado entre as seções; ligado por padrão.
   */
  readonly limitarAteMesSelecionado = signal(true);

  readonly corte = computed<Corte | undefined>(
    () => (this.limitarAteMesSelecionado() ? { ateAno: this.anoMensal(), ateMes: this.mes() } : undefined),
    // Mesmo corte = mesmo valor: as seções que não dependem do mês não recarregam à toa.
    { equal: (a, b) => a?.ateAno === b?.ateAno && a?.ateMes === b?.ateMes },
  );

  /** Incrementado pra forçar todas as seções a recarregar. */
  readonly reloadToken = signal(0);
  private lastLoadedAt = Date.now();
  private refreshPending = false;
  private refresher: HTMLIonRefresherElement | null = null;
  private refresherPendentes = 0;
  private refresherTimeout?: ReturnType<typeof setTimeout>;

  private refreshSubscription?: Subscription;
  private fragmentSubscription?: Subscription;

  constructor() {
    addIcons({
      add,
      removeCircleOutline,
      addCircleOutline,
      pricetagsOutline,
      personOutline,
      barChartOutline,
      eyeOutline,
      eyeOffOutline,
      documentTextOutline,
      notificationsOutline,
      statsChartOutline,
      close,
    });
    const currentYear = new Date().getFullYear();
    this.anos = Array.from({ length: 6 }, (_, i) => currentYear - i);
  }

  ngOnInit(): void {
    // Lançamento salvo (os modais ficam abertos pra lançar em série) ou "Início" no menu: uma recarga
    // depois que a sequência para, não uma por lançamento.
    this.refreshSubscription = this.homeRefresh.refresh$.pipe(debounceTime(REFRESH_DEBOUNCE_MS)).subscribe(() => {
      this.refreshPending = true;
      this.recarregar();
    });
    this.fragmentSubscription = this.route.fragment.subscribe((fragment) => this.scrollToFragment(fragment));
  }

  ngOnDestroy(): void {
    this.refreshSubscription?.unsubscribe();
    this.fragmentSubscription?.unsubscribe();
    clearTimeout(this.refresherTimeout);
  }

  /**
   * O ion-router-outlet mantém a instância da Home em cache -- ao voltar pra ela, recarrega só se os
   * dados estiverem velhos ou houver recarga pendente (antes recarregava tudo, sempre).
   */
  ionViewWillEnter(): void {
    if (this.refreshPending || Date.now() - this.lastLoadedAt > STALE_AFTER_MS) {
      this.recarregar();
    }
    this.loadNotificacoes();
  }

  private recarregar(): void {
    this.refreshPending = false;
    this.lastLoadedAt = Date.now();
    this.reloadToken.update((n) => n + 1);
  }

  /** Fora das seções de propósito: uma falha aqui não pode afetar o dashboard. */
  private loadNotificacoes(): void {
    this.notificacoes
      .load()
      .pipe(catchError(() => of([])))
      .subscribe();
  }

  onPullToRefresh(event: CustomEvent): void {
    this.refresher = event.target as HTMLIonRefresherElement;
    this.refresherPendentes = this.inflacaoHabilitada() ? 5 : 4;
    clearTimeout(this.refresherTimeout);
    this.refresherTimeout = setTimeout(() => this.completarRefresher(), REFRESHER_TIMEOUT_MS);
    this.loadNotificacoes();
    this.recarregar();
  }

  /** Cada seção avisa quando terminou de carregar (com sucesso ou erro). */
  onSectionSettled(): void {
    if (!this.refresher) return;
    this.refresherPendentes -= 1;
    if (this.refresherPendentes <= 0) this.completarRefresher();
  }

  private completarRefresher(): void {
    clearTimeout(this.refresherTimeout);
    void this.refresher?.complete();
    this.refresher = null;
  }

  /** Navegação vinda dos subitens do menu ("Resumo mensal", "Indicadores"...) -- rola até a seção. */
  private scrollToFragment(fragment: string | null, attemptsLeft = 20): void {
    if (!fragment) return;
    const el = document.getElementById(fragment);
    if (el) {
      const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (attemptsLeft <= 0) return;
    requestAnimationFrame(() => this.scrollToFragment(fragment, attemptsLeft - 1));
  }

  toggleValores(): void {
    this.valoresOcultos.update((oculto) => !oculto);
  }

  onMesChange(value: number): void {
    this.mes.set(value);
  }

  onAnoMensalChange(value: number): void {
    this.anoMensal.set(value);
  }

  periodoMensalIsDefault(): boolean {
    const hoje = new Date();
    return this.mes() === hoje.getMonth() + 1 && this.anoMensal() === hoje.getFullYear();
  }

  /** Volta o seletor mensal pro mês/ano atual (o padrão da Home -- aqui o período nunca fica vazio). */
  resetPeriodoMensal(): void {
    const hoje = new Date();
    this.mes.set(hoje.getMonth() + 1);
    this.anoMensal.set(hoje.getFullYear());
  }

  toggleLimitarAteMesSelecionado(): void {
    this.limitarAteMesSelecionado.update((v) => !v);
  }

  abrirDetalhesMes(): void {
    void this.modals.detalhesMes(this.anoMensal(), this.mes(), this.valoresOcultos());
  }

  nomeMes(mes: number): string {
    return MESES_COMPLETOS[mes - 1].toLowerCase();
  }

  /** Uma linha de prévia do resumo pro card da Home (só %, nunca R$ -- vale mesmo com valores ocultos). */
  teaserResumo(n: Notificacao): string {
    const p = n.payload;
    const partes: string[] = [];
    const variacao = p.gastos.variacao_pct;
    if (variacao !== null && Math.abs(variacao) >= 1) {
      const texto = Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      partes.push(`Gastos ${variacao > 0 ? '+' : '−'}${texto}% vs. média`);
    }
    if (p.subiram.length) {
      partes.push(`${p.subiram[0].item_name} subiu ${Math.round(p.subiram[0].variacao_pct)}%`);
    } else if (p.cairam.length) {
      partes.push(`${p.cairam[0].item_name} caiu ${Math.round(Math.abs(p.cairam[0].variacao_pct))}%`);
    }
    if (p.parcelamentos_encerrados.length) {
      partes.push(`${p.parcelamentos_encerrados.length} parcelamento(s) encerrado(s)`);
    }
    return partes.length ? partes.join(' · ') : 'Veja como foi o mês em relação aos anteriores';
  }

  abrirResumo(n: Notificacao): void {
    void this.modals.resumoMensal(n, this.valoresOcultos());
  }

  dispensarResumo(n: Notificacao): void {
    this.notificacoes.markRead(n.id).subscribe();
  }

  abrirNotificacoes(): void {
    void this.modals.notificacoes(this.valoresOcultos());
  }
}
