import { CurrencyPipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
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
  IonRange,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { ReceitasService } from '../../services/receitas.service';
import { formatCurrencyValue, parseCentsInput } from '../../shared/currency-mask';

@Component({
  selector: 'app-adicionar-receita-modal',
  templateUrl: './adicionar-receita-modal.component.html',
  styleUrls: ['./adicionar-receita-modal.component.scss'],
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonItem,
    IonInput,
    IonRange,
    IonTextarea,
    IonText,
  ],
})
export class AdicionarReceitaModalComponent {
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly valorDisplay = signal('');
  private readonly savedAny = signal(false);

  readonly form = this.fb.nonNullable.group({
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    cashPercentage: this.fb.nonNullable.control(50, [Validators.min(0), Validators.max(100)]),
    description: this.fb.nonNullable.control(''),
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly cashValue = computed(() => {
    const { value, cashPercentage } = this.formValue();
    return ((value ?? 0) * (cashPercentage ?? 0)) / 100;
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly receitasService: ReceitasService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  onValorInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.form.controls.value.setValue(reais);
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    const { value, cashPercentage, description } = this.form.getRawValue();

    if (!value) {
      this.errorMessage.set('Preencha o valor da receita.');
      return;
    }

    this.saving.set(true);
    this.receitasService
      .create({
        value,
        cash_percentage: cashPercentage,
        description: description || undefined,
      })
      .subscribe({
        next: async () => {
          this.saving.set(false);
          this.savedAny.set(true);
          const toast = await this.toastCtrl.create({
            message: 'Receita salva.',
            duration: 2000,
            color: 'success',
          });
          await toast.present();
          this.form.reset({ value: null, cashPercentage: 50, description: '' });
          this.valorDisplay.set('');
        },
        error: async () => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({
            message: 'Erro ao salvar a receita.',
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
}
