import { TestBed } from '@angular/core/testing';
import { ModalController, provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { AttachmentsPopoverComponent } from './attachments-popover.component';
import { attachmentFormatLabel } from './attachment-types';
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
  let shareSpy: ReturnType<typeof vi.fn>;
  let canShare: boolean;
  let modalCreateSpy: ReturnType<typeof vi.fn>;
  let modalPresentSpy: ReturnType<typeof vi.fn>;

  function createComponent(files: Attachment[]) {
    const downloadFileService = { trigger: triggerSpy, shareAttachment: shareSpy, canShareAttachment: () => canShare };
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AttachmentsService, useValue: { downloadBlob: downloadBlobSpy } },
        { provide: DownloadFileService, useValue: downloadFileService },
        { provide: ModalController, useValue: { create: modalCreateSpy } },
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
    shareSpy = vi.fn().mockResolvedValue({ shared: true });
    canShare = false;
    modalPresentSpy = vi.fn().mockResolvedValue(undefined);
    modalCreateSpy = vi.fn().mockResolvedValue({ present: modalPresentSpy });
  });

  it('downloads and hands the blob to DownloadFileService (web), clearing the busy state', async () => {
    const blob = new Blob(['conteudo']);
    downloadBlobSpy.mockReturnValue(of(blob));
    triggerSpy.mockResolvedValue({ savedNatively: false });
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    await component.download(attachment());

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

    await component.download(attachment());

    expect(triggerSpy).toHaveBeenCalledWith(blob, 'comprovante.pdf');
    expect(component.downloadingId()).toBeNull();
  });

  it('clears the busy state (without calling DownloadFileService) when the HTTP download fails', async () => {
    downloadBlobSpy.mockReturnValue(throwError(() => ({ status: 404, error: { detail: 'Anexo não encontrado' } })));
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    await component.download(attachment());

    expect(triggerSpy).not.toHaveBeenCalled();
    expect(component.downloadingId()).toBeNull();
  });

  it('clears the busy state when saving/opening the downloaded file fails (e.g. native share sheet rejected)', async () => {
    downloadBlobSpy.mockReturnValue(of(new Blob(['conteudo'])));
    triggerSpy.mockRejectedValue(new Error('falha ao compartilhar'));
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;

    await component.download(attachment());

    expect(component.downloadingId()).toBeNull();
  });

  it('shows the empty state when there are no attachments', () => {
    const fixture = createComponent([]);
    expect(fixture.nativeElement.textContent).toContain('Nenhum anexo.');
  });

  it('opens the preview modal with the clicked file', async () => {
    const fixture = createComponent([attachment()]);
    const component = fixture.componentInstance;
    const file = attachment();

    await component.preview(file);

    expect(modalCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ componentProps: { file } }),
    );
    expect(modalPresentSpy).toHaveBeenCalled();
  });

  describe('share button', () => {
    it('is hidden when sharing is not available (desktop browser)', () => {
      const fixture = createComponent([attachment()]);
      expect(fixture.nativeElement.querySelector('ion-button[aria-label="Compartilhar"]')).toBeNull();
    });

    it('is shown on mobile, and hands the fetched blob to DownloadFileService.shareAttachment', async () => {
      canShare = true;
      const blob = new Blob(['conteudo']);
      downloadBlobSpy.mockReturnValue(of(blob));
      const fixture = createComponent([attachment()]);
      expect(fixture.nativeElement.querySelector('ion-button[aria-label="Compartilhar"]')).not.toBeNull();

      await fixture.componentInstance.share(attachment());

      expect(shareSpy).toHaveBeenCalledWith(blob, 'comprovante.pdf');
      expect(fixture.componentInstance.downloadingId()).toBeNull();
    });

    it('does not open the share sheet when fetching the file fails', async () => {
      canShare = true;
      downloadBlobSpy.mockReturnValue(throwError(() => ({ status: 404 })));
      const fixture = createComponent([attachment()]);

      await fixture.componentInstance.share(attachment());

      expect(shareSpy).not.toHaveBeenCalled();
      expect(fixture.componentInstance.downloadingId()).toBeNull();
    });
  });

  it('shows the file format under the file icon of each attachment', () => {
    const fixture = createComponent([
      attachment({ id: 1 }),
      attachment({ id: 2, content_type: 'image/jpeg', original_filename: 'foto.jpeg' }),
    ]);
    const labels = [...fixture.nativeElement.querySelectorAll('.file-type span')].map((el: Element) => el.textContent?.trim());
    expect(labels).toEqual(['PDF', 'JPG']);
  });
});

describe('attachmentFormatLabel', () => {
  it('uses the validated content type, falling back to the file name extension', () => {
    expect(attachmentFormatLabel({ content_type: 'image/png', original_filename: 'sem-extensao' })).toBe('PNG');
    expect(attachmentFormatLabel({ content_type: 'application/octet-stream', original_filename: 'nota.xml' })).toBe('XML');
    expect(attachmentFormatLabel({ content_type: 'application/octet-stream', original_filename: 'nota' })).toBe('ARQUIVO');
  });
});
