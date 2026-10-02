import { TestBed } from '@angular/core/testing';
import { AlertController, ModalController, ToastController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { HomeRefreshService } from '../../core/home-refresh.service';
import { DropdownOption, DropdownOptionsService } from '../../services/dropdown-options.service';
import { ItensModalComponent } from './itens-modal.component';
import { UNDO_WINDOW_MS } from '../../shared/undo-delete.service';

function option(overrides: Partial<DropdownOption>): DropdownOption {
  return {
    id: 1,
    priority: 'essencial',
    name: 'Casa',
    active: true,
    include_in_inflation: false,
    ...overrides,
  };
}

describe('ItensModalComponent', () => {
  let listSpy: ReturnType<typeof vi.fn>;
  let createSpy: ReturnType<typeof vi.fn>;
  let updateSpy: ReturnType<typeof vi.fn>;
  let removeSpy: ReturnType<typeof vi.fn>;
  let alertCreateSpy: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastAlertConfig: any;
  let inflacaoHabilitada: boolean;

  function createComponent() {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: DropdownOptionsService, useValue: { list: listSpy, create: createSpy, update: updateSpy, remove: removeSpy } },
        { provide: AlertController, useValue: { create: alertCreateSpy } },
        { provide: ModalController, useValue: { dismiss: vi.fn() } },
        { provide: ToastController, useValue: { create: vi.fn(() => Promise.resolve({ present: vi.fn(), dismiss: vi.fn() })) } },
        { provide: AuthService, useValue: { hasModule: (key: string) => key === 'analise_inflacionaria' && inflacaoHabilitada } },
      ],
    });
    const fixture = TestBed.createComponent(ItensModalComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    listSpy = vi.fn(() => of([option({})]));
    createSpy = vi.fn(() => of(option({})));
    updateSpy = vi.fn(() => of(option({})));
    removeSpy = vi.fn(() => of(undefined));
    lastAlertConfig = null;
    inflacaoHabilitada = true;
    alertCreateSpy = vi.fn((config: unknown) => {
      lastAlertConfig = config;
      return Promise.resolve({ present: vi.fn().mockResolvedValue(undefined) });
    });
  });

  it('loads essencial items on init', () => {
    createComponent();

    expect(listSpy).toHaveBeenCalledWith('essencial');
  });

  it('switching priority reloads with the new priority', () => {
    const fixture = createComponent();

    fixture.componentInstance.onPriorityChange('nao_essencial');

    expect(listSpy).toHaveBeenCalledWith('nao_essencial');
  });

  it('addItem() creates a category with the entered name', async () => {
    const fixture = createComponent();

    await fixture.componentInstance.addItem();
    const result = lastAlertConfig.buttons.find((b: { role?: string }) => b.role !== 'cancel').handler({ name: '  Transporte  ' });

    expect(result).toBe(true);
    expect(createSpy).toHaveBeenCalledWith('essencial', 'Transporte');
  });

  it('addItem() rejects a blank name without calling the API', async () => {
    const fixture = createComponent();

    await fixture.componentInstance.addItem();
    const result = lastAlertConfig.buttons.find((b: { role?: string }) => b.role !== 'cancel').handler({ name: '   ' });

    expect(result).toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('editItem() updates only the name, leaving include_in_inflation untouched', async () => {
    const fixture = createComponent();
    const item = option({ id: 5, name: 'Casa', include_in_inflation: true });

    await fixture.componentInstance.editItem(item);
    lastAlertConfig.buttons.find((b: { role?: string }) => b.role !== 'cancel').handler({ name: 'Moradia' });

    expect(updateSpy).toHaveBeenCalledWith(5, { name: 'Moradia' });
  });

  it('toggleInflacao() flips the flag, keeps the current name, and notifies the Home to refresh', () => {
    const fixture = createComponent();
    const homeRefresh = TestBed.inject(HomeRefreshService);
    const requestSpy = vi.spyOn(homeRefresh, 'request');
    const item = option({ id: 7, name: 'Alimentação', include_in_inflation: false });

    fixture.componentInstance.toggleInflacao(item);

    expect(updateSpy).toHaveBeenCalledWith(7, { name: 'Alimentação', include_in_inflation: true });
    // A Home lê a cesta de inflação na seção "Análise inflacionária" -- sem isso ela só
    // atualizaria num F5 manual, já que esse modal não fica "por baixo" da Home.
    expect(requestSpy).toHaveBeenCalled();
  });

  it('deleteItem() hides the category right away and only deletes after the undo window', () => {
    vi.useFakeTimers();
    try {
      const fixture = createComponent();
      const item = option({ id: 9, name: 'Casa' });
      fixture.componentInstance.items.set([item, option({ id: 10, name: 'Mercado' })]);

      fixture.componentInstance.deleteItem(item);

      expect(fixture.componentInstance.items().map((i) => i.id)).toEqual([10]);
      expect(removeSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
      expect(removeSpy).toHaveBeenCalledWith(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the "Cesta de inflação" toggle when the Análise inflacionária module is enabled', () => {
    const fixture = createComponent();

    expect(fixture.nativeElement.querySelector('ion-toggle')).not.toBeNull();
  });

  it('hides the "Cesta de inflação" toggle when the Análise inflacionária module is disabled', () => {
    inflacaoHabilitada = false;
    const fixture = createComponent();

    expect(fixture.nativeElement.querySelector('ion-toggle')).toBeNull();
  });
});
