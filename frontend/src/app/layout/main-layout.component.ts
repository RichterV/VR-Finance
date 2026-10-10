import { Component, HostListener, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonContent,
  IonFooter,
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
import {
  briefcaseOutline,
  calculatorOutline,
  carSportOutline,
  chevronForward,
  downloadOutline,
  homeOutline,
  logOutOutline,
  peopleOutline,
  personOutline,
  pin,
  pinOutline,
  pricetagsOutline,
  shieldCheckmarkOutline,
  trendingUpOutline,
} from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { HomeRefreshService } from '../core/home-refresh.service';
import { ModalLauncherService } from '../core/modal-launcher.service';
import { OPTIONAL_MODULES } from '../core/modules';
import { BackupWarningBannerComponent } from '../shared/backup-warning-banner.component';
import { AccountFooterComponent } from './account-footer.component';

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

const INFLACAO_FRAGMENT = 'analise-inflacionaria';

const HOME_ITEM: NavItem = {
  label: 'Início',
  icon: 'home-outline',
  route: '/home',
  children: [
    { label: 'Resumo mensal', route: '/home', fragment: 'resumo-mensal' },
    { label: 'Indicadores', route: '/home', fragment: 'indicadores' },
    { label: 'Resumo anual', route: '/home', fragment: 'resumo-anual' },
    { label: 'Relatório geral', route: '/home', fragment: 'relatorio-geral' },
    { label: 'Análise inflacionária', route: '/home', fragment: INFLACAO_FRAGMENT },
  ],
};

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
    IonFooter,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonRouterOutlet,
    BackupWarningBannerComponent,
    AccountFooterComponent,
  ],
})
export class MainLayoutComponent {
  /**
   * Só navegação de módulos: Início + módulos opcionais habilitados. Administração, Categorias e Perfil
   * ficam no rodapé da conta (`AccountFooterComponent`), pra não parecerem módulos.
   */
  readonly navItems = computed<NavItem[]>(() => {
    const user = this.auth.currentUser();
    const modules = OPTIONAL_MODULES.filter((m) => m.route && user?.modules.includes(m.key)).map(
      ({ label, icon, route }) => ({ label, icon, route: route! }),
    );
    const home = user?.modules.includes('analise_inflacionaria')
      ? HOME_ITEM
      : { ...HOME_ITEM, children: HOME_ITEM.children?.filter((c) => c.fragment !== INFLACAO_FRAGMENT) };
    return [home, ...modules];
  });

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
    private readonly modals: ModalLauncherService,
  ) {
    addIcons({
      briefcaseOutline,
      homeOutline,
      carSportOutline,
      logOutOutline,
      peopleOutline,
      personOutline,
      pricetagsOutline,
      pin,
      pinOutline,
      trendingUpOutline,
      calculatorOutline,
      chevronForward,
      downloadOutline,
      shieldCheckmarkOutline,
    });
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

  /** Fecha o menu antes de abrir o modal (senão o menu fica por cima no celular). */
  async abrirCategorias(): Promise<void> {
    await this.menuCtrl.close();
    await this.modals.categorias();
  }

  async abrirPerfil(): Promise<void> {
    await this.menuCtrl.close();
    await this.modals.perfil();
  }

  logout(): void {
    this.auth.logout();
  }
}
