import { Component, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, IonItem, IonText } from '@ionic/angular';

import { AuthService } from '../../core/auth.service';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirmPassword')?.value ? null : { passwordsMismatch: true };
}

/**
 * Troca obrigatória de senha: aparece no primeiro login de uma conta criada pelo master, e depois
 * de o master resetar a senha de alguém (em ambos os casos o master conhece a senha). O backend
 * responde 403 em tudo, menos /auth/me e /auth/me/password, até a troca ser feita.
 */
@Component({
  selector: 'app-trocar-senha',
  templateUrl: './trocar-senha.page.html',
  styleUrls: ['../login/login.page.scss', './trocar-senha.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText],
})
export class TrocarSenhaPage {
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: this.fb.nonNullable.control('', Validators.required),
      newPassword: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(6)]),
      confirmPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: passwordsMatchValidator },
  );

  constructor(
    private readonly fb: FormBuilder,
    readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.errorMessage.set(
        this.form.errors?.['passwordsMismatch']
          ? 'As senhas novas não coincidem.'
          : 'Preencha os campos corretamente (nova senha com mínimo 6 caracteres).',
      );
      return;
    }

    const { currentPassword, newPassword } = this.form.getRawValue();
    this.saving.set(true);
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        this.router.navigateByUrl('/home');
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.detail ?? 'Erro ao trocar a senha.');
      },
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
