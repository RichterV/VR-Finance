import { maxLaunchDateIso, otherMonthLabel, todayIso } from './launch-date';

describe('launch-date', () => {
  it('formats today in local time', () => {
    expect(todayIso(new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29');
  });

  it('max is the last day of the next month', () => {
    expect(maxLaunchDateIso(new Date(2026, 8, 29))).toBe('2026-10-31');
    expect(maxLaunchDateIso(new Date(2026, 0, 31))).toBe('2026-02-28');
    expect(maxLaunchDateIso(new Date(2026, 11, 5))).toBe('2027-01-31');
  });

  it('labels only dates outside the current month', () => {
    const now = new Date(2026, 8, 29);
    expect(otherMonthLabel('2026-09-30', now)).toBeNull();
    expect(otherMonthLabel('2026-10-01', now)).toBe('Outubro/2026');
  });
});
