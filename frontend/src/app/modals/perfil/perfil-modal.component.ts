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
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, logOutOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';

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
    IonText,
  ],
})
export class PerfilModalComponent implements OnInit {
  readonly profileSaving = signal(false);
  readonly profileError = signal<string | null>(null);

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
  ) {
    addIcons({ close, logOutOutline });
  }

  ngOnInit(): void {
    this.resetProfileForm();
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
        this.profileError.set(err?.status === 400 ? 'Esse nome de usuário já está em uso.' : 'Erro ao salvar os dados.');
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
      error: async () => {
        this.passwordSaving.set(false);
        this.passwordError.set('Senha atual incorreta.');
      },
    });
  }
}
