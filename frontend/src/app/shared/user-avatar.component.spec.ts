import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AvatarService } from '../core/avatar.service';
import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  const avatars = { url: vi.fn(() => of('blob:foto')) };

  beforeEach(() => {
    avatars.url.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: AvatarService, useValue: avatars }] });
  });

  function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(UserAvatarComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the initials when there is no photo', () => {
    const el = render({ initials: 'AS', version: null });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('AS');
    expect(avatars.url).not.toHaveBeenCalled();
  });

  it('shows nothing without photo and without initials (admin list)', () => {
    const el = render({ version: null });
    expect(el.textContent?.trim()).toBe('');
  });

  it('shows the photo for the given user and version', () => {
    const el = render({ userId: 5, version: 99, initials: 'AS', size: 28 });
    expect(avatars.url).toHaveBeenCalledWith(5, 99);
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:foto');
    expect(img.style.width).toBe('28px');
  });
});
