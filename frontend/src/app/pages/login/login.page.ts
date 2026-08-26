import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { IonCheckbox, IonContent, IonItem, IonInput, IonButton, IonText } from '@ionic/angular';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { timeout } from 'rxjs';

import { AuthService } from '../../core/auth.service';

const LOGIN_TIMEOUT_MS = 15000;
const CREDENTIALS_KEY = 'login_credentials';
/** Chave antiga (texto puro, pre-Secure Storage) -- removida se ainda existir, pra nao deixar senha em texto puro no dispositivo. */
const LEGACY_CREDENTIALS_KEY = 'vrfinance_saved_credentials';

interface SavedCredentials {
  username: string;
  password: string;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText, IonCheckbox],
})
export class LoginPage {
  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lembrarCredenciais = signal(false);

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
  ) {}

  /**
   * O ion-router-outlet mantem a pagina de login viva em cache (pra animacao de voltar) em vez de
   * recria-la -- sem isso, um logout reexibe a mesma instancia com o estado (loading, erro, campos)
   * de antes da ultima tentativa de login.
   */
  ionViewWillEnter(): void {
    this.loading.set(false);
    this.errorMessage.set(null);
    localStorage.removeItem(LEGACY_CREDENTIALS_KEY);
    this.readSavedCredentials().then((saved) => {
      this.form.reset({ username: saved?.username ?? '', password: saved?.password ?? '' });
      this.lembrarCredenciais.set(!!saved);
    });
  }

  submit(): void {
    if (this.form.invalid || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const { username, password } = this.form.getRawValue();

    this.auth
      .login(username, password)
      .pipe(timeout(LOGIN_TIMEOUT_MS))
      .subscribe({
        next: () => {
          this.auth
            .loadCurrentUser()
            .pipe(timeout(LOGIN_TIMEOUT_MS))
            .subscribe({
              next: () => {
                void this.saveOrClearCredentials(username, password).then(() => {
                  // Navegação "dura" (não via Router) -- garante um boot novo da SPA, sem nenhum
                  // estado (signals, instâncias de página cacheadas pelo IonicRouteStrategy) que
                  // possa ter sobrado de uma conta anterior nesta mesma aba/app (ex: depois de sair
                  // da conta "teste" sem passar pelo reload que "Mudar pra conta teste" já faz).
                  window.location.href = '/home';
                });
              },
              error: (err: unknown) => {
                this.errorMessage.set(this.describeError(err));
                this.loading.set(false);
              },
            });
        },
        error: (err: unknown) => {
          this.errorMessage.set(this.describeError(err));
          this.loading.set(false);
        },
      });
  }

  /**
   * No Android/iOS isso grava no Keystore/Keychain nativo (criptografado); no navegador desktop, o
   * proprio plugin cai de volta pra um localStorage sem criptografia (nao ha keychain de SO na web).
   */
  private async saveOrClearCredentials(username: string, password: string): Promise<void> {
    try {
      if (this.lembrarCredenciais()) {
        await SecureStorage.set(CREDENTIALS_KEY, { username, password } satisfies SavedCredentials);
      } else {
        await SecureStorage.remove(CREDENTIALS_KEY);
      }
    } catch {
      // Falha ao acessar o storage seguro nao deve travar o login -- só significa que a credencial
      // não vai ser lembrada da próxima vez.
    }
  }

  private async readSavedCredentials(): Promise<SavedCredentials | null> {
    try {
      const data = await SecureStorage.get(CREDENTIALS_KEY);
      return (data as SavedCredentials | null) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Diferencia credencial invalida (401) de servidor fora do ar/travado (status 0 ou timeout do
   * rxjs) -- antes qualquer falha, inclusive um backend travado sem nunca responder, caia no mesmo
   * "Usuário ou senha inválidos", mascarando problemas de infraestrutura como erro de digitação.
   */
  private describeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Usuário ou senha inválidos';
      }
      if (err.status === 0) {
        return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
      }
      if (err.status >= 500) {
        return 'Servidor indisponível no momento. Tente novamente em alguns instantes.';
      }
      return `Erro ao entrar (código ${err.status}). Tente novamente.`;
    }
    return 'O servidor demorou demais para responder. Tente novamente em alguns instantes.';
  }
}
