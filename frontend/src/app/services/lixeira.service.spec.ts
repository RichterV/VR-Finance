import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { LixeiraService } from './lixeira.service';

describe('LixeiraService', () => {
  let service: LixeiraService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/lixeira`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LixeiraService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista, restaura, exclui, esvazia e baixa anexo nos endpoints certos', () => {
    service.list().subscribe();
    expect(http.expectOne({ method: 'GET', url: base })).toBeTruthy();

    service.restore(3).subscribe();
    const restore = http.expectOne({ method: 'POST', url: `${base}/3/restaurar` });
    expect(restore.request.body).toEqual({});

    service.delete(3).subscribe();
    http.expectOne({ method: 'DELETE', url: `${base}/3` });

    service.empty().subscribe();
    http.expectOne({ method: 'DELETE', url: base });

    service.downloadAnexo(7).subscribe();
    const download = http.expectOne({ method: 'GET', url: `${base}/anexos/7/download` });
    expect(download.request.responseType).toBe('blob');
  });
});
