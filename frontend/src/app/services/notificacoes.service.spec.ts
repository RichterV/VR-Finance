import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { fakeNotificacao } from './notificacoes.fixtures';
import { NotificacoesService } from './notificacoes.service';

describe('NotificacoesService', () => {
  let service: NotificacoesService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/notificacoes`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotificacoesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the list and derives the unread count and the pending digest', () => {
    service.load().subscribe();
    httpMock.expectOne(baseUrl).flush([fakeNotificacao({ id: 2 }), fakeNotificacao({ id: 1, lida: true, mes: 8 })]);

    expect(service.naoLidas()).toBe(1);
    expect(service.resumoPendente()?.id).toBe(2);
  });

  it('marks one as read and updates the local list', () => {
    service.items.set([fakeNotificacao()]);
    service.markRead(1).subscribe();
    const req = httpMock.expectOne(`${baseUrl}/1/lida`);
    expect(req.request.method).toBe('PUT');
    req.flush(fakeNotificacao({ lida: true }));

    expect(service.naoLidas()).toBe(0);
    expect(service.resumoPendente()).toBeNull();
  });

  it('marks all as read', () => {
    service.items.set([fakeNotificacao({ id: 1 }), fakeNotificacao({ id: 2 })]);
    service.markAllRead().subscribe();
    httpMock.expectOne(`${baseUrl}/lidas`).flush(null);

    expect(service.naoLidas()).toBe(0);
  });
});
