import { DestroyRef } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';

import { SectionLoader } from './section-loader';

describe('SectionLoader', () => {
  const destroyRef = { onDestroy: () => () => {} } as unknown as DestroyRef;

  it('goes from loading to ready and reports settled', () => {
    const settled = vi.fn();
    const loader = new SectionLoader<number>(destroyRef, settled);
    expect(loader.state()).toBe('loading');
    loader.load(of(42));
    expect(loader.state()).toBe('ready');
    expect(loader.data()).toBe(42);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('turns into an error state instead of loading forever', () => {
    const settled = vi.fn();
    const loader = new SectionLoader<number>(destroyRef, settled);
    loader.load(throwError(() => new Error('500')));
    expect(loader.state()).toBe('error');
    expect(settled).toHaveBeenCalled();
  });

  it('keeps the previous data while reloading and ignores a stale response', () => {
    const loader = new SectionLoader<number>(destroyRef);
    loader.load(of(1));
    const slow = new Subject<number>();
    loader.load(slow);
    expect(loader.state()).toBe('ready'); // não volta pro esqueleto
    loader.load(of(3));
    slow.next(2); // a requisição antiga foi cancelada
    expect(loader.data()).toBe(3);
  });
});
