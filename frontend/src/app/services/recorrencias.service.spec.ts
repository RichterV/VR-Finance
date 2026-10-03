import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { RecorrenciasService } from './recorrencias.service';

describe('RecorrenciasService', () => {
  let service: RecorrenciasService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/recorrencias`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RecorrenciasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('pausa e retoma por POST', () => {
    service.pausar(3).subscribe();
    httpMock.expectOne({ method: 'POST', url: `${baseUrl}/3/pausar` }).flush({});
    service.retomar(3).subscribe();
    httpMock.expectOne({ method: 'POST', url: `${baseUrl}/3/retomar` }).flush({});
  });

  it('manda apagar_pendentes ao excluir', () => {
    service.delete(5, true).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/5`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('apagar_pendentes')).toBe('true');
    req.flush(null);
  });
});
