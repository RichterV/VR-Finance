import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { apiBaseInterceptor, probeLocalServer } from './api-base';

const LOCAL = 'http://10.0.0.5:8080/api';

describe('apiBaseInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    environment.localApiUrl = LOCAL;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiBaseInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    httpMock.verify();
    vi.unstubAllGlobals();
    // volta pro endereço padrão pro próximo teste
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await probeLocalServer();
    vi.unstubAllGlobals();
    environment.localApiUrl = '';
  });

  it('usa o IP local quando o /health responde', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await probeLocalServer();
    expect(fetchMock).toHaveBeenCalledWith(`${LOCAL}/health`, expect.anything());

    http.get(`${environment.apiUrl}/gastos`).subscribe();
    httpMock.expectOne(`${LOCAL}/gastos`).flush([]);
  });

  it('mantém o endereço padrão quando a rede local não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await probeLocalServer();

    http.get(`${environment.apiUrl}/gastos`).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/gastos`).flush([]);
  });

  it('GET que falha na rede local é repetido pelo endereço padrão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await probeLocalServer();

    let result: unknown;
    http.get(`${environment.apiUrl}/gastos`).subscribe((r) => (result = r));
    httpMock.expectOne(`${LOCAL}/gastos`).error(new ProgressEvent('error'), { status: 0 });
    httpMock.expectOne(`${environment.apiUrl}/gastos`).flush(['ok']);
    expect(result).toEqual(['ok']);
  });

  it('POST que falha na rede local não é repetido (evita duplicata), mas a próxima vai pelo padrão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await probeLocalServer();

    let failed = false;
    http.post(`${environment.apiUrl}/gastos`, {}).subscribe({ error: () => (failed = true) });
    httpMock.expectOne(`${LOCAL}/gastos`).error(new ProgressEvent('error'), { status: 0 });
    expect(failed).toBe(true);

    http.post(`${environment.apiUrl}/gastos`, {}).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/gastos`).flush({});
  });
});
