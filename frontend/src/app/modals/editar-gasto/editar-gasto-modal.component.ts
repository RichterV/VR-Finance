import { Component, Input, OnInit, signal } from '@angular/core';
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
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { DropdownOption, DropdownOptionsService, Priority } from '../../services/dropdown-options.service';
import { Gasto, GastosService } from '../../services/gastos.service';
import { formatCurrencyValue, parseCentsInput } from '../../shared/currency-mask';

@Component({
  selector: 'app-editar-gasto-modal',
  templateUrl: './editar-gasto-modal.component.html',
  styleUrls: ['./editar-gasto-modal.component.scss'],
  imports: [
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
    IonTextarea,
    IonText,
  ],
})
export class EditarGastoModalComponent implements OnInit {
  @Input({ required: true }) gasto!: Gasto;

  readonly items = signal<DropdownOption[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly valorDisplay = signal('');

  readonly form = this.fb.nonNullable.group({
    priority: this.fb.nonNullable.control<Priority>('essencial', Validators.required),
    itemId: this.fb.control<number | null>(null, Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    description: this.fb.nonNullable.control(''),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly dropdownService: DropdownOptionsService,
    private readonly gastosService: GastosService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.form.patchValue({
      priority: this.gasto.priority,
      itemId: this.gasto.item_id,
      value: this.gasto.value,
      description: this.gasto.description ?? '',
    });
    this.valorDisplay.set(formatCurrencyValue(this.gasto.value));
    this.loadItems(this.gasto.priority);
  }

  onPriorityChange(value: Priority): void {
    this.form.patchValue({ priority: value, itemId: null });
    this.loadItems(value);
  }

  private loadItems(priority: Priority): void {
    this.dropdownService.list(priority).subscribe((items) => this.items.set(items));
  }

  onValorInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.form.controls.value.setValue(reais);
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    const { priority, itemId, value, description } = this.form.getRawValue();

    if (!itemId || !value) {
      this.errorMessage.set('Preencha o item e o valor.');
      return;
    }

    this.saving.set(true);
    this.gastosService
      .update(this.gasto.id, { priority, item_id: itemId, value, description: description || undefined })
      .subscribe({
        next: async (updated) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Gasto atualizado.', duration: 2000, color: 'success' });
          await toast.present();
          this.modalCtrl.dismiss(updated, 'saved');
        },
        error: async () => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Erro ao atualizar o gasto.', duration: 2500, color: 'danger' });
          await toast.present();
        },
      });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
