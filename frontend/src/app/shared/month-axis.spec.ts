import { monthAxisLabels, monthTicks, monthTooltipTitle, yearBoundaries } from './month-axis';

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

describe('monthTicks', () => {
  const meses = (n: number) =>
    monthAxisLabels(Array.from({ length: n }, (_, i) => ({ ano: 2023 + Math.floor((i + 10) / 12), mes: ((i + 10) % 12) + 1 })));

  it('leaves short windows to the automatic skipping', () => {
    expect(monthTicks(meses(12))).toEqual({});
  });

  it('always shows the labels that carry the year on long windows', () => {
    const labels = meses(36);
    const ticks = monthTicks(labels) as { autoSkip: boolean; callback: (v: unknown, i: number) => unknown };
    expect(ticks.autoSkip).toBe(false);
    labels.forEach((label, i) => {
      if (Array.isArray(label) && i > 0) expect(ticks.callback(null, i)).toEqual(label);
    });
  });

  it('drops the first label when a January is right next to it', () => {
    const labels = meses(36); // começa em novembro: janeiro é o índice 2
    const t = monthTicks(labels, true) as { callback: (v: unknown, i: number) => unknown };
    expect(t.callback(null, 0)).toBe('');
    expect(t.callback(null, 2)).toEqual(labels[2]);
  });

  it('shows fewer months between years on narrow screens', () => {
    const labels = meses(36);
    const count = (narrow: boolean) => {
      const t = monthTicks(labels, narrow) as { callback: (v: unknown, i: number) => unknown };
      return labels.filter((_, i) => t.callback(null, i) !== '').length;
    };
    expect(count(true)).toBeLessThan(count(false));
  });
});
