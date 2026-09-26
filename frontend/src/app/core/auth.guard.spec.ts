import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';

import { authGuard, masterGuard, moduleGuard, passwordChangeGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ModuleKey } from './modules';

describe('moduleGuard / masterGuard', () => {
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let enabled: ModuleKey[];
  let isMaster: boolean;

  beforeEach(() => {
    router = { navigateByUrl: vi.fn() };
    enabled = [];
    isMaster = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: AuthService,
          useValue: {
            hasModule: (key: ModuleKey) => enabled.includes(key),
            get isMaster() {
              return isMaster;
            },
          },
        },
      ],
    });
  });

  function runModuleGuard(module: ModuleKey) {
    const route = { data: { module } } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => moduleGuard(route, {} as RouterStateSnapshot));
  }

  it('allows the route when the module is enabled', () => {
    enabled = ['veiculos'];
    expect(runModuleGuard('veiculos')).toBe(true);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('redirects to /home when the module is disabled', () => {
    enabled = ['ferramentas'];
    expect(runModuleGuard('veiculos')).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('masterGuard only lets the master in', () => {
    const run = () =>
      TestBed.runInInjectionContext(() => masterGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(run()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');

    isMaster = true;
    expect(run()).toBe(true);
  });
});

describe('authGuard / passwordChangeGuard', () => {
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  function setup(mustChange: boolean) {
    router = { navigateByUrl: vi.fn() };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: AuthService,
          useValue: {
            token: 'abc',
            currentUser: () => ({ id: 2, username: 'novo', role: 'user', modules: [], must_change_password: mustChange }),
          },
        },
      ],
    });
  }

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  it('authGuard sends a user with pending password change to /trocar-senha', () => {
    setup(true);
    expect(run(authGuard)).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/trocar-senha');
  });

  it('authGuard lets a regular user in', () => {
    setup(false);
    expect(run(authGuard)).toBe(true);
  });

  it('passwordChangeGuard only allows users with a pending change', () => {
    setup(true);
    expect(run(passwordChangeGuard)).toBe(true);

    setup(false);
    expect(run(passwordChangeGuard)).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
  });
});
