/** Least-squares linear fit over equally-spaced points (x = 0..n-1). Used to draw trend lines. */
export function linearTrend(values: number[]): number[] {
  const n = values.length;
  if (n === 0) {
    return [];
  }

  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((acc, v) => acc + v, 0);
  const sumXY = values.reduce((acc, v, i) => acc + i * v, 0);
  const sumXX = values.reduce((acc, _v, i) => acc + i * i, 0);

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return values.map((_v, i) => intercept + slope * i);
}
