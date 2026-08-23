import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { create, trash } from 'ionicons/icons';
import { forkJoin } from 'rxjs';

import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { Gasto, GastosService } from '../../services/gastos.service';
import { Receita, ReceitasService } from '../../services/receitas.service';
import { LoadingStateComponent } from '../../shared/loading-state.component';
import { MESES_COMPLETOS } from '../../shared/months';
import { SortState, sortItems, toggleSortState, UNSORTED } from '../../shared/sortable';
import { SortThComponent } from '../../shared/sort-th.component';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const PAGE_SIZE = 25;

@Component({
  selector: 'app-dados',
  templateUrl: './dados.page.html',
  styleUrls: ['./dados.page.scss'],
  imports: [
    CurrencyPipe,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    SortThComponent,
    LoadingStateComponent,
  ],
})
export class DadosPage implements OnInit {
  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];

  readonly aba = signal<'gastos' | 'receitas'>('gastos');
  readonly mes = signal<number | null>(null);
  readonly ano = signal<number | null>(null);

  /** Verdadeiro até a primeira carga de gastos+receitas terminar. */
  readonly initialLoading = signal(true);

  readonly gastos = signal<Gasto[]>([]);
  readonly receitas = signal<Receita[]>([]);
  readonly totalGastos = signal(0);
  readonly totalReceitas = signal(0);

  readonly gastosSort = signal<SortState>(UNSORTED);
  readonly receitasSort = signal<SortState>(UNSORTED);

  readonly sortedGastos = computed(() =>
    sortItems(this.gastos(), this.gastosSort(), (g, column) => this.gastoSortValue(g, column)),
  );
  readonly sortedReceitas = computed(() =>
    sortItems(this.receitas(), this.receitasSort(), (r, column) => this.receitaSortValue(r, column)),
  );

  constructor(
    private readonly gastosService: GastosService,
    private readonly receitasService: ReceitasService,
    private readonly alertCtrl: AlertController,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ create, trash });
    const currentYear = new Date().getFullYear();
    this.anos = Array.from({ length: 6 }, (_, i) => currentYear - i);
  }

  ngOnInit(): void {
    this.reload();
  }

  onAbaChange(value: 'gastos' | 'receitas'): void {
    this.aba.set(value);
  }

  onMesChange(value: number | null): void {
    this.mes.set(value);
    this.reload();
  }

  onAnoChange(value: number | null): void {
    this.ano.set(value);
    this.reload();
  }

  private reload(): void {
    const params = { ano: this.ano() ?? undefined, mes: this.mes() ?? undefined };
    forkJoin([
      this.gastosService.list({ ...params, limit: PAGE_SIZE, offset: 0 }),
      this.receitasService.list({ ...params, limit: PAGE_SIZE, offset: 0 }),
    ]).subscribe(([gastosPage, receitasPage]) => {
      this.gastos.set(gastosPage.items);
      this.totalGastos.set(gastosPage.total);
      this.receitas.set(receitasPage.items);
      this.totalReceitas.set(receitasPage.total);
      this.initialLoading.set(false);
    });
  }

  carregarMaisGastos(): void {
    const params = { ano: this.ano() ?? undefined, mes: this.mes() ?? undefined, limit: PAGE_SIZE, offset: this.gastos().length };
    this.gastosService.list(params).subscribe((page) => {
      this.gastos.set([...this.gastos(), ...page.items]);
      this.totalGastos.set(page.total);
    });
  }

  carregarMaisReceitas(): void {
    const params = { ano: this.ano() ?? undefined, mes: this.mes() ?? undefined, limit: PAGE_SIZE, offset: this.receitas().length };
    this.receitasService.list(params).subscribe((page) => {
      this.receitas.set([...this.receitas(), ...page.items]);
      this.totalReceitas.set(page.total);
    });
  }

  private sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  async editarGasto(gasto: Gasto): Promise<void> {
    const { EditarGastoModalComponent } = await import('../../modals/editar-gasto/editar-gasto-modal.component');
    const modal = await this.modalCtrl.create({
      component: EditarGastoModalComponent,
      componentProps: { gasto },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
    }
  }

  async excluirGasto(gasto: Gasto): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Excluir gasto',
      message: `Remover o gasto "${gasto.item_name}" de ${formatBRL(gasto.value)}? Essa ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.gastosService.remove(gasto.id).subscribe(async () => {
              this.reload();
              const toast = await this.toastCtrl.create({ message: 'Gasto excluído.', duration: 2000, color: 'success' });
              await toast.present();
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async editarReceita(receita: Receita): Promise<void> {
    const { EditarReceitaModalComponent } = await import('../../modals/editar-receita/editar-receita-modal.component');
    const modal = await this.modalCtrl.create({
      component: EditarReceitaModalComponent,
      componentProps: { receita },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
    }
  }

  async excluirReceita(receita: Receita): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Excluir receita',
      message: `Remover a receita de ${formatBRL(receita.value)}? Essa ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.receitasService.remove(receita.id).subscribe(async () => {
              this.reload();
              const toast = await this.toastCtrl.create({ message: 'Receita excluída.', duration: 2000, color: 'success' });
              await toast.present();
            });
          },
        },
      ],
    });
    await alert.present();
  }

  toggleGastosSort(column: string): void {
    this.gastosSort.update((s) => toggleSortState(s, column));
  }

  toggleReceitasSort(column: string): void {
    this.receitasSort.update((s) => toggleSortState(s, column));
  }

  private gastoSortValue(gasto: Gasto, column: string): unknown {
    switch (column) {
      case 'date':
        return gasto.date;
      case 'priority':
        return gasto.priority;
      case 'item':
        return gasto.item_name;
      case 'value':
        return gasto.value;
      case 'installment':
        return gasto.is_installment ? gasto.installment_number : -1;
      case 'description':
        return gasto.description ?? '';
      default:
        return null;
    }
  }

  private receitaSortValue(receita: Receita, column: string): unknown {
    switch (column) {
      case 'date':
        return receita.date;
      case 'value':
        return receita.value;
      case 'cash_percentage':
        return receita.cash_percentage;
      case 'cash_value':
        return receita.cash_value;
      case 'description':
        return receita.description ?? '';
      default:
        return null;
    }
  }
}
