import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { CasaService, garantiaVigente, nivelPermite } from './casa.service';

describe('CasaService', () => {
  let service: CasaService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/casa`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CasaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists services with only the filters that were given', () => {
    service.listServicos().subscribe();
    const plain = httpMock.expectOne((r) => r.url === `${baseUrl}/servicos`);
    expect(plain.request.params.keys().sort()).toEqual(['limit', 'offset']);
    plain.flush({ items: [], total: 0 });

    service
      .listServicos({ imovel_id: 3, categoria: 'pintura', garantia_vigente: true, busca: 'silva', limit: 10, offset: 20 })
      .subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/servicos`);
    expect(req.request.params.get('imovel_id')).toBe('3');
    expect(req.request.params.get('categoria')).toBe('pintura');
    expect(req.request.params.get('garantia_vigente')).toBe('true');
    expect(req.request.params.get('busca')).toBe('silva');
    expect(req.request.params.get('offset')).toBe('20');
    req.flush({ items: [], total: 0 });
  });

  it('sends ano/mes to the resumo only when set', () => {
    service.resumo(12, 2026).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/resumo`);
    expect(req.request.params.get('meses')).toBe('12');
    expect(req.request.params.get('ano')).toBe('2026');
    expect(req.request.params.has('mes')).toBe(false);
    req.flush({ imoveis: [], categorias: [], garantias_vigentes: 0, meses: [], series: [] });
  });

  it('creates and edits imóveis by name', () => {
    service.createImovel('Casa').subscribe();
    const create = httpMock.expectOne(`${baseUrl}/imoveis`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Casa' });
    create.flush({ id: 1, name: 'Casa', active: true });

    service.updateImovel(1, 'Casa da praia').subscribe();
    const update = httpMock.expectOne(`${baseUrl}/imoveis/1`);
    expect(update.request.method).toBe('PUT');
    update.flush({ id: 1, name: 'Casa da praia', active: true });
  });

  it('calls the share endpoints with the property as item', () => {
    const shares = `${environment.apiUrl}/compartilhamentos`;
    service.compartilhar(4, 'bruno', 'edicao').subscribe();
    const create = httpMock.expectOne(shares);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ item_tipo: 'imovel', item_id: 4, username: 'bruno', nivel: 'edicao' });
    create.flush({});

    service.listCompartilhamentos(4).subscribe();
    const list = httpMock.expectOne((r) => r.url === shares);
    expect(list.request.params.get('item_tipo')).toBe('imovel');
    expect(list.request.params.get('item_id')).toBe('4');
    list.flush([]);

    service.mudarNivel(7, 'leitura').subscribe();
    const put = httpMock.expectOne(`${shares}/7`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ nivel: 'leitura' });
    put.flush({});

    service.encerrarCompartilhamento(7).subscribe();
    expect(httpMock.expectOne(`${shares}/7`).request.method).toBe('DELETE');

    service.aceitarCompartilhamento(7).subscribe();
    expect(httpMock.expectOne(`${shares}/7/aceitar`).request.method).toBe('POST');
    service.recusarCompartilhamento(7).subscribe();
    expect(httpMock.expectOne(`${shares}/7/recusar`).request.method).toBe('POST');
  });
});

describe('nivelPermite', () => {
  it('treats levels as cumulative, with the owner above all', () => {
    expect(nivelPermite('leitura', 'cadastro')).toBe(false);
    expect(nivelPermite('cadastro', 'cadastro')).toBe(true);
    expect(nivelPermite('edicao', 'total')).toBe(false);
    expect(nivelPermite('total', 'edicao')).toBe(true);
    expect(nivelPermite('dono', 'total')).toBe(true);
    // Imóvel sem meu_nivel (resposta antiga) = meu.
    expect(nivelPermite(undefined, 'total')).toBe(true);
  });
});

describe('garantiaVigente', () => {
  it('counts the last day of the warranty as still valid', () => {
    expect(garantiaVigente('2026-10-15', '2026-10-15')).toBe(true);
    expect(garantiaVigente('2026-10-14', '2026-10-15')).toBe(false);
    expect(garantiaVigente(null, '2026-10-15')).toBe(false);
  });
});
