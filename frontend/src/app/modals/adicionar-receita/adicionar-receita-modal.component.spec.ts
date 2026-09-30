import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, ToastController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { AuthService, CurrentUser } from '../../core/auth.service';
import { ReceitasService } from '../../services/receitas.service';
import { AdicionarReceitaModalComponent } from './adicionar-receita-modal.component';

describe('AdicionarReceitaModalComponent', () => {
  let fixture: ComponentFixture<AdicionarReceitaModalComponent>;
  let component: AdicionarReceitaModalComponent;
  let currentUser: ReturnType<typeof signal<CurrentUser | null>>;
  let updateDefaultCashPercentage: ReturnType<typeof vi.fn>;

  const user = (pct: number): CurrentUser => ({
    id: 2,
    username: 'teste',
    role: 'user',
    first_name: 'Teste',
    last_name: 'Teste',
    modules: [],
    must_change_password: false,
    default_cash_percentage: pct,
    last_login_at: null,
    last_activity_at: null,
  });

  function setup(pct: number): void {
    currentUser = signal<CurrentUser | null>(user(pct));
    updateDefaultCashPercentage = vi.fn((value: number) => {
      currentUser.set(user(value));
      return of(user(value));
    });
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AuthService, useValue: { currentUser, updateDefaultCashPercentage } },
        { provide: ReceitasService, useValue: { create: vi.fn() } },
        { provide: ModalController, useValue: { dismiss: vi.fn() } },
        { provide: ToastController, useValue: { create: vi.fn(async () => ({ present: vi.fn() })) } },
      ],
    });
    fixture = TestBed.createComponent(AdicionarReceitaModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('starts the slider at the user default', () => {
    setup(30);
    expect(component.form.controls.cashPercentage.value).toBe(30);
    expect(component.isDefaultCashPercentage()).toBe(true);
  });

  it('saves the selected percentage as the new default', () => {
    setup(50);
    component.form.controls.cashPercentage.setValue(20);
    expect(component.isDefaultCashPercentage()).toBe(false);

    component.saveDefaultCashPercentage();

    expect(updateDefaultCashPercentage).toHaveBeenCalledWith(20);
    expect(component.defaultCashPercentage()).toBe(20);
    expect(component.isDefaultCashPercentage()).toBe(true);
  });
});
