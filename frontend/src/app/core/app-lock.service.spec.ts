import { TestBed } from '@angular/core/testing';

import { AppLockService, LOCK_TIMEOUT_STORAGE_KEY } from './app-lock.service';
import { AuthService } from './auth.service';
import { markExpectedExternalActivity } from './expected-exit';
import { NativeLockBridge } from './native-lock-bridge';

describe('AppLockService', () => {
  let service: AppLockService;
  let stateListener: (isActive: boolean) => void;
  let authenticate: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;
  let token: string | null;

  async function setup(opts: { native?: boolean; biometricLogin?: boolean; stored?: string } = {}): Promise<void> {
    localStorage.removeItem(LOCK_TIMEOUT_STORAGE_KEY);
    if (opts.stored !== undefined) localStorage.setItem(LOCK_TIMEOUT_STORAGE_KEY, opts.stored);
    authenticate = vi.fn(() => Promise.resolve('ok'));
    logout = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NativeLockBridge,
          useValue: {
            isNative: () => opts.native ?? true,
            onAppStateChange: (listener: (isActive: boolean) => void) => (stateListener = listener),
            authenticate,
            canAuthenticate: () => Promise.resolve(true),
            isBiometricLoginEnabled: () => Promise.resolve(opts.biometricLogin ?? true),
            minimizeApp: vi.fn(),
          },
        },
        { provide: AuthService, useValue: { get token() { return token; }, logout } },
      ],
    });
    service = TestBed.inject(AppLockService);
  }

  /** Vai pro segundo plano, avança `minutes` e volta -- espera o onForeground assíncrono terminar. */
  async function awayFor(minutes: number): Promise<void> {
    stateListener(false);
    vi.advanceTimersByTime(minutes * 60_000);
    stateListener(true);
    // onForeground lê o tempo configurado de forma assíncrona antes de decidir
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    token = 'jwt';
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(LOCK_TIMEOUT_STORAGE_KEY);
  });

  it('locks on a cold start when there is a saved session', async () => {
    await setup();
    authenticate.mockImplementation(() => new Promise(() => {})); // prompt fica aberto
    await service.init();
    expect(service.locked()).toBe(true);
  });

  it('does not lock on a cold start without a session', async () => {
    token = null;
    await setup();
    await service.init();
    expect(service.locked()).toBe(false);
  });

  it('defaults to 5 minutes for biometric-login users and never for the rest', async () => {
    await setup({ biometricLogin: true });
    expect(await service.getTimeoutMinutes()).toBe(5);
    TestBed.resetTestingModule();
    await setup({ biometricLogin: false });
    expect(await service.getTimeoutMinutes()).toBe(-1);
  });

  it('locks only after the configured time in background', async () => {
    token = null; // sem bloqueio de abertura a frio
    await setup({ stored: '5' });
    await service.init();
    token = 'jwt';
    authenticate.mockImplementation(() => new Promise(() => {}));

    await awayFor(4);
    expect(service.locked()).toBe(false);

    await awayFor(5);
    expect(service.locked()).toBe(true);
  });

  it('"Imediatamente" locks on any return and "Nunca" never locks', async () => {
    token = null;
    await setup({ stored: '0' });
    await service.init();
    token = 'jwt';
    authenticate.mockImplementation(() => new Promise(() => {}));
    await awayFor(0);
    expect(service.locked()).toBe(true);

    TestBed.resetTestingModule();
    token = null;
    await setup({ stored: '-1' });
    await service.init();
    token = 'jwt';
    await awayFor(60);
    expect(service.locked()).toBe(false);
  });

  it('ignores one return after an expected exit (camera, file picker, share)', async () => {
    token = null;
    await setup({ stored: '0' });
    await service.init();
    token = 'jwt';
    authenticate.mockImplementation(() => new Promise(() => {}));

    markExpectedExternalActivity();
    await awayFor(1);
    expect(service.locked()).toBe(false);

    await awayFor(1);
    expect(service.locked()).toBe(true);
  });

  it('still locks if the expected exit lasted more than 10 minutes', async () => {
    token = null;
    await setup({ stored: '5' });
    await service.init();
    token = 'jwt';
    authenticate.mockImplementation(() => new Promise(() => {}));

    markExpectedExternalActivity();
    await awayFor(11);
    expect(service.locked()).toBe(true);
  });

  it('unlocks on success and stays locked when the user cancels', async () => {
    await setup();
    authenticate.mockResolvedValueOnce('cancel');
    await service.init();
    await vi.waitFor(() => expect(service.busy()).toBe(false));
    expect(service.locked()).toBe(true);
    expect(service.errorMessage()).toBeNull();

    await service.unlock();
    expect(service.locked()).toBe(false);
  });

  it('shows an error when authentication fails', async () => {
    await setup();
    authenticate.mockRejectedValueOnce(new Error('falhou'));
    await service.init();
    await vi.waitFor(() => expect(service.errorMessage()).not.toBeNull());
    expect(service.locked()).toBe(true);
  });

  it('logs out from the lock screen', async () => {
    await setup();
    authenticate.mockImplementation(() => new Promise(() => {}));
    await service.init();
    service.logoutFromLock();
    expect(service.locked()).toBe(false);
    expect(logout).toHaveBeenCalled();
  });

  it('is a no-op on the web', async () => {
    await setup({ native: false });
    await service.init();
    expect(service.locked()).toBe(false);
    expect(service.isAvailable).toBe(false);
  });
});
