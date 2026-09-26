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
import { extractHttpErrorMessage } from '../../shared/attachment-types';
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
    AttachmentPickerComponent,
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
  readonly valorDisplay = signal('');
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

  onValorInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.form.controls.value.setValue(reais);
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
      error: async () => {
        this.savingDefault.set(false);
        const toast = await this.toastCtrl.create({
          message: 'Erro ao salvar o padrão.',
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
        next: (receita) => {
          this.savedAny.set(true);
          // Atualiza a Home na hora (ela continua viva por baixo deste modal) -- nao espera
          // o usuario fechar o modal, que aqui fica aberto de proposito pra permitir salvar
          // varias receitas em sequencia.
          this.homeRefresh.request();
          this.attachmentPicker.commit(receita.id).subscribe({
            next: async () => {
              this.saving.set(false);
              const toast = await this.toastCtrl.create({
                message: 'Receita salva.',
                duration: 2000,
                color: 'success',
              });
              await toast.present();
              this.form.reset({ value: null, cashPercentage: this.defaultCashPercentage(), description: '' });
              this.valorDisplay.set('');
              this.attachmentPicker.reset();
            },
            error: async (err) => {
              this.saving.set(false);
              console.error('Erro ao enviar anexos da receita', err);
              const toast = await this.toastCtrl.create({
                message: `Receita salva, mas houve erro ao enviar os anexos: ${extractHttpErrorMessage(err)}`,
                duration: 4000,
                color: 'warning',
              });
              await toast.present();
              this.form.reset({ value: null, cashPercentage: this.defaultCashPercentage(), description: '' });
              this.valorDisplay.set('');
              this.attachmentPicker.reset();
            },
          });
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
