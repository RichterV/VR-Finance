import { addMonthsIso } from './servico-casa-modal.component';

describe('addMonthsIso', () => {
  it('adds months keeping the day', () => {
    expect(addMonthsIso('2026-10-15', 3)).toBe('2027-01-15');
    expect(addMonthsIso('2026-10-15', 60)).toBe('2031-10-15');
  });

  it('falls back to the last day when the month is shorter', () => {
    expect(addMonthsIso('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonthsIso('2027-08-31', 6)).toBe('2028-02-29');
  });
});
