import { monthAxisLabels, monthTooltipTitle, yearBoundaries } from './month-axis';

describe('monthAxisLabels', () => {
  it('shows the year only on the first point and where the year changes', () => {
    const labels = monthAxisLabels([
      { ano: 2024, mes: 11 },
      { ano: 2024, mes: 12 },
      { ano: 2025, mes: 1 },
      { ano: 2025, mes: 2 },
    ]);
    expect(labels).toEqual([['Nov', '2024'], 'Dez', ['Jan', '2025'], 'Fev']);
  });

  it('handles an empty series', () => {
    expect(monthAxisLabels([])).toEqual([]);
  });
});

describe('yearBoundaries', () => {
  it('returns the indexes where a new year starts, skipping the first point', () => {
    expect(yearBoundaries([['Nov', '2024'], 'Dez', ['Jan', '2025'], 'Fev', ['Jan', '2026']])).toEqual([2, 4]);
  });

  it('is empty for labels without a year (other charts)', () => {
    expect(yearBoundaries(['2024', '2025'])).toEqual([]);
  });
});

describe('monthTooltipTitle', () => {
  const labels = [['Nov', '2024'], 'Dez', ['Jan', '2025'], 'Fev'];

  it('combines the month with the nearest year to the left', () => {
    expect(monthTooltipTitle(labels, 0)).toBe('Nov/2024');
    expect(monthTooltipTitle(labels, 1)).toBe('Dez/2024');
    expect(monthTooltipTitle(labels, 2)).toBe('Jan/2025');
    expect(monthTooltipTitle(labels, 3)).toBe('Fev/2025');
  });

  it('keeps the plain label when there is no year', () => {
    expect(monthTooltipTitle(['Essenciais', 'Receita'], 1)).toBe('Receita');
  });
});
