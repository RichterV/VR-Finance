import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { GastosService } from './gastos.service';

describe('GastosService', () => {
  let service: GastosService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/gastos`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GastosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends default limit/offset when listing without params', () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === baseUrl);
    expect(req.request.params.get('limit')).toBe('25');
    expect(req.request.params.get('offset')).toBe('0');
    expect(req.request.params.has('ano')).toBe(false);
    req.flush({ items: [], total: 0 });
  });

  it('only includes ano/mes in the query when they are provided', () => {
    service.list({ ano: 2026, mes: 8, limit: 10, offset: 20 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === baseUrl);
    expect(req.request.params.get('ano')).toBe('2026');
    expect(req.request.params.get('mes')).toBe('8');
    expect(req.request.params.get('limit')).toBe('10');
    expect(req.request.params.get('offset')).toBe('20');
    req.flush({ items: [], total: 0 });
  });

  it('posts the payload as-is when creating a gasto', () => {
    const payload = { priority: 'essencial' as const, item_id: 1, value: 100, is_installment: false };
    service.create(payload).subscribe();
    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush([]);
  });

  it('sends a DELETE to /gastos/:id when removing', () => {
    service.remove(42).subscribe();
    const req = httpMock.expectOne(`${baseUrl}/42`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
