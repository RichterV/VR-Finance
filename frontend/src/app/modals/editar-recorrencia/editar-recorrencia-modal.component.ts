import { CurrencyPipe } from '@angular/common';
import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonRange,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { DropdownOption, DropdownOptionsService, Priority } from '../../services/dropdown-options.service';
import { Recorrencia, RecorrenciaUpdatePayload, RecorrenciasService } from '../../services/recorrencias.service';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { httpErrorMessage } from '../../shared/http-error';
import { MESES_COMPLETOS } from '../../shared/months';
import { RECURRENCE_DAYS } from '../../shared/recurrence';
import { CATEGORY_SELECT_POPOVER_OPTIONS } from '../../shared/select-popover';

/**
 * Editar uma recorrência (aberto pela aba Recorrências de Visualizar dados). Vale dos próximos
 * lançamentos em diante -- os que ela já criou não mudam.
 */
@Component({
  selector: 'app-editar-recorrencia-modal',
  templateUrl: './editar-recorrencia-modal.component.html',
  styleUrls: ['./editar-recorrencia-modal.component.scss'],
  imports: [
    CurrencyPipe,
    CurrencyInputDirective,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonRange,
    IonTextarea,
    IonToggle,
    IonText,
  ],
})
export class EditarRecorrenciaModalComponent implements OnInit {
  @Input({ required: true }) recorrencia!: Recorrencia;

  readonly categorySelectOptions = CATEGORY_SELECT_POPOVER_OPTIONS;
  readonly days = RECURRENCE_DAYS;
  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];
  private readonly hoje = new Date();

  readonly items = signal<DropdownOption[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    priority: this.fb.nonNullable.control<Priority>('essencial'),
    itemId: this.fb.control<number | null>(null),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    cashPercentage: this.fb.nonNullable.control(50),
    description: this.fb.nonNullable.control(''),
    dia: this.fb.nonNullable.control(1),
    temFim: this.fb.nonNullable.control(false),
    fimMes: this.fb.nonNullable.control(this.hoje.getMonth() + 1),
    fimAno: this.fb.nonNullable.control(this.hoje.getFullYear()),
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly cashValue = computed(() => {
    const { value, cashPercentage } = this.formValue();
    return ((value ?? 0) * (cashPercentage ?? 0)) / 100;
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly dropdownService: DropdownOptionsService,
    private readonly recorrenciasService: RecorrenciasService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
    const ano = this.hoje.getFullYear();
    this.anos = Array.from({ length: 6 }, (_, i) => ano + i);
  }

  get isGasto(): boolean {
    return this.recorrencia.tipo === 'gasto';
  }

  ngOnInit(): void {
    const rec = this.recorrencia;
    const [fimAno, fimMes] = rec.fim_mes ? rec.fim_mes.split('-').map(Number) : [];
    this.form.patchValue({
      priority: rec.priority ?? 'essencial',
      itemId: rec.item_id,
      value: rec.value,
      cashPercentage: rec.cash_percentage ?? 50,
      description: rec.description ?? '',
      dia: rec.dia,
      temFim: !!rec.fim_mes,
      fimMes: fimMes ?? this.hoje.getMonth() + 1,
      fimAno: fimAno ?? this.hoje.getFullYear(),
    });
    if (this.isGasto) this.loadItems(this.form.getRawValue().priority);
  }

  onPriorityChange(value: Priority): void {
    this.form.patchValue({ priority: value, itemId: null });
    this.loadItems(value);
  }

  private loadItems(priority: Priority): void {
    this.dropdownService.list(priority).subscribe((items) => {
      // Categoria excluída continua valendo enquanto não for trocada -- aparece marcada no select.
      const rec = this.recorrencia;
      const atual = rec.item_active === false && rec.priority === priority && rec.item_id !== null;
      this.items.set(
        atual
          ? [{ id: rec.item_id!, name: `${rec.item_name} (excluída)`, priority, active: false, include_in_inflation: false }, ...items]
          : items,
      );
    });
  }

  submit(): void {
    if (this.saving()) return;
    this.errorMessage.set(null);
    const { priority, itemId, value, cashPercentage, description, dia, temFim, fimMes, fimAno } = this.form.getRawValue();

    if (!value || (this.isGasto && !itemId)) {
      this.errorMessage.set(this.isGasto ? 'Preencha a categoria e o valor.' : 'Preencha o valor.');
      return;
    }
    if (temFim && (fimAno < this.hoje.getFullYear() || (fimAno === this.hoje.getFullYear() && fimMes < this.hoje.getMonth() + 1))) {
      this.errorMessage.set('O último mês não pode ser anterior ao mês atual.');
      return;
    }

    const payload: RecorrenciaUpdatePayload = {
      value,
      description: description || null,
      dia,
      fim_mes: temFim ? `${fimAno}-${String(fimMes).padStart(2, '0')}-01` : null,
      ...(this.isGasto ? { priority, item_id: itemId } : { cash_percentage: cashPercentage }),
    };

    this.saving.set(true);
    this.recorrenciasService.update(this.recorrencia.id, payload).subscribe({
      next: async (updated) => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({
          message: 'Recorrência atualizada. Vale a partir do próximo lançamento.',
          duration: 2500,
          color: 'success',
        });
        await toast.present();
        this.modalCtrl.dismiss(updated, 'saved');
      },
      error: async (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(httpErrorMessage(err, 'Erro ao atualizar a recorrência.'));
      },
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
