import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../core/auth.service';
import { BackupStatusService } from '../services/backup-status.service';
import {
  BACKUP_WARNING_DURATION_MS,
  BackupWarningBannerComponent,
  resetBackupWarningSession,
} from './backup-warning-banner.component';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function createComponent(isMaster: boolean, checkResult: { last_backup_at: string | null }): ComponentFixture<BackupWarningBannerComponent> {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { isMaster } },
      { provide: BackupStatusService, useValue: { check: () => of(checkResult) } },
    ],
  });
  const fixture = TestBed.createComponent(BackupWarningBannerComponent);
  fixture.detectChanges();
  return fixture;
}

describe('BackupWarningBannerComponent', () => {
  beforeEach(() => resetBackupWarningSession());
  afterEach(() => vi.useRealTimers());

  it('never checks or shows anything for a non-master user', () => {
    const checkSpy = vi.fn(() => of({ last_backup_at: null }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isMaster: false } },
        { provide: BackupStatusService, useValue: { check: checkSpy } },
      ],
    });
    const fixture = TestBed.createComponent(BackupWarningBannerComponent);
    fixture.detectChanges();

    expect(checkSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it('shows the warning when a backup was never registered', () => {
    const fixture = createComponent(true, { last_backup_at: null });
    expect(fixture.componentInstance.visible()).toBe(true);
    expect(fixture.componentInstance.message()).toContain('Nenhum backup');
  });

  it('hides the warning when the last backup was less than 30 days ago', () => {
    const fixture = createComponent(true, { last_backup_at: daysAgoIso(10) });
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it('shows the warning when the last backup was exactly 30 days ago', () => {
    const fixture = createComponent(true, { last_backup_at: daysAgoIso(30) });
    expect(fixture.componentInstance.visible()).toBe(true);
    expect(fixture.componentInstance.message()).toContain('30 dias');
  });

  it('shows the warning when the last backup was more than 30 days ago', () => {
    const fixture = createComponent(true, { last_backup_at: daysAgoIso(45) });
    expect(fixture.componentInstance.visible()).toBe(true);
    expect(fixture.componentInstance.message()).toContain('45 dias');
  });

  it('hides the warning automatically after 5 seconds', () => {
    vi.useFakeTimers();
    const fixture = createComponent(true, { last_backup_at: daysAgoIso(45) });
    expect(fixture.componentInstance.visible()).toBe(true);
    vi.advanceTimersByTime(BACKUP_WARNING_DURATION_MS - 1);
    expect(fixture.componentInstance.visible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it('shows the warning only once per app session (not again when the layout is recreated)', () => {
    const first = createComponent(true, { last_backup_at: daysAgoIso(45) });
    expect(first.componentInstance.visible()).toBe(true);
    const second = TestBed.createComponent(BackupWarningBannerComponent);
    second.detectChanges();
    expect(second.componentInstance.visible()).toBe(false);
  });
});
