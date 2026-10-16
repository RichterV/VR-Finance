import { buildCameraPhotoName, fitWithin, MAX_PHOTO_DIMENSION, shrinkPhoto } from './camera-photo';

describe('camera-photo', () => {
  it('builds a timestamped .jpg name', () => {
    expect(buildCameraPhotoName(new Date(2026, 8, 26, 14, 5, 9))).toBe('foto-2026-09-26_14-05-09.jpg');
  });

  it('fitWithin scales the longest side down to the limit, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_PHOTO_DIMENSION, height: 1920 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1920, height: MAX_PHOTO_DIMENSION });
  });

  it('fitWithin never upscales a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('shrinkPhoto falls back to the original bytes (renamed) when the image cannot be decoded', async () => {
    // jsdom não tem createImageBitmap -- mesmo caminho de um formato que o WebView não decodifica
    const original = new File([new Uint8Array(20)], 'IMG_0001.heic', { type: 'image/heic' });
    const result = await shrinkPhoto(original, new Date(2026, 0, 2, 3, 4, 5));
    expect(result.name).toBe('foto-2026-01-02_03-04-05.jpg');
    expect(result.type).toBe('image/heic');
    expect(result.size).toBe(20);
  });
});
