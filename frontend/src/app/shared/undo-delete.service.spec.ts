import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { UNDO_WINDOW_MS, UndoDeleteRequest, UndoDeleteService } from './undo-delete.service';

describe('UndoDeleteService', () => {
  let service: UndoDeleteService;
  let toastButtons: { handler: () => void }[];
  let createToast: ReturnType<typeof vi.fn>;

  function request(overrides: Partial<UndoDeleteRequest> = {}) {
    return {
      message: 'Gasto excluído.',
      hide: vi.fn(),
      restore: vi.fn(),
      commit: vi.fn(() => of(null)),
      onCommitted: vi.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    toastButtons = [];
    createToast = vi.fn((config: { buttons?: { handler: () => void }[] }) => {
      if (config.buttons) toastButtons.push(...config.buttons);
      return Promise.resolve({ present: vi.fn(), dismiss: vi.fn() });
    });
    TestBed.configureTestingModule({ providers: [{ provide: ToastController, useValue: { create: createToast } }] });
    service = TestBed.inject(UndoDeleteService);
  });

  afterEach(() => vi.useRealTimers());

  it('hides right away and deletes only after the window', () => {
    const req = request();
    service.schedule(req);
    expect(req.hide).toHaveBeenCalled();
    expect(req.commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(req.commit).toHaveBeenCalledTimes(1);
    expect(req.onCommitted).toHaveBeenCalled();
  });

  it('undo restores and never deletes', async () => {
    const req = request();
    service.schedule(req);
    await Promise.resolve();
    toastButtons[0].handler();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    expect(req.restore).toHaveBeenCalled();
    expect(req.commit).not.toHaveBeenCalled();
  });

  it('restores the item if the delete fails', async () => {
    const req = request({ commit: vi.fn(() => throwError(() => ({ status: 500 }))) });
    service.schedule(req);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(req.restore).toHaveBeenCalled();
    expect(req.onCommitted).not.toHaveBeenCalled();
  });

  it('flushAll deletes pending items immediately, once', () => {
    const a = request();
    const b = request();
    service.schedule(a);
    service.schedule(b);
    service.flushAll();
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(b.commit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UNDO_WINDOW_MS);
    expect(a.commit).toHaveBeenCalledTimes(1);
    expect(service.hasPending).toBe(false);
  });
});
