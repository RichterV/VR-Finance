import { MAX_ZOOM, MIN_ZOOM, clampZoom, focalZoomScroll, touchDistance, touchMidpoint, isLikelyMouseWheel } from './pinch-zoom';

describe('clampZoom', () => {
  it('keeps values inside [MIN_ZOOM, MAX_ZOOM] unchanged', () => {
    expect(clampZoom(2)).toBe(2);
  });

  it('clamps values below MIN_ZOOM up to MIN_ZOOM', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
  });

  it('clamps values above MAX_ZOOM down to MAX_ZOOM', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
  });
});

describe('touchDistance', () => {
  it('returns 0 for two coincident points', () => {
    expect(touchDistance({ clientX: 10, clientY: 10 }, { clientX: 10, clientY: 10 })).toBe(0);
  });

  it('returns the straight-line distance between two points', () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });

  it('is symmetric regardless of point order', () => {
    const a = { clientX: 12, clientY: 40 };
    const b = { clientX: 100, clientY: 5 };
    expect(touchDistance(a, b)).toBe(touchDistance(b, a));
  });
});

describe('touchMidpoint', () => {
  it('returns the point halfway between two touches', () => {
    expect(touchMidpoint({ clientX: 0, clientY: 10 }, { clientX: 100, clientY: 30 })).toEqual({ clientX: 50, clientY: 20 });
  });
});

describe('focalZoomScroll', () => {
  it('keeps the content point under the focal point fixed when the content doubles', () => {
    // Ponto do conteúdo sob o foco: x = 100 + 50 = 150 (de 400), y = 0 + 100 = 100 (de 300).
    const before = { scrollLeft: 100, scrollTop: 0, scrollWidth: 400, scrollHeight: 300 };
    const result = focalZoomScroll(before, { scrollWidth: 800, scrollHeight: 600 }, { x: 50, y: 100 });
    // Depois de dobrar: o mesmo ponto fica em x = 300, y = 200 -- menos o foco dá o novo scroll.
    expect(result).toEqual({ left: 250, top: 100 });
  });

  it('never returns a negative scroll when zooming out near the top-left corner', () => {
    const before = { scrollLeft: 0, scrollTop: 0, scrollWidth: 800, scrollHeight: 600 };
    const result = focalZoomScroll(before, { scrollWidth: 400, scrollHeight: 300 }, { x: 300, y: 200 });
    expect(result).toEqual({ left: 0, top: 0 });
  });
});

describe('isLikelyMouseWheel', () => {
  it('treats line-mode events (Firefox) and big integer vertical steps (Chrome) as a mouse wheel', () => {
    expect(isLikelyMouseWheel({ deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe(true);
    expect(isLikelyMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: -100 })).toBe(true);
    expect(isLikelyMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: 120 })).toBe(true);
  });

  it('treats small, fractional or diagonal pixel deltas as a trackpad', () => {
    expect(isLikelyMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: 4 })).toBe(false);
    expect(isLikelyMouseWheel({ deltaMode: 0, deltaX: 0, deltaY: 57.5 })).toBe(false);
    expect(isLikelyMouseWheel({ deltaMode: 0, deltaX: 2, deltaY: 100 })).toBe(false);
  });
});
