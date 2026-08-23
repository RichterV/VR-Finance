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
    req.flush({ id: 1, username: 'admin', role: 'master' });

    expect(service.currentUser()).toEqual({ id: 1, username: 'admin', role: 'master' });
    expect(service.isMaster).toBe(true);
  });

  it('clears the token and currentUser on logout', () => {
    service.loadCurrentUser().subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/me`).flush({ id: 1, username: 'teste', role: 'user' });
    localStorage.setItem(TOKEN_KEY, 'abc123');

    service.logout();

    expect(service.token).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
