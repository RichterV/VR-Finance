import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { AlertController, IonIcon, ModalController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, pauseOutline, playOutline, repeatOutline, trashOutline } from 'ionicons/icons';
import { Observable } from 'rxjs';

import { HomeRefreshService } from '../../core/home-refresh.service';
import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { Recorrencia, RecorrenciasService } from '../../services/recorrencias.service';
import { httpErrorMessage } from '../../shared/http-error';
import { LoadingStateComponent } from '../../shared/loading-state.component';
import { MESES_COMPLETOS } from '../../shared/months';
import { PrioDotComponent } from '../../shared/prio-dot.component';
import { formatIsoBr } from '../../shared/recurrence';

const STATUS_LABEL: Record<Recorrencia['status'], string> = {
  ativa: 'Ativa',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
};

/**
 * Aba "Recorrências" de Visualizar dados: gastos e receitas que se repetem todo mês, com editar,
 * pausar/retomar e excluir. Os lançamentos que cada uma já criou ficam nas abas Gastos/Receitas.
 */
@Component({
  selector: 'app-recorrencias-list',
  templateUrl: './recorrencias-list.component.html',
  styleUrls: ['./recorrencias-list.component.scss'],
  imports: [CurrencyPipe, DatePipe, IonIcon, LoadingStateComponent, PrioDotComponent],
})
export class RecorrenciasListComponent implements OnInit {
  private readonly service = inject(RecorrenciasService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);
  private readonly homeRefresh = inject(HomeRefreshService);

  /** Alguma ação pode ter criado ou apagado lançamentos (retomar, editar, excluir). */
  readonly changed = output<void>();

  readonly items = signal<Recorrencia[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly busyId = signal<number | null>(null);

  readonly statusLabel = STATUS_LABEL;

  /** Quanto as ativas somam por mês -- gastos e receitas separados. */
  readonly totais = computed(() => {
    const ativas = this.items().filter((r) => r.status === 'ativa');
    const soma = (tipo: Recorrencia['tipo']) =>
      ativas.filter((r) => r.tipo === tipo).reduce((acc, r) => acc + r.value, 0);
    return { gastos: soma('gasto'), receitas: soma('receita'), ativas: ativas.length };
  });

  constructor() {
    addIcons({ createOutline, trashOutline, pauseOutline, playOutline, repeatOutline });
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.error.set(false);
    this.service.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  titulo(rec: Recorrencia): string {
    if (rec.tipo === 'gasto') return rec.item_name ?? 'Gasto';
    return rec.description || 'Receita';
  }

  /** Descrição só aparece à parte no gasto (na receita ela já é o título). */
  detalhe(rec: Recorrencia): string | null {
    return rec.tipo === 'gasto' ? rec.description : null;
  }

  fimLabel(rec: Recorrencia): string | null {
    if (!rec.fim_mes) return null;
    const [ano, mes] = rec.fim_mes.split('-').map(Number);
    return `${MESES_COMPLETOS[mes - 1]}/${ano}`;
  }

  async editar(rec: Recorrencia): Promise<void> {
    const { EditarRecorrenciaModalComponent } = await import(
      '../../modals/editar-recorrencia/editar-recorrencia-modal.component'
    );
    const modal = await this.modalCtrl.create({
      component: EditarRecorrenciaModalComponent,
      componentProps: { recorrencia: rec },
      ...(isDesktopViewport()
        ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
        : {}),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') this.afterChange();
  }

  alternarPausa(rec: Recorrencia): void {
    const pausar = rec.status === 'ativa';
    this.run(
      rec,
      pausar ? this.service.pausar(rec.id) : this.service.retomar(rec.id),
      pausar ? 'Recorrência pausada.' : 'Recorrência retomada.',
    );
  }

  async excluir(rec: Recorrencia): Promise<void> {
    const pendente = rec.lancamento_pendente_data;
    const alert = await this.alertCtrl.create({
      header: 'Excluir recorrência',
      message: pendente
        ? `"${this.titulo(rec)}" para de se repetir. O lançamento de ${formatIsoBr(pendente)} já foi criado. Apagar ele também?`
        : `"${this.titulo(rec)}" para de se repetir. Os lançamentos já criados continuam em ${rec.tipo === 'gasto' ? 'Gastos' : 'Receitas'}.`,
      buttons: pendente
        ? [
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Manter o lançamento', handler: () => this.remove(rec, false) },
            { text: 'Apagar também', role: 'destructive', handler: () => this.remove(rec, true) },
          ]
        : [
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Excluir', role: 'destructive', handler: () => this.remove(rec, false) },
          ],
    });
    await alert.present();
  }

  private remove(rec: Recorrencia, apagarPendentes: boolean): void {
    this.run(rec, this.service.delete(rec.id, apagarPendentes), 'Recorrência excluída.');
  }

  private run(rec: Recorrencia, request: Observable<unknown>, message: string): void {
    this.busyId.set(rec.id);
    request.subscribe({
      next: async () => {
        this.busyId.set(null);
        this.afterChange();
        const toast = await this.toastCtrl.create({ message, duration: 2000, color: 'success' });
        await toast.present();
      },
      error: async (err: unknown) => {
        this.busyId.set(null);
        const toast = await this.toastCtrl.create({
          message: httpErrorMessage(err, 'Não foi possível concluir a ação.'),
          duration: 2500,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  private afterChange(): void {
    this.reload();
    this.changed.emit();
    this.homeRefresh.request();
  }
}
