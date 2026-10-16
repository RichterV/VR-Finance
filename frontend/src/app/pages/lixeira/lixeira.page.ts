import { Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowUndoOutline, documentAttachOutline, eyeOutline, trashBinOutline, trashOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { HomeRefreshService } from '../../core/home-refresh.service';
import { formatCurrencyValue } from '../../shared/currency-mask';
import { attachmentFormatLabel } from '../../shared/attachment-types';
import { httpErrorMessage } from '../../shared/http-error';
import { UndoDeleteService } from '../../shared/undo-delete.service';
import { Attachment } from '../../services/attachments.service';
import { LixeiraAnexo, LixeiraItem, LixeiraService } from '../../services/lixeira.service';
import { excluidoTexto, expiraTexto, tipoLabel } from './lixeira.utils';

/**
 * Lixeira: o que foi excluído nos últimos 15 dias (registros com os anexos que saíram junto, e
 * anexos excluídos sozinhos). Restaurar devolve ao lugar; "Excluir de vez" e "Esvaziar" apagam na
 * hora. Depois de 15 dias o backend apaga sozinho.
 */
@Component({
  selector: 'app-lixeira',
  templateUrl: './lixeira.page.html',
  styleUrls: ['./lixeira.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonContent,
    IonIcon,
    IonSpinner,
    IonSelect,
    IonSelectOption,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class LixeiraPage {
  readonly items = signal<LixeiraItem[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  /** Item com uma ação em andamento (restaurar/excluir) -- trava os botões dele. */
  readonly busyId = signal<number | null>(null);
  readonly emptying = signal(false);
  /** null = todos os tipos. */
  readonly tipoFiltro = signal<string | null>(null);

  readonly tipos = computed(() => [...new Set(this.items().map((i) => i.entity_type))].sort((a, b) => tipoLabel(a).localeCompare(tipoLabel(b))));
  readonly visiveis = computed(() => {
    const tipo = this.tipoFiltro();
    return tipo ? this.items().filter((i) => i.entity_type === tipo) : this.items();
  });

  readonly tipoLabel = tipoLabel;
  readonly formatLabel = attachmentFormatLabel;

  constructor(
    private readonly lixeiraService: LixeiraService,
    private readonly homeRefresh: HomeRefreshService,
    private readonly alertCtrl: AlertController,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
    private readonly undoDelete: UndoDeleteService,
  ) {
    addIcons({ arrowUndoOutline, trashOutline, trashBinOutline, eyeOutline, documentAttachOutline });
  }

  /** O ion-router-outlet guarda a página em cache: recarrega toda vez que ela aparece. */
  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      // Exclusão feita logo antes de abrir a Lixeira pode estar na janela do "Desfazer" ou com o
      // DELETE ainda no ar: confirma e espera, senão o item só apareceria depois de atualizar.
      await this.undoDelete.settle();
      const items = await firstValueFrom(this.lixeiraService.list());
      this.items.set(items);
      const filtro = this.tipoFiltro();
      if (filtro && !items.some((i) => i.entity_type === filtro)) this.tipoFiltro.set(null);
    } catch (err) {
      this.errorMessage.set(httpErrorMessage(err, 'Não foi possível carregar a lixeira.'));
    } finally {
      this.loading.set(false);
    }
  }

  async onRefresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as HTMLIonRefresherElement).complete();
  }

  onTipoChange(value: string | null): void {
    this.tipoFiltro.set(value || null);
  }

  valor(item: LixeiraItem): string | null {
    return item.valor === null ? null : `R$ ${formatCurrencyValue(item.valor)}`;
  }

  /** Linha de baixo, em partes que quebram inteiras: de onde era · data do registro · quando foi excluído. */
  metaParts(item: LixeiraItem): string[] {
    const contexto =
      item.tipo === 'anexo'
        ? [tipoLabel(item.entity_type), item.detalhe].filter(Boolean).join(': ')
        : item.detalhe;
    const data = item.data_registro ? item.data_registro.split('-').reverse().join('/') : null;
    return [contexto, data, excluidoTexto(item.deleted_at)].filter((p): p is string => !!p);
  }

  /** Faltando 2 dias ou menos, o "some em" fica em destaque. */
  expiraPerto(item: LixeiraItem): boolean {
    return new Date(item.expira_em).getTime() - Date.now() <= 2 * 24 * 60 * 60 * 1000;
  }

  expira(item: LixeiraItem): string {
    return expiraTexto(item.expira_em);
  }

  /** Nome do que vai ser restaurado, pros toasts e alertas. */
  private nome(item: LixeiraItem): string {
    return item.tipo === 'anexo' ? `o anexo "${item.titulo}"` : `"${item.titulo}"`;
  }

  async restaurar(item: LixeiraItem): Promise<void> {
    if (this.busyId() !== null) return;
    this.busyId.set(item.id);
    try {
      await firstValueFrom(this.lixeiraService.restore(item.id));
      this.items.update((list) => list.filter((i) => i.id !== item.id));
      this.afterRestore(item);
      await this.toast(`${item.tipo === 'anexo' ? 'Anexo' : tipoLabel(item.entity_type)} restaurado`, 'success');
    } catch (err) {
      await this.toast(httpErrorMessage(err, 'Não foi possível restaurar.'), 'danger');
    } finally {
      this.busyId.set(null);
    }
  }

  async excluirDeVez(item: LixeiraItem): Promise<void> {
    if (this.busyId() !== null) return;
    const anexos = item.tipo === 'registro' && item.anexos.length > 0;
    const alert = await this.alertCtrl.create({
      header: 'Excluir de vez?',
      message: `${this.nome(item)}${anexos ? ' e os anexos dele' : ''} vai sumir agora, sem como recuperar.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Excluir de vez', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') return;

    this.busyId.set(item.id);
    try {
      await firstValueFrom(this.lixeiraService.delete(item.id));
      this.items.update((list) => list.filter((i) => i.id !== item.id));
    } catch (err) {
      await this.toast(httpErrorMessage(err, 'Não foi possível excluir.'), 'danger');
    } finally {
      this.busyId.set(null);
    }
  }

  async esvaziar(): Promise<void> {
    const total = this.items().length;
    if (total === 0 || this.emptying()) return;
    const alert = await this.alertCtrl.create({
      header: 'Esvaziar a lixeira?',
      message: `${total === 1 ? 'O item' : `Os ${total} itens`} e os anexos vão sumir agora, sem como recuperar.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Esvaziar', role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') return;

    this.emptying.set(true);
    try {
      await firstValueFrom(this.lixeiraService.empty());
      this.items.set([]);
      this.tipoFiltro.set(null);
    } catch (err) {
      await this.toast(httpErrorMessage(err, 'Não foi possível esvaziar a lixeira.'), 'danger');
    } finally {
      this.emptying.set(false);
    }
  }

  async preview(anexo: LixeiraAnexo): Promise<void> {
    const { AttachmentPreviewModalComponent } = await import(
      '../../modals/attachment-preview/attachment-preview-modal.component'
    );
    const file: Attachment = {
      id: anexo.id,
      entity_type: 'gasto',
      entity_id: '',
      original_filename: anexo.original_filename,
      content_type: anexo.content_type,
      size_bytes: anexo.size_bytes,
      created_at: '',
    };
    const modal = await this.modalCtrl.create({
      component: AttachmentPreviewModalComponent,
      componentProps: { file, loadBlob: () => this.lixeiraService.downloadAnexo(anexo.id) },
      cssClass: 'fullscreen-modal',
    });
    await modal.present();
  }

  /** O que foi restaurado volta a contar: Home recarrega; badge de Devedores atualiza. */
  private afterRestore(item: LixeiraItem): void {
    this.homeRefresh.request();
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, color, duration: 2500, position: 'bottom' });
    await toast.present();
  }
}
