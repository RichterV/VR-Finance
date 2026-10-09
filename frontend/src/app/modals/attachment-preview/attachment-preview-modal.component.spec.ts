import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { ModalController, ToastController, provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { Attachment, AttachmentsService } from '../../services/attachments.service';
import { DownloadFileService } from '../../shared/download-file.service';
import { PdfPasswordError, PdfPreviewService } from '../../shared/pdf-preview.service';
import { AttachmentPreviewModalComponent, resetRememberedPdfPassword } from './attachment-preview-modal.component';

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

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function touchEvent(points: Array<{ clientX: number; clientY: number }>): TouchEvent {
  return { touches: points, preventDefault: vi.fn() } as unknown as TouchEvent;
}

describe('AttachmentPreviewModalComponent', () => {
  let downloadBlobSpy: ReturnType<typeof vi.fn>;
  let triggerSpy: ReturnType<typeof vi.fn>;
  let shareSpy: ReturnType<typeof vi.fn>;
  let toastCreateSpy: ReturnType<typeof vi.fn>;
  let renderPagesSpy: ReturnType<typeof vi.fn>;

  function createComponent(file: Attachment) {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AttachmentsService, useValue: { downloadBlob: downloadBlobSpy } },
        { provide: DownloadFileService, useValue: { trigger: triggerSpy, shareAttachment: shareSpy, canShareAttachment: () => true } },
        { provide: PdfPreviewService, useValue: { renderPagesAsDataUrls: renderPagesSpy } },
        { provide: ToastController, useValue: { create: toastCreateSpy } },
        { provide: ModalController, useValue: { dismiss: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AttachmentPreviewModalComponent);
    fixture.componentRef.setInput('file', file);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    triggerSpy = vi.fn().mockResolvedValue({ savedNatively: false });
    shareSpy = vi.fn().mockResolvedValue({ shared: true });
    toastCreateSpy = vi.fn().mockResolvedValue({ present: vi.fn() });
    renderPagesSpy = vi.fn().mockResolvedValue(['data:image/png;base64,pagina1']);
    resetRememberedPdfPassword();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the blob and exposes a preview URL for an image attachment, without calling PdfPreviewService', async () => {
    downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
    const fixture = createComponent(attachment({ content_type: 'image/png', original_filename: 'foto.png' }));
    const component = fixture.componentInstance;
    await flushMicrotasks();

    expect(downloadBlobSpy).toHaveBeenCalledWith(1);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
    expect(component.blobPreviewUrl()).not.toBeNull();
    expect(component.isImage).toBe(true);
    expect(component.isPdf).toBe(false);
    expect(renderPagesSpy).not.toHaveBeenCalled();
  });

  describe('on the web (not a native platform)', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    });

    it('embeds a PDF via an iframe blob URL, without calling PdfPreviewService', async () => {
      const blob = new Blob(['conteudo'], { type: 'application/pdf' });
      downloadBlobSpy = vi.fn().mockReturnValue(of(blob));
      const fixture = createComponent(attachment());
      const component = fixture.componentInstance;
      await flushMicrotasks();

      expect(component.isPdfViaIframe).toBe(true);
      expect(component.isPdfViaCanvas).toBe(false);
      expect(component.blobPreviewUrl()).not.toBeNull();
      expect(component.errorMessage()).toBeNull();
      expect(renderPagesSpy).not.toHaveBeenCalled();
    });
  });

  describe('on the native Android app', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    });

    it('renders a PDF attachment into pages via PdfPreviewService (no embedded PDF viewer in the WebView)', async () => {
      const blob = new Blob(['conteudo'], { type: 'application/pdf' });
      downloadBlobSpy = vi.fn().mockReturnValue(of(blob));
      const fixture = createComponent(attachment());
      const component = fixture.componentInstance;
      await flushMicrotasks();

      expect(renderPagesSpy).toHaveBeenCalledWith(blob, undefined);
      expect(component.isPdfViaCanvas).toBe(true);
      expect(component.isPdfViaIframe).toBe(false);
      expect(component.pdfPages()).toEqual(['data:image/png;base64,pagina1']);
      expect(component.errorMessage()).toBeNull();
    });

    it('shows an error message when PdfPreviewService renders no pages', async () => {
      downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'application/pdf' })));
      renderPagesSpy.mockResolvedValue([]);
      const fixture = createComponent(attachment());
      const component = fixture.componentInstance;
      await flushMicrotasks();

      expect(component.pdfPages()).toEqual([]);
      expect(component.errorMessage()).not.toBeNull();
    });

    describe('password-protected PDF (ex: nota de corretagem)', () => {
      const blob = new Blob(['conteudo'], { type: 'application/pdf' });
      /** Abre só com "123". */
      const renderWithPassword = (_blob: Blob, password?: string) =>
        password === '123'
          ? Promise.resolve(['data:image/png;base64,pagina1'])
          : Promise.reject(new PdfPasswordError(password !== undefined));

      beforeEach(() => {
        downloadBlobSpy = vi.fn().mockReturnValue(of(blob));
        renderPagesSpy.mockImplementation(renderWithPassword);
      });

      it('asks for the password instead of showing the generic error', async () => {
        const fixture = createComponent(attachment());
        const component = fixture.componentInstance;
        await flushMicrotasks();
        fixture.detectChanges();

        expect(component.needsPassword()).toBe(true);
        expect(component.errorMessage()).toBeNull();
        expect(component.passwordError()).toBeNull();
        expect(fixture.nativeElement.querySelector('.pdf-password')).not.toBeNull();
      });

      it('warns about a wrong password and keeps asking', async () => {
        const fixture = createComponent(attachment());
        const component = fixture.componentInstance;
        await flushMicrotasks();

        component.password = '999';
        await component.unlock();

        expect(renderPagesSpy).toHaveBeenLastCalledWith(blob, '999');
        expect(component.needsPassword()).toBe(true);
        expect(component.passwordError()).toBe('Senha incorreta. Tente de novo.');
        expect(component.pdfPages()).toEqual([]);
      });

      it('renders the pages with the right password and reuses it for the next PDF', async () => {
        const fixture = createComponent(attachment());
        const component = fixture.componentInstance;
        await flushMicrotasks();

        component.password = '123';
        await component.unlock();

        expect(component.needsPassword()).toBe(false);
        expect(component.pdfPages()).toEqual(['data:image/png;base64,pagina1']);

        TestBed.resetTestingModule();
        renderPagesSpy.mockClear();
        const next = createComponent(attachment({ id: 2 })).componentInstance;
        await flushMicrotasks();

        expect(renderPagesSpy).toHaveBeenCalledWith(blob, '123');
        expect(next.needsPassword()).toBe(false);
        expect(next.pdfPages()).toEqual(['data:image/png;base64,pagina1']);
      });

      it('asks without an error message when the remembered password does not open this PDF', async () => {
        renderPagesSpy.mockImplementation((_b: Blob, password?: string) =>
          password === 'outra' ? Promise.resolve(['p']) : Promise.reject(new PdfPasswordError(password !== undefined)),
        );
        const first = createComponent(attachment()).componentInstance;
        await flushMicrotasks();
        first.password = 'outra';
        await first.unlock();

        TestBed.resetTestingModule();
        renderPagesSpy.mockImplementation(renderWithPassword);
        const next = createComponent(attachment({ id: 2 })).componentInstance;
        await flushMicrotasks();

        expect(renderPagesSpy).toHaveBeenLastCalledWith(blob, 'outra');
        expect(next.needsPassword()).toBe(true);
        expect(next.passwordError()).toBeNull();
      });
    });
  });

  it('shows an error message and disables downloading when fetching the blob fails', async () => {
    downloadBlobSpy = vi.fn().mockReturnValue(throwError(() => ({ status: 404 })));
    const fixture = createComponent(attachment());
    const component = fixture.componentInstance;
    await flushMicrotasks();

    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).not.toBeNull();
    expect(component.hasBlob).toBe(false);
    expect(renderPagesSpy).not.toHaveBeenCalled();
  });

  describe('zoom', () => {
    it('zoomIn/zoomOut step by 0.5, clamped between 1 (min) and 4 (max)', () => {
      downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
      const fixture = createComponent(attachment({ content_type: 'image/png' }));
      const component = fixture.componentInstance;

      component.zoomOut();
      expect(component.zoom()).toBe(1);

      component.zoomIn();
      component.zoomIn();
      expect(component.zoom()).toBe(2);

      for (let i = 0; i < 10; i++) component.zoomIn();
      expect(component.zoom()).toBe(4);

      component.zoomOut();
      expect(component.zoom()).toBe(3.5);
    });

    it('scales zoom proportionally to how far apart two fingers move during a pinch', () => {
      downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
      const fixture = createComponent(attachment({ content_type: 'image/png' }));
      const component = fixture.componentInstance;

      component.onTouchStart(
        touchEvent([
          { clientX: 0, clientY: 0 },
          { clientX: 100, clientY: 0 },
        ]),
      );
      const moveEvent = touchEvent([
        { clientX: 0, clientY: 0 },
        { clientX: 200, clientY: 0 },
      ]);
      component.onTouchMove(moveEvent);

      expect(moveEvent.preventDefault).toHaveBeenCalled();
      expect(component.zoom()).toBe(2);
    });

    it('ignores single-finger touch moves (leaves panning to native scroll)', () => {
      downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
      const fixture = createComponent(attachment({ content_type: 'image/png' }));
      const component = fixture.componentInstance;

      component.onTouchStart(touchEvent([{ clientX: 0, clientY: 0 }]));
      const moveEvent = touchEvent([{ clientX: 50, clientY: 0 }]);
      component.onTouchMove(moveEvent);

      expect(moveEvent.preventDefault).not.toHaveBeenCalled();
      expect(component.zoom()).toBe(1);
    });

    it('stops tracking the pinch once a finger lifts, so a later single-finger move does not resume zooming', () => {
      downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
      const fixture = createComponent(attachment({ content_type: 'image/png' }));
      const component = fixture.componentInstance;

      component.onTouchStart(
        touchEvent([
          { clientX: 0, clientY: 0 },
          { clientX: 100, clientY: 0 },
        ]),
      );
      component.onTouchEnd(touchEvent([{ clientX: 0, clientY: 0 }]));
      component.onTouchMove(touchEvent([{ clientX: 0, clientY: 0 }]));

      expect(component.zoom()).toBe(1);
    });

    describe('wheel', () => {
      function wheel(overrides: Partial<WheelEvent>): WheelEvent {
        return { deltaMode: 0, deltaX: 0, deltaY: -100, ctrlKey: false, shiftKey: false, clientX: 0, clientY: 0, preventDefault: vi.fn(), ...overrides } as unknown as WheelEvent;
      }

      async function imageComponent() {
        downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
        const fixture = createComponent(attachment({ content_type: 'image/png' }));
        await flushMicrotasks();
        fixture.detectChanges();
        const viewport = fixture.nativeElement.querySelector('.zoom-viewport') as HTMLElement;
        return { component: fixture.componentInstance, viewport };
      }

      describe('on the web', () => {
        beforeEach(() => vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false));

        it('zooms one step per mouse wheel click, in and out', async () => {
          const { component } = await imageComponent();
          const up = wheel({ deltaY: -100 });
          component.onWheel(up);
          expect(up.preventDefault).toHaveBeenCalled();
          expect(component.zoom()).toBe(1.5);

          component.onWheel(wheel({ deltaY: 100 }));
          expect(component.zoom()).toBe(1);
        });

        it('scrolls vertically on Ctrl+mouse wheel instead of zooming the page', async () => {
          const { component, viewport } = await imageComponent();
          const ctrl = wheel({ ctrlKey: true, deltaY: 100 });
          component.onWheel(ctrl);
          expect(ctrl.preventDefault).toHaveBeenCalled();
          expect(viewport.scrollTop).toBe(100);
          expect(component.zoom()).toBe(1);
        });

        it('leaves Shift+mouse wheel to native (horizontal) scrolling', async () => {
          const { component } = await imageComponent();
          const shift = wheel({ shiftKey: true });
          component.onWheel(shift);
          expect(shift.preventDefault).not.toHaveBeenCalled();
          expect(component.zoom()).toBe(1);
        });

        it('leaves two-finger trackpad scrolling native, but still zooms on trackpad pinch', async () => {
          const { component } = await imageComponent();
          const swipe = wheel({ deltaY: -4.5 });
          component.onWheel(swipe);
          expect(swipe.preventDefault).not.toHaveBeenCalled();
          expect(component.zoom()).toBe(1);

          const pinch = wheel({ ctrlKey: true, deltaY: -40.5 });
          component.onWheel(pinch);
          expect(pinch.preventDefault).toHaveBeenCalled();
          expect(component.zoom()).toBeGreaterThan(1);
        });
      });

      describe('on the native app', () => {
        beforeEach(() => vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true));

        it('keeps zoom on Ctrl+wheel only, leaving a plain wheel to native scrolling', async () => {
          const { component } = await imageComponent();
          const plain = wheel({});
          component.onWheel(plain);
          expect(plain.preventDefault).not.toHaveBeenCalled();
          expect(component.zoom()).toBe(1);

          const withCtrl = wheel({ ctrlKey: true });
          component.onWheel(withCtrl);
          expect(withCtrl.preventDefault).toHaveBeenCalled();
          expect(component.zoom()).toBeGreaterThan(1);
        });
      });
    });

    it('toggles between 2x and the original size on double click', () => {
      downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
      const component = createComponent(attachment({ content_type: 'image/png' })).componentInstance;
      const dblclick = { clientX: 10, clientY: 10 } as MouseEvent;

      component.onDoubleClick(dblclick);
      expect(component.zoom()).toBe(2);
      component.onDoubleClick(dblclick);
      expect(component.zoom()).toBe(1);
    });

    describe('mouse drag to pan', () => {
      function pointer(overrides: Partial<PointerEvent>): PointerEvent {
        return { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault: vi.fn(), ...overrides } as unknown as PointerEvent;
      }

      async function zoomedImage() {
        downloadBlobSpy = vi.fn().mockReturnValue(of(new Blob(['conteudo'], { type: 'image/png' })));
        const fixture = createComponent(attachment({ content_type: 'image/png' }));
        await flushMicrotasks();
        fixture.detectChanges();
        const component = fixture.componentInstance;
        component.zoomIn();
        component.zoomIn();
        const viewport = fixture.nativeElement.querySelector('.zoom-viewport') as HTMLElement;
        return { component, viewport };
      }

      it('scrolls the viewport opposite to the drag direction while the mouse button is held', async () => {
        const { component, viewport } = await zoomedImage();
        const scroll = { left: 200, top: 100 };
        Object.defineProperty(viewport, 'scrollLeft', { get: () => scroll.left, set: (v) => (scroll.left = v), configurable: true });
        Object.defineProperty(viewport, 'scrollTop', { get: () => scroll.top, set: (v) => (scroll.top = v), configurable: true });

        component.onPointerDown(pointer({ clientX: 50, clientY: 50 }));
        expect(component.dragging()).toBe(true);
        component.onPointerMove(pointer({ clientX: 80, clientY: 30 }));
        expect(scroll).toEqual({ left: 170, top: 120 });

        component.onPointerUp(pointer({}));
        expect(component.dragging()).toBe(false);
        component.onPointerMove(pointer({ clientX: 0, clientY: 0 }));
        expect(scroll).toEqual({ left: 170, top: 120 });
      });

      it('does not start a drag at the original size, or for touch (touch pans via native scroll)', async () => {
        const { component } = await zoomedImage();
        component.onPointerDown(pointer({ pointerType: 'touch' }));
        expect(component.dragging()).toBe(false);

        component.onDoubleClick({ clientX: 0, clientY: 0 } as MouseEvent); // volta pra 1x
        component.onPointerDown(pointer({}));
        expect(component.dragging()).toBe(false);
      });
    });
  });

  it('hands the already-fetched blob to DownloadFileService on download(), without fetching again', async () => {
    const blob = new Blob(['conteudo'], { type: 'application/pdf' });
    downloadBlobSpy = vi.fn().mockReturnValue(of(blob));
    const fixture = createComponent(attachment({ original_filename: 'comprovante.pdf' }));
    const component = fixture.componentInstance;
    await flushMicrotasks();

    await component.download();

    expect(triggerSpy).toHaveBeenCalledWith(blob, 'comprovante.pdf');
    expect(downloadBlobSpy).toHaveBeenCalledTimes(1);
    expect(component.downloading()).toBe(false);
  });

  it('shares the already-fetched blob on share(), without fetching again', async () => {
    const blob = new Blob(['conteudo'], { type: 'image/png' });
    downloadBlobSpy = vi.fn().mockReturnValue(of(blob));
    const component = createComponent(attachment({ content_type: 'image/png', original_filename: 'foto.png' })).componentInstance;
    await flushMicrotasks();

    await component.share();

    expect(shareSpy).toHaveBeenCalledWith(blob, 'foto.png');
    expect(downloadBlobSpy).toHaveBeenCalledTimes(1);
    expect(component.sharing()).toBe(false);
  });
});
