import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { PASSWORD_CHANGE_REQUIRED_DETAIL, authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let logout: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('vrfinance_token', 'tok-1');
    logout = vi.fn(() => localStorage.removeItem('vrfinance_token'));
    navigateByUrl = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { logout } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('vrfinance_token');
  });

  it('adds the bearer token', () => {
    http.get('/api/gastos').subscribe();
    expect(httpMock.expectOne('/api/gastos').request.headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('logs out once when several requests come back 401', () => {
    http.get('/api/a').subscribe({ error: () => {} });
    http.get('/api/b').subscribe({ error: () => {} });
    httpMock.expectOne('/api/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/b').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('does not log out on a failed login', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => {} });
    httpMock.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(logout).not.toHaveBeenCalled();
  });

  it('sends the user to /trocar-senha on the pending-password 403', () => {
    http.get('/api/gastos').subscribe({ error: () => {} });
    httpMock.expectOne('/api/gastos').flush({ detail: PASSWORD_CHANGE_REQUIRED_DETAIL }, { status: 403, statusText: 'Forbidden' });
    expect(navigateByUrl).toHaveBeenCalledWith('/trocar-senha');
    expect(logout).not.toHaveBeenCalled();
  });

  it('ignores other 403s (module disabled)', () => {
    http.get('/api/devedores').subscribe({ error: () => {} });
    httpMock.expectOne('/api/devedores').flush({ detail: 'Módulo não habilitado' }, { status: 403, statusText: 'Forbidden' });
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
