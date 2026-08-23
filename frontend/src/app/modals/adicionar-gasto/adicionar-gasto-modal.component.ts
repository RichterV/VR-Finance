import { Component, OnInit, signal } from '@angular/core';
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
  IonToggle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { DropdownOption, DropdownOptionsService, Priority } from '../../services/dropdown-options.service';
import { GastosService } from '../../services/gastos.service';
import { formatCurrencyValue, parseCentsInput } from '../../shared/currency-mask';

@Component({
  selector: 'app-adicionar-gasto-modal',
  templateUrl: './adicionar-gasto-modal.component.html',
  styleUrls: ['./adicionar-gasto-modal.component.scss'],
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
    IonToggle,
    IonTextarea,
    IonText,
  ],
})
export class AdicionarGastoModalComponent implements OnInit {
  readonly items = signal<DropdownOption[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly valorDisplay = signal('');
  private readonly savedAny = signal(false);

  readonly form = this.fb.nonNullable.group({
    priority: this.fb.nonNullable.control<Priority>('essencial', Validators.required),
    itemId: this.fb.control<number | null>(null, Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    description: this.fb.nonNullable.control(''),
    isInstallment: this.fb.nonNullable.control(false),
    installmentCount: this.fb.control<number | null>(null),
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
    this.loadItems('essencial');
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
    const { priority, itemId, value, description, isInstallment, installmentCount } = this.form.getRawValue();

    if (!itemId || !value) {
      this.errorMessage.set('Preencha o item e o valor.');
      return;
    }

    if (isInstallment && (!installmentCount || installmentCount < 2)) {
      this.errorMessage.set('Informe o número de parcelas (mínimo 2).');
      return;
    }

    this.saving.set(true);
    this.gastosService
      .create({
        priority,
        item_id: itemId,
        value,
        description: description || undefined,
        is_installment: isInstallment,
        installment_count: isInstallment ? installmentCount! : undefined,
      })
      .subscribe({
        next: async (rows) => {
          this.saving.set(false);
          this.savedAny.set(true);
          const toast = await this.toastCtrl.create({
            message: isInstallment ? `Gasto parcelado em ${rows.length}x salvo.` : 'Gasto salvo.',
            duration: 2000,
            color: 'success',
          });
          await toast.present();
          this.resetForm();
        },
        error: async () => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({
            message: 'Erro ao salvar o gasto.',
            duration: 2500,
            color: 'danger',
          });
          await toast.present();
        },
      });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }

  private resetForm(): void {
    const priority = this.form.getRawValue().priority;
    this.form.reset({
      priority,
      itemId: null,
      value: null,
      description: '',
      isInstallment: false,
      installmentCount: null,
    });
    this.valorDisplay.set('');
  }
}
