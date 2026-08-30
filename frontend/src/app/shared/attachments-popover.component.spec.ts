import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { AttachmentsPopoverComponent } from './attachments-popover.component';
import { DownloadFileService } from './download-file.service';

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    entity_type: 'gasto',
    entity_id: '42',
    original_filename: 'comprovante.pdf',
    content_type: 'application/pdf',
    size_bytes: 2048,
    created_at: '2026-01-01T00:00:00',
    ...overrides,
  };
}

describe('AttachmentsPopoverComponent', () => {
  let downloadBlobSpy: ReturnType<typeof vi.fn>;
  let triggerSpy: ReturnType<typeof vi.fn>;

  function createComponent(files: Attachment[]) {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AttachmentsService, useValue: { downloadBlob: downloadBlobSpy } },
        { provide: DownloadFileService, useValue: { trigger: triggerSpy } },
      ],
    });
    const fixture = TestBed.createComponent(AttachmentsPopoverComponent);
    fixture.componentRef.setInput('files', files);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    downloadBlobSpy = vi.fn();
    triggerSpy = vi.fn();
  });

  it('downloads and hands the blob to DownloadFileService (web), clearing the busy state', async () => {
    const blob = new Blob(['conteudo']);
    downloadBlobSpy.mockReturnValue(of(blob));
    triggerSpy.mockResolvedValue({ savedNatively: false });
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    component.download(attachment());
    await Promise.resolve();
    await Promise.resolve();

    expect(downloadBlobSpy).toHaveBeenCalledWith(1);
    expect(triggerSpy).toHaveBeenCalledWith(blob, 'comprovante.pdf');
    expect(component.downloadingId()).toBeNull();
  });

  it('shows a confirmation toast when the file was saved natively (no share prompt)', async () => {
    const blob = new Blob(['conteudo']);
    downloadBlobSpy.mockReturnValue(of(blob));
    triggerSpy.mockResolvedValue({ savedNatively: true });
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    component.download(attachment());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(triggerSpy).toHaveBeenCalledWith(blob, 'comprovante.pdf');
    expect(component.downloadingId()).toBeNull();
  });

  it('clears the busy state (without calling DownloadFileService) when the HTTP download fails', async () => {
    downloadBlobSpy.mockReturnValue(throwError(() => ({ status: 404, error: { detail: 'Anexo não encontrado' } })));
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    component.download(attachment());
    await Promise.resolve();

    expect(triggerSpy).not.toHaveBeenCalled();
    expect(component.downloadingId()).toBeNull();
  });

  it('clears the busy state when saving/opening the downloaded file fails (e.g. native share sheet rejected)', async () => {
    downloadBlobSpy.mockReturnValue(of(new Blob(['conteudo'])));
    triggerSpy.mockRejectedValue(new Error('falha ao compartilhar'));
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    component.download(attachment());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.downloadingId()).toBeNull();
  });

  it('shows the empty state when there are no attachments', () => {
    const fixture = createComponent([]);
    expect(fixture.nativeElement.textContent).toContain('Nenhum anexo.');
  });
});
