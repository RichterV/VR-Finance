import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const TOKEN_KEY = 'vrfinance_token';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: router }],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('has no token and no current user before logging in', () => {
    expect(service.token).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isMaster).toBe(false);
  });

  it('stores the access token on successful login', () => {
    service.login('teste', 'senha123').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(req.request.body).toBe('username=teste&password=senha123');

    req.flush({ access_token: 'abc123', token_type: 'bearer' });
    expect(service.token).toBe('abc123');
  });

  it('updates the currentUser signal and isMaster after loadCurrentUser', () => {
    service.loadCurrentUser().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    req.flush({ id: 1, username: 'admin', role: 'master', first_name: 'Nome', last_name: 'Sobrenome' });

    expect(service.currentUser()).toEqual({
      id: 1,
      username: 'admin',
      role: 'master',
      first_name: 'Nome',
      last_name: 'Sobrenome',
    });
    expect(service.isMaster).toBe(true);
  });

  it('clears the token and currentUser on logout', () => {
    service.loadCurrentUser().subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/auth/me`)
      .flush({ id: 1, username: 'teste', role: 'user', first_name: 'Teste', last_name: 'Teste' });
    localStorage.setItem(TOKEN_KEY, 'abc123');

    service.logout();

    expect(service.token).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('hasModule reflects the modules returned by /auth/me', () => {
    service.loadCurrentUser().subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({
      id: 2,
      username: 'teste',
      role: 'user',
      first_name: 'Teste',
      last_name: 'Teste',
      modules: ['devedores'],
    });

    expect(service.hasModule('devedores')).toBe(true);
    expect(service.hasModule('veiculos')).toBe(false);
  });

  it('updateProfile sends PUT /auth/me and swaps the stored token and current user', () => {
    localStorage.setItem(TOKEN_KEY, 'token-antigo');
    service.updateProfile('novo_nome', 'Maria', 'Silva').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/me`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ username: 'novo_nome', first_name: 'Maria', last_name: 'Silva' });
    const user = { id: 2, username: 'novo_nome', role: 'user', first_name: 'Maria', last_name: 'Silva', modules: [] };
    req.flush({ access_token: 'token-novo', token_type: 'bearer', user });

    expect(service.token).toBe('token-novo');
    expect(service.currentUser()).toEqual(user);
  });

  it('createUser/updateUser send the enabled modules, omitting a blank password on update', () => {
    const payload = { username: 'x', first_name: 'A', last_name: 'B', modules: ['ferramentas' as const] };
    service.createUser({ ...payload, password: 'senha123' }).subscribe();
    const create = httpMock.expectOne(`${environment.apiUrl}/auth/users`);
    expect(create.request.body).toEqual({ ...payload, password: 'senha123' });
    create.flush({});

    service.updateUser(5, { ...payload, password: '' }).subscribe();
    const update = httpMock.expectOne(`${environment.apiUrl}/auth/users/5`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ ...payload, password: undefined });
    update.flush({});
  });
});
