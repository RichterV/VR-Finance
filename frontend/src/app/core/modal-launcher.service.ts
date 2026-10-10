import { Injectable } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../modals/side-modal.animations';
import { Empresa } from '../services/empresa.service';
import { NotificacaoResumoMensal } from '../services/notificacoes.service';

/**
 * Abre os modais da Home de qualquer lugar -- header da Home, botão flutuante (+) e menu lateral do
 * celular (Categorias/Perfil). Cada modal é carregado sob demanda (import dinâmico).
 */
@Injectable({ providedIn: 'root' })
export class ModalLauncherService {
  constructor(private readonly modalCtrl: ModalController) {}

  /** Painel lateral no desktop, padrão do Ionic (tela cheia/centralizado) no celular. */
  sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  private async present(component: unknown, componentProps?: Record<string, unknown>, extra = this.sideModalOptions()) {
    const modal = await this.modalCtrl.create({ component: component as any, componentProps, ...extra });
    await modal.present();
    return modal;
  }

  async adicionarGasto() {
    const { AdicionarGastoModalComponent } = await import('../modals/adicionar-gasto/adicionar-gasto-modal.component');
    // O próprio modal pede a recarga da Home ao salvar (fica aberto pra lançar vários em sequência).
    return this.present(AdicionarGastoModalComponent);
  }

  async adicionarReceita() {
    const { AdicionarReceitaModalComponent } = await import('../modals/adicionar-receita/adicionar-receita-modal.component');
    return this.present(AdicionarReceitaModalComponent);
  }

  async categorias() {
    const { ItensModalComponent } = await import('../modals/itens/itens-modal.component');
    return this.present(ItensModalComponent);
  }

  async perfil() {
    const { PerfilModalComponent } = await import('../modals/perfil/perfil-modal.component');
    return this.present(PerfilModalComponent);
  }

  async resumoMensal(notificacao: NotificacaoResumoMensal, valoresOcultos: boolean) {
    const { ResumoMensalModalComponent } = await import('../modals/resumo-mensal/resumo-mensal-modal.component');
    return this.present(ResumoMensalModalComponent, { notificacao, valoresOcultos });
  }

  /** Relatório anual de receitas e gastos (Exportar Dados > Relatórios e aviso da virada do ano). */
  async relatorioAnual(ano: number | null = null) {
    const { RelatorioAnualModalComponent } = await import('../modals/relatorio-anual/relatorio-anual-modal.component');
    return this.present(RelatorioAnualModalComponent, { ano });
  }

  async declaracaoAnualMei(empresa: Empresa) {
    const { DeclaracaoAnualModalComponent } = await import('../modals/declaracao-anual/declaracao-anual-modal.component');
    return this.present(DeclaracaoAnualModalComponent, { empresa });
  }

  async notificacoes(valoresOcultos: boolean) {
    const { NotificacoesModalComponent } = await import('../modals/notificacoes/notificacoes-modal.component');
    return this.present(NotificacoesModalComponent, { valoresOcultos });
  }

  async detalhesMes(ano: number, mes: number, valoresOcultos = false) {
    const { DetalhesMesModalComponent } = await import('../modals/detalhes-mes/detalhes-mes-modal.component');
    return this.present(DetalhesMesModalComponent, { ano, mes, valoresOcultos }, { cssClass: 'fullscreen-modal' } as any);
  }

  async graficoExpandido(chartType: 'line' | 'bar', title: string, ano: number) {
    const { ChartExpandModalComponent } = await import('../modals/chart-expand/chart-expand-modal.component');
    return this.present(ChartExpandModalComponent, { chartType, title, ano }, { cssClass: 'fullscreen-modal' } as any);
  }
}
