import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonRouterOutlet,
  IonSplitPane,
  IonTitle,
  IonToolbar,
  MenuController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { carSportOutline, homeOutline, logOutOutline, peopleOutline, pin, pinOutline, trendingUpOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { HomeRefreshService } from '../core/home-refresh.service';
import { BackupWarningBannerComponent } from '../shared/backup-warning-banner.component';

interface NavSubItem {
  label: string;
  route: string;
  fragment: string;
}

interface NavItem {
  label: string;
  icon: string;
  route: string;
  children?: NavSubItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Início',
    icon: 'home-outline',
    route: '/home',
    children: [
      { label: 'Resumo mensal', route: '/home', fragment: 'resumo-mensal' },
      { label: 'Resumo anual', route: '/home', fragment: 'resumo-anual' },
      { label: 'Relatório geral', route: '/home', fragment: 'relatorio-geral' },
    ],
  },
  { label: 'Manutenção Veículos', icon: 'car-sport-outline', route: '/veiculos' },
  { label: 'Operações Bolsa', icon: 'trending-up-outline', route: '/operacoes-bolsa' },
];

/** Below this width we keep the classic always-visible/hamburger split-pane menu (touch-friendly, no hover). */
const DESKTOP_BREAKPOINT = 992;

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
  imports: [
    RouterLink,
    RouterLinkActive,
    IonSplitPane,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonRouterOutlet,
    BackupWarningBannerComponent,
  ],
})
export class MainLayoutComponent {
  readonly navItems = NAV_ITEMS;

  readonly isDesktop = signal(MainLayoutComponent.checkDesktop());
  /** Fixado por padrão no desktop -- o usuário ainda pode desafixar pelo botão de pin. */
  readonly pinned = signal(true);
  readonly hovering = signal(false);
  readonly expanded = computed(() => this.pinned() || this.hovering());

  constructor(
    readonly auth: AuthService,
    private readonly menuCtrl: MenuController,
    private readonly router: Router,
    private readonly homeRefresh: HomeRefreshService,
  ) {
    addIcons({ homeOutline, carSportOutline, logOutOutline, peopleOutline, pin, pinOutline, trendingUpOutline });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isDesktop.set(MainLayoutComponent.checkDesktop());
  }

  private static checkDesktop(): boolean {
    return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT;
  }

  onSideNavEnter(): void {
    this.hovering.set(true);
  }

  onSideNavLeave(): void {
    this.hovering.set(false);
  }

  togglePin(): void {
    this.pinned.update((value) => !value);
  }

  /** Clicar em "Início" ja estando na Home nao navega pra lugar nenhum -- em vez de nao fazer nada, recarrega os dados. */
  onNavItemClick(item: NavItem, event: Event): void {
    if (item.route === '/home' && this.router.url.startsWith('/home')) {
      event.preventDefault();
      this.homeRefresh.request();
    }
  }

  closeMenu(): void {
    this.menuCtrl.close();
  }

  logout(): void {
    this.auth.logout();
  }
}
