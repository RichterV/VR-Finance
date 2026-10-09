import { CurrencyPipe } from '@angular/common';
import { Component, ViewChild, computed, signal } from '@angular/core';
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

import { AuthService } from '../../core/auth.service';
import { HomeRefreshService } from '../../core/home-refresh.service';
import { ReceitasService } from '../../services/receitas.service';
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';

import { LaunchDateFieldComponent } from '../../shared/launch-date-field.component';
import { todayIso } from '../../shared/launch-date';
import { httpErrorMessage } from '../../shared/http-error';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { commitAttachments } from '../../shared/save-with-attachments';
import { RecurrenceFieldComponent } from '../../shared/recurrence-field.component';
import { isEndMonthValid } from '../../shared/recurrence';

@Component({
  selector: 'app-adicionar-receita-modal',
  templateUrl: './adicionar-receita-modal.component.html',
  styleUrls: ['./adicionar-receita-modal.component.scss'],
  imports: [
    AutofocusDirective,
    CurrencyInputDirective,
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
    AttachmentPickerComponent,
    LaunchDateFieldComponent,
    RecurrenceFieldComponent,
  ],
})
export class AdicionarReceitaModalComponent {
  @ViewChild(AttachmentPickerComponent) attachmentPicker!: AttachmentPickerComponent;

  /** Foto sendo processada / anexo subindo -- salvar agora gravaria o registro sem o anexo. */
  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly savedAny = signal(false);
  readonly savingDefault = signal(false);

  /** Padrão do usuário (botão "Usar como padrão"); 50% se ainda não carregou. */
  readonly defaultCashPercentage = computed(() => this.auth.currentUser()?.default_cash_percentage ?? 50);

  readonly form = this.fb.nonNullable.group({
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    cashPercentage: this.fb.nonNullable.control(this.defaultCashPercentage(), [
      Validators.min(0),
      Validators.max(100),
    ]),
    description: this.fb.nonNullable.control(''),
    date: this.fb.nonNullable.control(todayIso()),
    recorrente: this.fb.nonNullable.control(false),
    recorrenciaDia: this.fb.control<number | null>(null),
    recorrenciaFim: this.fb.control<string | null>(null),
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly isDefaultCashPercentage = computed(
    () => this.formValue().cashPercentage === this.defaultCashPercentage(),
  );

  readonly cashValue = computed(() => {
    const { value, cashPercentage } = this.formValue();
    return ((value ?? 0) * (cashPercentage ?? 0)) / 100;
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly receitasService: ReceitasService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
    private readonly homeRefresh: HomeRefreshService,
    private readonly auth: AuthService,
  ) {
    addIcons({ close });
  }

  saveDefaultCashPercentage(): void {
    const percentage = this.form.controls.cashPercentage.value;
    this.savingDefault.set(true);
    this.auth.updateDefaultCashPercentage(percentage).subscribe({
      next: async () => {
        this.savingDefault.set(false);
        const toast = await this.toastCtrl.create({
          message: `${percentage}% salvo como padrão.`,
          duration: 2000,
          color: 'success',
        });
        await toast.present();
      },
      error: async (err: unknown) => {
        this.savingDefault.set(false);
        const toast = await this.toastCtrl.create({
          message: httpErrorMessage(err, 'Erro ao salvar o padrão.'),
          duration: 2500,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  async submit(): Promise<void> {
    if (this.attachmentBusy) return;
    this.errorMessage.set(null);
    const { value, cashPercentage, description, date, recorrente, recorrenciaDia, recorrenciaFim } = this.form.getRawValue();

    if (!value) {
      this.errorMessage.set('Preencha o valor da receita.');
      return;
    }

    if (recorrente && recorrenciaFim && !isEndMonthValid(date, recorrenciaFim)) {
      this.errorMessage.set('O último mês da recorrência precisa ser depois do mês do lançamento.');
      return;
    }

    this.saving.set(true);
    this.receitasService
      .create({
        value,
        cash_percentage: cashPercentage,
        description: description || undefined,
        date,
        recorrente,
        recorrencia_dia: recorrente ? (recorrenciaDia ?? undefined) : undefined,
        recorrencia_fim: recorrente ? (recorrenciaFim ?? undefined) : undefined,
      })
      .subscribe({
        next: (receita) => {
          this.savedAny.set(true);
          // Atualiza a Home na hora (ela continua viva por baixo deste modal) -- nao espera
          // o usuario fechar o modal, que aqui fica aberto de proposito pra permitir salvar
          // varias receitas em sequencia.
          this.homeRefresh.request();
          void commitAttachments({
            commit: this.attachmentPicker.commit(receita.id),
            toastCtrl: this.toastCtrl,
            successMessage: recorrente ? 'Receita salva. Ela vai se repetir todo mês.' : 'Receita salva.',
            savedLabel: 'Receita salva',
          }).then(() => {
            this.saving.set(false);
            this.resetForm();
          });
        },
        error: async (err: unknown) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({
            message: httpErrorMessage(err, 'Erro ao salvar a receita.'),
            duration: 2500,
            color: 'danger',
          });
          await toast.present();
        },
      });
  }

  /** Depois de salvar: formulário limpo, % de caixa de volta ao padrão do usuário. */
  private resetForm(): void {
    this.form.reset({
      value: null,
      cashPercentage: this.defaultCashPercentage(),
      description: '',
      date: todayIso(),
      recorrente: false,
      recorrenciaDia: null,
      recorrenciaFim: null,
    });
    this.attachmentPicker.reset();
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }
}
