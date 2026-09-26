import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { TrocarSenhaPage } from './trocar-senha.page';

describe('TrocarSenhaPage', () => {
  let fixture: ComponentFixture<TrocarSenhaPage>;
  let component: TrocarSenhaPage;
  let changePassword: ReturnType<typeof vi.fn>;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    changePassword = vi.fn(() => of({ detail: 'ok' }));
    router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: Router, useValue: router },
        {
          provide: AuthService,
          useValue: { changePassword, logout: vi.fn(), currentUser: () => ({ first_name: 'Rita' }) },
        },
      ],
    });
    fixture = TestBed.createComponent(TrocarSenhaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('changes the password and goes to /home', () => {
    component.form.setValue({ currentPassword: 'senha123', newPassword: 'nova-senha', confirmPassword: 'nova-senha' });
    component.submit();
    expect(changePassword).toHaveBeenCalledWith('senha123', 'nova-senha');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('rejects mismatched confirmation without calling the API', () => {
    component.form.setValue({ currentPassword: 'senha123', newPassword: 'nova-senha', confirmPassword: 'outra' });
    component.submit();
    expect(component.errorMessage()).toBe('As senhas novas não coincidem.');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('shows the backend message on error and stays on the page', () => {
    changePassword.mockReturnValue(throwError(() => ({ status: 400, error: { detail: 'Senha atual incorreta' } })));
    component.form.setValue({ currentPassword: 'errada', newPassword: 'nova-senha', confirmPassword: 'nova-senha' });
    component.submit();
    expect(component.errorMessage()).toBe('Senha atual incorreta');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
