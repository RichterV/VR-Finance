import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/export`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ExportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('downloads the given module as a blob', () => {
    service.download('gastos').subscribe();

    const req = httpMock.expectOne(`${baseUrl}/gastos`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['dados']));
  });

  it('builds the URL for each of the 6 modules', () => {
    (['gastos', 'receitas', 'veiculos', 'operacoes_bolsa', 'devedores', 'categorias'] as const).forEach((modulo) => {
      service.download(modulo).subscribe();
      httpMock.expectOne(`${baseUrl}/${modulo}`).flush(new Blob());
    });
  });
});
