import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AttachmentsService } from './attachments.service';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/attachments`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AttachmentsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('uploads the file as multipart form data', () => {
    const file = new File(['conteudo'], 'nota.pdf', { type: 'application/pdf' });
    service.upload('gasto', 42, file).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/upload`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    expect(body.get('entity_type')).toBe('gasto');
    expect(body.get('entity_id')).toBe('42');
    expect(body.get('file')).toBe(file);
    req.flush({
      id: 1,
      entity_type: 'gasto',
      entity_id: '42',
      original_filename: 'nota.pdf',
      content_type: 'application/pdf',
      size_bytes: 8,
      created_at: '2026-01-01T00:00:00',
    });
  });

  it('lists attachments filtered by entity type and id', () => {
    service.list('gasto', 42).subscribe();
    const req = httpMock.expectOne((r) => r.url === baseUrl);
    expect(req.request.params.get('entity_type')).toBe('gasto');
    expect(req.request.params.get('entity_id')).toBe('42');
    req.flush([]);
  });

  it('sends entity_ids as a repeated query param when checking existence', () => {
    service.exists('gasto', ['1', '2']).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${baseUrl}/exists`);
    expect(req.request.params.getAll('entity_ids')).toEqual(['1', '2']);
    req.flush({ entity_ids_with_attachments: ['1'] });
  });

  it('downloads as a blob', () => {
    service.downloadBlob(7).subscribe();
    const req = httpMock.expectOne(`${baseUrl}/7/download`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['dados']));
  });

  it('sends a DELETE to /attachments/:id when removing', () => {
    service.remove(7).subscribe();
    const req = httpMock.expectOne(`${baseUrl}/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
