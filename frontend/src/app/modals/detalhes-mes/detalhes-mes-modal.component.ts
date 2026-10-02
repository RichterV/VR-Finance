import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { Gasto, GastosService } from '../../services/gastos.service';
import { Receita, ReceitasService } from '../../services/receitas.service';
import { MESES_COMPLETOS } from '../../shared/months';
import { SortOption, SortState, sortItems, toggleSortState } from '../../shared/sortable';
import { SortSelectComponent } from '../../shared/sort-select.component';
import { SortThComponent } from '../../shared/sort-th.component';
import { PrioDotComponent } from '../../shared/prio-dot.component';

const LIMITE_ITENS = 200;

@Component({
  selector: 'app-detalhes-mes-modal',
  templateUrl: './detalhes-mes-modal.component.html',
  styleUrls: ['./detalhes-mes-modal.component.scss'],
  imports: [PrioDotComponent, CurrencyPipe, DatePipe, IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent, SortThComponent, SortSelectComponent],
})
export class DetalhesMesModalComponent implements OnInit {
  @Input({ required: true }) ano!: number;
  @Input({ required: true }) mes!: number;

  readonly gastos = signal<Gasto[]>([]);
  readonly receitas = signal<Receita[]>([]);
  readonly top3GastoIds = signal<ReadonlySet<number>>(new Set());

  readonly gastosSort = signal<SortState>({ column: 'value', direction: 'desc' });
  readonly receitasSort = signal<SortState>({ column: 'value', direction: 'desc' });

  // Sem opção "padrão": aqui a ordem inicial já é maior valor primeiro.
  readonly gastosSortOptions: readonly SortOption[] = [
    { value: 'value:desc', label: 'Maior valor' },
    { value: 'value:asc', label: 'Menor valor' },
    { value: 'date:desc', label: 'Mais recentes' },
    { value: 'date:asc', label: 'Mais antigos' },
    { value: 'item:asc', label: 'Categoria (A–Z)' },
  ];
  readonly receitasSortOptions: readonly SortOption[] = [
    { value: 'value:desc', label: 'Maior valor' },
    { value: 'value:asc', label: 'Menor valor' },
    { value: 'date:desc', label: 'Mais recentes' },
    { value: 'date:asc', label: 'Mais antigas' },
  ];

  readonly sortedGastos = computed(() =>
    sortItems(this.gastos(), this.gastosSort(), (g, column) => this.gastoSortValue(g, column)),
  );
  readonly sortedReceitas = computed(() =>
    sortItems(this.receitas(), this.receitasSort(), (r, column) => this.receitaSortValue(r, column)),
  );

  constructor(
    private readonly gastosService: GastosService,
    private readonly receitasService: ReceitasService,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  get tituloPeriodo(): string {
    return `${MESES_COMPLETOS[this.mes - 1]} de ${this.ano}`;
  }

  ngOnInit(): void {
    const params = { ano: this.ano, mes: this.mes, limit: LIMITE_ITENS };
    this.gastosService.list(params).subscribe((page) => {
      const ordenados = [...page.items].sort((a, b) => b.value - a.value);
      this.gastos.set(ordenados);
      this.top3GastoIds.set(new Set(ordenados.slice(0, 3).map((g) => g.id)));
    });
    this.receitasService.list(params).subscribe((page) => {
      this.receitas.set([...page.items].sort((a, b) => b.value - a.value));
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
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
