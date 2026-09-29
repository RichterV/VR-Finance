import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { AuthService, CurrentUser } from '../../core/auth.service';
import { AdminUsuarioModalComponent } from './admin-usuario-modal.component';

describe('AdminUsuarioModalComponent', () => {
  let fixture: ComponentFixture<AdminUsuarioModalComponent>;
  let component: AdminUsuarioModalComponent;
  let createUser: ReturnType<typeof vi.fn>;
  let updateUser: ReturnType<typeof vi.fn>;
  let dismiss: ReturnType<typeof vi.fn>;

  const master: CurrentUser = {
    id: 1,
    username: 'admin',
    role: 'master',
    first_name: 'V',
    last_name: 'R',
    modules: ['veiculos', 'operacoes_bolsa', 'devedores', 'ferramentas', 'exportar_dados'],
    must_change_password: false,
    default_cash_percentage: 50,
    last_login_at: null,
  };
  const comum: CurrentUser = {
    id: 2,
    username: 'teste',
    role: 'user',
    first_name: 'Teste',
    last_name: 'Teste',
    modules: ['ferramentas'],
    must_change_password: false,
    default_cash_percentage: 50,
    last_login_at: null,
  };

  function setup(user?: CurrentUser): void {
    createUser = vi.fn(() => of(comum));
    updateUser = vi.fn(() => of(comum));
    dismiss = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AuthService, useValue: { createUser, updateUser, currentUser: () => master } },
        { provide: ModalController, useValue: { dismiss } },
      ],
    });
    fixture = TestBed.createComponent(AdminUsuarioModalComponent);
    component = fixture.componentInstance;
    component.user = user;
    fixture.detectChanges();
  }

  it('creates a user with no modules by default and requires an initial password', () => {
    setup();
    component.form.patchValue({ username: 'novo', firstName: 'N', lastName: 'U' });
    component.submit();
    expect(component.errorMessage()).toBe('Defina uma senha inicial.');
    expect(createUser).not.toHaveBeenCalled();

    component.form.patchValue({ password: 'senha123', confirmPassword: 'senha123' });
    component.submit();
    expect(createUser).toHaveBeenCalledWith({
      username: 'novo',
      first_name: 'N',
      last_name: 'U',
      password: 'senha123',
      modules: [],
    });
    expect(dismiss).toHaveBeenCalledWith(comum, 'saved');
  });

  it('sends toggled modules in registry order', () => {
    setup();
    component.form.patchValue({ username: 'novo', firstName: 'N', lastName: 'U', password: 'senha123', confirmPassword: 'senha123' });
    component.toggleModule('exportar_dados', true);
    component.toggleModule('veiculos', true);
    component.toggleModule('devedores', true);
    component.toggleModule('devedores', false);
    component.submit();
    expect(createUser.mock.calls[0][0].modules).toEqual(['veiculos', 'exportar_dados']);
  });

  it('edits an existing user keeping its modules, with optional password', () => {
    setup(comum);
    expect(component.isModuleSelected('ferramentas')).toBe(true);
    expect(component.isModuleSelected('veiculos')).toBe(false);
    component.submit();
    expect(updateUser).toHaveBeenCalledWith(2, {
      username: 'teste',
      first_name: 'Teste',
      last_name: 'Teste',
      password: undefined,
      modules: ['ferramentas'],
    });
  });

  it('rejects mismatched passwords', () => {
    setup(comum);
    component.form.patchValue({ password: 'senha123', confirmPassword: 'outra123' });
    component.submit();
    expect(component.errorMessage()).toBe('As senhas não coincidem.');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('locks the username when the master edits its own account, and shows all modules on', () => {
    setup(master);
    expect(component.isSelf).toBe(true);
    expect(component.form.controls.username.disabled).toBe(true);
    expect(component.isModuleSelected('veiculos')).toBe(true);
  });

  it('shows a duplicate-username error on 400', () => {
    setup(comum);
    updateUser.mockReturnValue(throwError(() => ({ status: 400 })));
    component.submit();
    expect(component.errorMessage()).toBe('Esse nome de usuário já existe.');
  });
});
