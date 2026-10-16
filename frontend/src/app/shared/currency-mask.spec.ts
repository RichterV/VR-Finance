import { formatCurrencyValue, parseCentsInput } from './currency-mask';

describe('parseCentsInput', () => {
  it('interprets typed digits as cents, filling from the right', () => {
    expect(parseCentsInput('100')).toBe(1);
    expect(parseCentsInput('1256')).toBe(12.56);
    expect(parseCentsInput('5')).toBe(0.05);
  });

  it('ignores any non-digit characters (currency symbols, separators)', () => {
    expect(parseCentsInput('R$ 1.256,00')).toBe(1256);
    expect(parseCentsInput('abc')).toBe(0);
  });

  it('returns 0 for an empty string', () => {
    expect(parseCentsInput('')).toBe(0);
  });
});

describe('formatCurrencyValue', () => {
  it('formats using pt-BR comma decimal separator with 2 digits', () => {
    expect(formatCurrencyValue(1)).toBe('1,00');
    expect(formatCurrencyValue(12.5)).toBe('12,50');
    expect(formatCurrencyValue(1234.56)).toBe('1.234,56');
  });

  it('defaults null/undefined to zero', () => {
    expect(formatCurrencyValue(null)).toBe('0,00');
    expect(formatCurrencyValue(undefined)).toBe('0,00');
  });
});
