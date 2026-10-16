import { linearTrend } from './linear-regression';

describe('linearTrend', () => {
  it('returns an empty array for no input', () => {
    expect(linearTrend([])).toEqual([]);
  });

  it('returns a flat line equal to the value for a single point', () => {
    expect(linearTrend([42])).toEqual([42]);
  });

  it('fits a flat line through constant values', () => {
    const result = linearTrend([10, 10, 10, 10]);
    result.forEach((v) => expect(v).toBeCloseTo(10));
  });

  it('fits an exact line through perfectly linear values', () => {
    const result = linearTrend([0, 10, 20, 30]);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(10);
    expect(result[2]).toBeCloseTo(20);
    expect(result[3]).toBeCloseTo(30);
  });

  it('smooths out noisy values into a monotonic trend', () => {
    const result = linearTrend([5, 20, 8, 25, 12]);
    expect(result[result.length - 1]).toBeGreaterThan(result[0]);
  });
});
