import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { EmpresaService } from './empresa.service';

describe('EmpresaService', () => {
  let service: EmpresaService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/empresa`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EmpresaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists notas with only the filters that were given', () => {
    service.listNotas({ ano: 2026, busca: 'tree' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/notas`);
    expect(req.request.params.get('ano')).toBe('2026');
    expect(req.request.params.get('busca')).toBe('tree');
    expect(req.request.params.has('mes')).toBe(false);
    expect(req.request.params.get('limit')).toBe('25');
    req.flush({ items: [], total: 0, soma_valor: 0 });
  });

  it('sends the XML as multipart to be read (nothing is saved)', () => {
    const file = new File(['<NFSe/>'], 'nota.xml', { type: 'text/xml' });
    service.lerXml(file).subscribe();
    const req = httpMock.expectOne(`${baseUrl}/notas/ler-xml`);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
    req.flush({});
  });

  it('asks the limit for a specific year', () => {
    service.limite(2025).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/limite`);
    expect(req.request.params.get('ano')).toBe('2025');
    req.flush({});
  });
});
