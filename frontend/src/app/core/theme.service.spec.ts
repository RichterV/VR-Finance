import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { DEFAULT_THEME, THEMES, activeTheme, chartColors } from '../shared/themes';
import { AuthService, CurrentUser } from './auth.service';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let user: ReturnType<typeof signal<CurrentUser | null>>;
  let auth: { currentUser: typeof user; updateTheme: ReturnType<typeof vi.fn>; patchCurrentUser: ReturnType<typeof vi.fn> };

  function setup(stored?: string) {
    localStorage.clear();
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    document.documentElement.removeAttribute('data-tema');
    activeTheme.set(DEFAULT_THEME);
    user = signal<CurrentUser | null>(null);
    auth = {
      currentUser: user,
      updateTheme: vi.fn(() => of({})),
      patchCurrentUser: vi.fn((changes: Partial<CurrentUser>) => {
        const u = user();
        if (u) user.set({ ...u, ...changes });
      }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  function login(theme: string) {
    user.set({ id: 1, username: 'ana', role: 'user', first_name: 'Ana', last_name: 'Demo', modules: [], must_change_password: false, default_cash_percentage: 50, last_login_at: null, last_activity_at: null, theme });
    TestBed.tick();
  }

  afterEach(() => localStorage.clear());

  it('opens with the last theme used on this device, or the default', () => {
    expect(setup().current()).toBe(DEFAULT_THEME);
    expect(document.documentElement.getAttribute('data-tema')).toBe(DEFAULT_THEME);

    TestBed.resetTestingModule();
    expect(setup('nordico').current()).toBe('nordico');
    expect(document.documentElement.getAttribute('data-tema')).toBe('nordico');
  });

  it('ignores an unknown stored value', () => {
    expect(setup('rosa-choque').current()).toBe(DEFAULT_THEME);
  });

  it("switches to the logged user's theme and remembers it on the device", () => {
    const service = setup('oled');
    login('musgo');
    expect(service.current()).toBe('musgo');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('musgo');
    // Logout não volta pro padrão: o login seguinte mostra o último tema do aparelho.
    user.set(null);
    TestBed.tick();
    expect(service.current()).toBe('musgo');
  });

  it('applies a choice at once and saves it', () => {
    const service = setup();
    login('salvia');
    service.choose('cobre').subscribe();
    expect(service.current()).toBe('cobre');
    expect(document.documentElement.getAttribute('data-tema')).toBe('cobre');
    expect(auth.updateTheme).toHaveBeenCalledWith('cobre');
    expect(user()?.theme).toBe('cobre');
  });

  it('goes back to the previous theme when saving fails', () => {
    const service = setup();
    login('salvia');
    auth.updateTheme.mockReturnValue(throwError(() => ({ status: 500 })));
    let falhou = false;
    service.choose('cobre').subscribe({ error: () => (falhou = true) });
    expect(falhou).toBe(true);
    expect(service.current()).toBe('salvia');
    expect(user()?.theme).toBe('salvia');
  });

  it('chart colors follow the active theme', () => {
    const service = setup();
    login('salvia');
    const antes = chartColors().essencial;
    service.choose('oceano').subscribe();
    expect(chartColors().essencial).toBe(THEMES.find((t) => t.key === 'oceano')!.chart.essencial);
    expect(chartColors().essencial).not.toBe(antes);
  });
});

describe('THEMES', () => {
  it('has the 15 themes, unique keys, valid colors and the default among them', () => {
    expect(THEMES.length).toBe(15);
    expect(new Set(THEMES.map((t) => t.key)).size).toBe(15);
    expect(THEMES.some((t) => t.key === DEFAULT_THEME)).toBe(true);
    for (const t of THEMES) {
      for (const cor of [...Object.values(t.amostra), t.chart.essencial, t.chart.naoEssencial, t.chart.caixaReal, t.chart.receita, t.chart.caixaPretendido, t.chart.razao, t.chart.gastos, t.chart.texto]) {
        expect(cor).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
