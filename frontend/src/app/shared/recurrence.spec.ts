import { toIsoDate } from './launch-date';
import {
  dayOfIso,
  defaultEndMonthIso,
  formatIsoBr,
  isEndMonthValid,
  monthIso,
  nextOccurrenceIso,
  occurrenceDate,
  totalOccurrences,
} from './recurrence';

describe('recurrence', () => {
  it('cai no último dia quando o mês não tem o dia escolhido', () => {
    expect(toIsoDate(occurrenceDate(2026, 11, 31))).toBe('2026-11-30');
    expect(toIsoDate(occurrenceDate(2027, 2, 31))).toBe('2027-02-28');
    expect(toIsoDate(occurrenceDate(2028, 2, 30))).toBe('2028-02-29'); // bissexto
    expect(toIsoDate(occurrenceDate(2026, 12, 31))).toBe('2026-12-31');
  });

  it('o próximo lançamento é no mês seguinte ao do cadastro', () => {
    expect(nextOccurrenceIso('2026-10-15', 15)).toBe('2026-11-15');
    expect(nextOccurrenceIso('2026-12-20', 31)).toBe('2027-01-31');
    expect(nextOccurrenceIso('2027-01-31', 31)).toBe('2027-02-28');
  });

  it('lê o dia e formata a data', () => {
    expect(dayOfIso('2026-10-07')).toBe(7);
    expect(formatIsoBr('2026-10-07')).toBe('07/10/2026');
  });

  it('data de término: padrão de 12 lançamentos, validação e contagem', () => {
    expect(defaultEndMonthIso('2026-10-15')).toBe('2027-09-01');
    expect(defaultEndMonthIso('2026-01-31')).toBe('2026-12-01');
    expect(isEndMonthValid('2026-10-15', '2026-10-01')).toBe(false);
    expect(isEndMonthValid('2026-10-15', '2026-11-01')).toBe(true);
    expect(totalOccurrences('2026-10-15', '2027-09-01')).toBe(12);
    expect(monthIso(2027, 3)).toBe('2027-03-01');
  });
});
