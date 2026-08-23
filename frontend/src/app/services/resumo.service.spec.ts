import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ResumoService } from './resumo.service';

describe('ResumoService', () => {
  let service: ResumoService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/resumo`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ResumoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('omits ate_ano/ate_mes from /resumo/anual when no cutoff is given', () => {
    service.anual(2026, 12).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/anual`);
    expect(req.request.params.get('ano')).toBe('2026');
    expect(req.request.params.get('meses')).toBe('12');
    expect(req.request.params.has('ate_ano')).toBe(false);
    expect(req.request.params.has('ate_mes')).toBe(false);
    req.flush({});
  });

  it('sends ate_ano/ate_mes on /resumo/anual only when both are present in the cutoff', () => {
    service.anual(2026, 12, { ateAno: 2026, ateMes: 1 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/anual`);
    expect(req.request.params.get('ate_ano')).toBe('2026');
    expect(req.request.params.get('ate_mes')).toBe('1');
    req.flush({});
  });

  it('sends no cutoff params on /resumo/geral by default', () => {
    service.geral().subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/geral`);
    expect(req.request.params.has('ate_ano')).toBe(false);
    req.flush({});
  });

  it('sends ate_ano/ate_mes on /resumo/geral when a cutoff is given', () => {
    service.geral({ ateAno: 2025, ateMes: 3 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/geral`);
    expect(req.request.params.get('ate_ano')).toBe('2025');
    expect(req.request.params.get('ate_mes')).toBe('3');
    req.flush({});
  });

  it('requests /resumo/mensal with the given ano/mes', () => {
    service.mensal(2026, 8).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/mensal`);
    expect(req.request.params.get('ano')).toBe('2026');
    expect(req.request.params.get('mes')).toBe('8');
    req.flush({});
  });
});
