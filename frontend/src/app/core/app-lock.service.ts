import { Injectable, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { consumeExpectedExit } from './expected-exit';
import { NativeLockBridge } from './native-lock-bridge';

/** Minutos fora do app até pedir a digital de novo; LOCK_DISABLED = nunca. */
export const LOCK_DISABLED = -1;
export const LOCK_TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Imediatamente' },
  { value: 1, label: 'Após 1 minuto' },
  { value: 5, label: 'Após 5 minutos' },
  { value: 15, label: 'Após 15 minutos' },
  { value: LOCK_DISABLED, label: 'Nunca' },
];
/** Padrão pra quem já usa login por digital e nunca escolheu um tempo no Perfil. */
export const DEFAULT_LOCK_MINUTES = 5;
/** Preferência por aparelho (não por conta) -- não precisa ir pro backend. */
export const LOCK_TIMEOUT_STORAGE_KEY = 'app_lock_timeout_min';
/**
 * Saída "de propósito" (câmera, seletor de arquivo, compartilhar -- ver core/expected-exit.ts) não
 * pede digital na volta. Mas se a pessoa aproveitar e ficar mais que isso fora, bloqueia.
 */
export const EXPECTED_EXIT_MAX_MS = 10 * 60 * 1000;

/**
 * Bloqueio ao voltar pro app (só no APK): depois de X minutos em segundo plano, uma tela por cima de
 * tudo (AppLockOverlayComponent) pede a digital. É uma camada local -- o token continua valendo.
 */
@Injectable({ providedIn: 'root' })
export class AppLockService {
  readonly locked = signal(false);
  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private initialized = false;
  private backgroundedAt: number | null = null;

  constructor(
    private readonly bridge: NativeLockBridge,
    private readonly auth: AuthService,
  ) {}

  get isAvailable(): boolean {
    return this.bridge.isNative();
  }

  async init(): Promise<void> {
    if (this.initialized || !this.bridge.isNative()) return;
    this.initialized = true;
    this.bridge.onAppStateChange((isActive) => (isActive ? void this.onForeground() : this.onBackground()));
    // Abertura a frio com token salvo: o Android costuma matar o processo depois de um tempo em
    // segundo plano, e o authGuard deixaria entrar direto -- conta como "tempo infinito fora".
    if (this.auth.token && (await this.getTimeoutMinutes()) !== LOCK_DISABLED) {
      this.lock();
    }
  }

  async getTimeoutMinutes(): Promise<number> {
    const stored = readStoredTimeout();
    if (stored !== null) return stored;
    return (await this.bridge.isBiometricLoginEnabled()) ? DEFAULT_LOCK_MINUTES : LOCK_DISABLED;
  }

  setTimeoutMinutes(minutes: number): void {
    try {
      localStorage.setItem(LOCK_TIMEOUT_STORAGE_KEY, String(minutes));
    } catch {
      // Storage indisponível: fica valendo o padrão.
    }
  }

  canAuthenticate(): Promise<boolean> {
    return this.bridge.canAuthenticate();
  }

  async unlock(): Promise<void> {
    if (this.busy() || !this.locked()) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      if ((await this.bridge.authenticate()) === 'ok') {
        this.locked.set(false);
      }
    } catch {
      this.errorMessage.set('Não foi possível verificar sua identidade. Tente de novo ou entre com usuário e senha.');
    } finally {
      this.busy.set(false);
    }
  }

  logoutFromLock(): void {
    this.locked.set(false);
    this.errorMessage.set(null);
    this.auth.logout();
  }

  minimizeApp(): void {
    this.bridge.minimizeApp();
  }

  private lock(): void {
    this.locked.set(true);
    void this.unlock();
  }

  private onBackground(): void {
    this.backgroundedAt = Date.now();
  }

  private async onForeground(): Promise<void> {
    const since = this.backgroundedAt;
    const expectedAt = consumeExpectedExit();
    this.backgroundedAt = null;
    if (since === null || this.locked() || !this.auth.token) return;

    const now = Date.now();
    if (expectedAt !== null && now - expectedAt <= EXPECTED_EXIT_MAX_MS) return;

    const timeout = await this.getTimeoutMinutes();
    if (timeout !== LOCK_DISABLED && now - since >= timeout * 60_000) {
      this.lock();
    }
  }
}

function readStoredTimeout(): number | null {
  try {
    const raw = localStorage.getItem(LOCK_TIMEOUT_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return LOCK_TIMEOUT_OPTIONS.some((o) => o.value === value) ? value : null;
  } catch {
    return null;
  }
}
