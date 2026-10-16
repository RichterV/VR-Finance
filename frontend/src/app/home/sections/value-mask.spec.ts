import { maskChartOptions, maskCount, maskCurrency, maskPercent, maskPercentParen, maskWidth } from './value-mask';

describe('value-mask', () => {
  it('formats or hides currency, counts and percentages', () => {
    expect(maskCurrency(1234.5, false)).toContain('1.234,50');
    expect(maskCurrency(1234.5, true)).toBe('••••••');
    expect(maskCount(7, true)).toBe('••');
    expect(maskPercent(12.345, false)).toBe('12,3%');
    expect(maskPercentParen(25, 100, false)).toBe('(25,0%)');
    expect(maskPercentParen(25, 0, false)).toBe('(0,0%)');
    expect(maskWidth(80, true)).toBe(0);
  });

  it('removes axis ticks and tooltip only when hidden', () => {
    const base = { scales: { y: { ticks: { color: 'x' } } }, plugins: { tooltip: { enabled: true } } };
    expect(maskChartOptions(base, ['y'], false)).toBe(base);
    const hidden = maskChartOptions(base, ['y'], true) as any;
    expect(hidden.scales.y.ticks.callback()).toBe('');
    expect(hidden.plugins.tooltip.enabled).toBe(false);
  });
});
