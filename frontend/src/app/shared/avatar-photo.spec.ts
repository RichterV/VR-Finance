import { centerSquare } from './avatar-photo';

describe('centerSquare', () => {
  it('cuts the middle square of a landscape photo', () => {
    expect(centerSquare(1200, 800)).toEqual({ sx: 200, sy: 0, side: 800 });
  });

  it('cuts the middle square of a portrait photo', () => {
    expect(centerSquare(600, 1000)).toEqual({ sx: 0, sy: 200, side: 600 });
  });
});
