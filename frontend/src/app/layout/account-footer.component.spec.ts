import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { CurrentUser } from '../core/auth.service';
import { AccountFooterComponent } from './account-footer.component';

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    username: 'maria',
    role: 'user',
    first_name: 'Maria',
    last_name: 'Souza',
    modules: [],
    must_change_password: false,
    default_cash_percentage: 50,
    last_login_at: null,
    last_activity_at: null,
    ...overrides,
  };
}

describe('AccountFooterComponent', () => {
  function setup(u: CurrentUser | null) {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([]), provideHttpClient()] });
    const fixture = TestBed.createComponent(AccountFooterComponent);
    fixture.componentRef.setInput('user', u);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the full name, initials and role', () => {
    const el: HTMLElement = setup(user()).nativeElement;
    expect(el.querySelector('.avatar-initials')?.textContent?.trim()).toBe('MS');
    expect(el.querySelector('.account-name')?.textContent).toContain('Maria Souza');
    expect(el.querySelector('.account-sub')?.textContent).toContain('maria · Usuário');
  });

  it('shows Admin only for the master', () => {
    expect(setup(user()).nativeElement.textContent).not.toContain('Admin');
    TestBed.resetTestingModule();
    expect(setup(user({ role: 'master' })).nativeElement.textContent).toContain('Admin');
  });

  it('emits the account actions', () => {
    const fixture = setup(user());
    const perfil = vi.fn();
    const categorias = vi.fn();
    const sair = vi.fn();
    fixture.componentInstance.perfil.subscribe(perfil);
    fixture.componentInstance.categorias.subscribe(categorias);
    fixture.componentInstance.sair.subscribe(sair);

    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('.account-card') as HTMLButtonElement).click();
    const [cat, sairBtn] = Array.from(el.querySelectorAll<HTMLButtonElement>('button.account-action'));
    cat.click();
    sairBtn.click();

    expect(perfil).toHaveBeenCalledTimes(1);
    expect(categorias).toHaveBeenCalledTimes(1);
    expect(sair).toHaveBeenCalledTimes(1);
  });
});
