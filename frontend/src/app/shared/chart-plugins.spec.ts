import { PANEL_AXIS_WIDTH, fixedAxisWidth, formatMil } from './chart-plugins';

describe('formatMil', () => {
  it('formats short amounts for labels inside charts', () => {
    expect(formatMil(5856.38)).toBe('R$ 5,9 mil');
    expect(formatMil(-2700)).toBe('−R$ 2,7 mil');
    expect(formatMil(21800, true)).toBe('21,8 mil');
    expect(formatMil(5856.38, false, true)).toBe('+R$ 5,9 mil');
    expect(formatMil(-2700, false, true)).toBe('−R$ 2,7 mil');
  });
});

describe('fixedAxisWidth', () => {
  it('pins the y axis width so stacked panels line up', () => {
    const scale = { width: 31 };
    fixedAxisWidth(scale);
    expect(scale.width).toBe(PANEL_AXIS_WIDTH);
  });
});
