import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AvatarService } from './avatar.service';

describe('AvatarService', () => {
  let service: AvatarService;
  let httpMock: HttpTestingController;
  let created = 0;

  beforeEach(() => {
    created = 0;
    // jsdom não implementa blob: URLs
    URL.createObjectURL = vi.fn(() => `blob:fake-${++created}`);
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AvatarService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the own photo once per version', () => {
    const urls: (string | null)[] = [];
    service.url(null, 1).subscribe((u) => urls.push(u));
    service.url(null, 1).subscribe((u) => urls.push(u));
    httpMock.expectOne(`${environment.apiUrl}/auth/me/avatar`).flush(new Blob(['x']));
    expect(urls).toEqual(['blob:fake-1', 'blob:fake-1']);
  });

  it('fetches again when the version changes and frees the old URL', () => {
    service.url(null, 1).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/me/avatar`).flush(new Blob(['x']));
    service.url(null, 2).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/me/avatar`).flush(new Blob(['y']));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-1');
  });

  it('uses the admin endpoint for another user and falls back to null on error', () => {
    let result: string | null | undefined;
    service.url(7, 1).subscribe((u) => (result = u));
    httpMock.expectOne(`${environment.apiUrl}/auth/users/7/avatar`).flush(new Blob(), { status: 404, statusText: 'Not Found' });
    expect(result).toBeNull();
  });
});
