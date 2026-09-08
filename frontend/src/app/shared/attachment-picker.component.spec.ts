import { TestBed } from '@angular/core/testing';
import { AlertController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { AttachmentPickerComponent } from './attachment-picker.component';

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array(10)], name, { type });
}

function fileEvent(files: File[]): Event {
  return { target: { files, value: '' } } as unknown as Event;
}

function pasteEvent(items: Array<{ type: string; file: File | null }>): ClipboardEvent {
  return {
    clipboardData: { items: items.map((i) => ({ type: i.type, getAsFile: () => i.file })) },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

function attachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: 1,
    entity_type: 'gasto',
    entity_id: '42',
    original_filename: 'existente.pdf',
    content_type: 'application/pdf',
    size_bytes: 1024,
    created_at: '2026-01-01T00:00:00',
    ...overrides,
  };
}

describe('AttachmentPickerComponent', () => {
  let uploadSpy: ReturnType<typeof vi.fn>;
  let listSpy: ReturnType<typeof vi.fn>;
  let removeSpy: ReturnType<typeof vi.fn>;
  let alertCreateSpy: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastAlertConfig: any;

  function createComponent(mode: 'create' | 'edit', entityId: string | number | null = null) {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AttachmentsService, useValue: { upload: uploadSpy, list: listSpy, remove: removeSpy } },
        { provide: AlertController, useValue: { create: alertCreateSpy } },
      ],
    });
    const fixture = TestBed.createComponent(AttachmentPickerComponent);
    fixture.componentRef.setInput('entityType', 'gasto');
    fixture.componentRef.setInput('entityId', entityId);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    uploadSpy = vi.fn();
    listSpy = vi.fn(() => of([]));
    removeSpy = vi.fn(() => of(undefined));
    lastAlertConfig = null;
    alertCreateSpy = vi.fn((config: unknown) => {
      lastAlertConfig = config;
      return Promise.resolve({ present: vi.fn().mockResolvedValue(undefined) });
    });
  });

  it('stages valid files without uploading in create mode', () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;

    component.onFilesSelected(fileEvent([makeFile('nota.pdf', 'application/pdf')]));

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(component.displayItems().map((i) => i.name)).toEqual(['nota.pdf']);
  });

  it('rejects an invalid file client-side without calling the API', () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;

    component.onFilesSelected(fileEvent([makeFile('nota.txt', 'text/plain')]));

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('nota.txt');
    expect(component.displayItems()).toEqual([]);
  });

  it('commit() uploads every staged file using the given entity id, reset() clears staging', () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;
    const file = makeFile('nota.pdf', 'application/pdf');
    component.onFilesSelected(fileEvent([file]));
    uploadSpy.mockReturnValue(of(attachment({})));

    component.commit(42).subscribe();

    expect(uploadSpy).toHaveBeenCalledWith('gasto', 42, file);

    component.reset();
    expect(component.displayItems()).toEqual([]);
  });

  it('commit() does nothing and emits no files when nothing was staged', () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;

    component.commit(42).subscribe((result) => expect(result).toEqual([]));
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('edit mode loads existing attachments on init', () => {
    listSpy.mockReturnValue(of([attachment({ id: 5, original_filename: 'comprovante.jpg' })]));
    const fixture = createComponent('edit', 42);

    expect(listSpy).toHaveBeenCalledWith('gasto', 42);
    expect(fixture.componentInstance.displayItems().map((i) => i.name)).toEqual(['comprovante.jpg']);
  });

  it('edit mode uploads immediately on file selection and appends to the list', () => {
    const fixture = createComponent('edit', 42);
    const component = fixture.componentInstance;
    const file = makeFile('nova.pdf', 'application/pdf');
    uploadSpy.mockReturnValue(of(attachment({ id: 9, original_filename: 'nova.pdf' })));
    let changed = 0;
    component.filesChanged.subscribe(() => changed++);

    component.onFilesSelected(fileEvent([file]));

    expect(uploadSpy).toHaveBeenCalledWith('gasto', 42, file);
    expect(component.displayItems().map((i) => i.name)).toEqual(['nova.pdf']);
    expect(changed).toBe(1);
  });

  it('removing an existing attachment asks for confirmation before calling the API', async () => {
    listSpy.mockReturnValue(of([attachment({ id: 5, original_filename: 'comprovante.jpg' })]));
    const fixture = createComponent('edit', 42);
    const component = fixture.componentInstance;
    let changed = 0;
    component.filesChanged.subscribe(() => changed++);

    await component.remove(component.displayItems()[0]);

    expect(alertCreateSpy).toHaveBeenCalled();
    expect(lastAlertConfig.message).toContain('comprovante.jpg');
    expect(lastAlertConfig.message).toContain('não pode ser desfeita');
    expect(removeSpy).not.toHaveBeenCalled();

    const confirmButton = lastAlertConfig.buttons.find((b: { role?: string }) => b.role === 'destructive');
    confirmButton.handler();

    expect(removeSpy).toHaveBeenCalledWith(5);
    expect(component.displayItems()).toEqual([]);
    expect(changed).toBe(1);
  });

  it('cancelling the confirmation keeps the attachment and never calls the API', async () => {
    listSpy.mockReturnValue(of([attachment({ id: 5, original_filename: 'comprovante.jpg' })]));
    const fixture = createComponent('edit', 42);
    const component = fixture.componentInstance;

    await component.remove(component.displayItems()[0]);

    expect(removeSpy).not.toHaveBeenCalled();
    expect(component.displayItems().map((i) => i.name)).toEqual(['comprovante.jpg']);
  });

  it('removing a not-yet-uploaded file skips the confirmation entirely', async () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;
    component.onFilesSelected(fileEvent([makeFile('nota.pdf', 'application/pdf')]));

    await component.remove(component.displayItems()[0]);

    expect(alertCreateSpy).not.toHaveBeenCalled();
    expect(component.displayItems()).toEqual([]);
  });

  it('pasting a copied image stages it in create mode and blocks the default paste', () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;
    const image = makeFile('image.png', 'image/png');
    const event = pasteEvent([{ type: 'image/png', file: image }]);

    component.onPaste(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(component.displayItems()).toHaveLength(1);
    expect(component.displayItems()[0].name).toMatch(/^colado-.*\.png$/);
  });

  it('pasting a copied image in edit mode uploads it immediately', () => {
    const fixture = createComponent('edit', 42);
    const component = fixture.componentInstance;
    uploadSpy.mockReturnValue(of(attachment({ id: 9, original_filename: 'colado.jpg' })));
    const image = makeFile('blob', 'image/jpeg');
    const event = pasteEvent([{ type: 'image/jpeg', file: image }]);

    component.onPaste(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledWith('gasto', 42, expect.objectContaining({ type: 'image/jpeg' }));
  });

  it('pasting plain text (no image item) is left untouched', () => {
    const fixture = createComponent('create');
    const component = fixture.componentInstance;
    const event = pasteEvent([{ type: 'text/plain', file: null }]);

    component.onPaste(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(component.displayItems()).toEqual([]);
  });

  it('shows the Ctrl+V hint outside the native app (web/desktop)', () => {
    const fixture = createComponent('create');

    expect(fixture.componentInstance.showPasteHint).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ctrl+V');
  });
});
