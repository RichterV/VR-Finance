import { Component, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, logOutOutline } from 'ionicons/icons';

import { AppLockService, LOCK_TIMEOUT_OPTIONS } from '../../core/app-lock.service';
import { AuthService } from '../../core/auth.service';
import { httpErrorMessage } from '../../shared/http-error';
import { CATEGORY_SELECT_POPOVER_OPTIONS } from '../../shared/select-popover';

function passwordsMatchValidator(newControlName: string, confirmControlName: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const newValue = group.get(newControlName)?.value;
    const confirmValue = group.get(confirmControlName)?.value;
    return newValue === confirmValue ? null : { passwordsMismatch: true };
  };
}

/**
 * Perfil = só a conta logada (dados, senha, sair). Criar/editar/excluir outras contas e habilitar
 * módulos fica no painel de Administração (/admin, só master).
 */
@Component({
  selector: 'app-perfil-modal',
  templateUrl: './perfil-modal.component.html',
  styles: [
    `
      .account-head {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--sp-1) 0 var(--sp-2);

        strong {
          font-size: var(--fs-lg);
          font-weight: 600;
        }

        span {
          font-size: var(--fs-sm);
          color: var(--app-text-secondary);
        }
      }

      .perfil-section {
        margin: var(--sp-6) 0 var(--sp-3);
        font-size: var(--fs-md);
        font-weight: 600;
      }

      .logout-btn {
        margin-top: var(--sp-6);
        font-weight: 600;
      }

      .lock-hint {
        display: block;
        margin: 8px 4px 0;
        font-size: var(--fs-xs);
        line-height: 1.45;
        color: var(--app-text-secondary);
      }
    `,
  ],
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonItem,
    IonInput,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonText,
  ],
})
export class PerfilModalComponent implements OnInit {
  readonly profileSaving = signal(false);
  readonly profileError = signal<string | null>(null);

  /** Bloqueio ao voltar pro app: só no APK, e só se o aparelho tiver digital/PIN/padrão. */
  readonly lockAvailable = signal(false);
  readonly lockTimeout = signal<number | null>(null);
  readonly lockOptions = LOCK_TIMEOUT_OPTIONS;
  readonly selectPopoverOptions = CATEGORY_SELECT_POPOVER_OPTIONS;

  readonly passwordSaving = signal(false);
  readonly passwordError = signal<string | null>(null);

  readonly profileForm = this.fb.nonNullable.group({
    username: this.fb.nonNullable.control('', Validators.required),
    firstName: this.fb.nonNullable.control('', Validators.required),
    lastName: this.fb.nonNullable.control('', Validators.required),
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: this.fb.nonNullable.control('', Validators.required),
      newPassword: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(6)]),
      confirmPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: passwordsMatchValidator('newPassword', 'confirmPassword') },
  );

  constructor(
    private readonly fb: FormBuilder,
    readonly auth: AuthService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
    private readonly appLock: AppLockService,
  ) {
    addIcons({ close, logOutOutline });
  }

  ngOnInit(): void {
    this.resetProfileForm();
    void this.loadLockSettings();
  }

  private async loadLockSettings(): Promise<void> {
    if (!this.appLock.isAvailable || !(await this.appLock.canAuthenticate())) return;
    this.lockTimeout.set(await this.appLock.getTimeoutMinutes());
    this.lockAvailable.set(true);
  }

  onLockTimeoutChange(minutes: number): void {
    this.lockTimeout.set(minutes);
    this.appLock.setTimeoutMinutes(minutes);
  }

  private resetProfileForm(): void {
    const user = this.auth.currentUser();
    this.profileForm.reset({
      username: user?.username ?? '',
      firstName: user?.first_name ?? '',
      lastName: user?.last_name ?? '',
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  logout(): void {
    this.modalCtrl.dismiss();
    this.auth.logout();
  }

  submitProfile(): void {
    this.profileError.set(null);
    const { username, firstName, lastName } = this.profileForm.getRawValue();
    if (!username.trim() || !firstName.trim() || !lastName.trim()) {
      this.profileError.set('Preencha usuário, nome e sobrenome.');
      return;
    }

    this.profileSaving.set(true);
    this.auth.updateProfile(username.trim(), firstName.trim(), lastName.trim()).subscribe({
      next: async () => {
        this.profileSaving.set(false);
        this.resetProfileForm();
        const toast = await this.toastCtrl.create({ message: 'Dados atualizados.', duration: 2000, color: 'success' });
        await toast.present();
      },
      error: (err) => {
        this.profileSaving.set(false);
        this.profileError.set(err?.status === 400 ? 'Esse nome de usuário já está em uso.' : httpErrorMessage(err, 'Erro ao salvar os dados.'));
      },
    });
  }

  async submitPasswordChange(): Promise<void> {
    this.passwordError.set(null);
    if (this.passwordForm.invalid) {
      this.passwordError.set(
        this.passwordForm.errors?.['passwordsMismatch']
          ? 'As senhas novas não coincidem.'
          : 'Preencha os campos corretamente (mínimo 6 caracteres).',
      );
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.passwordSaving.set(true);
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: async () => {
        this.passwordSaving.set(false);
        this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        const toast = await this.toastCtrl.create({ message: 'Senha atualizada.', duration: 2000, color: 'success' });
        await toast.present();
      },
      error: async (err: unknown) => {
        this.passwordSaving.set(false);
        this.passwordError.set(httpErrorMessage(err, 'Senha atual incorreta.'));
      },
    });
  }
}
