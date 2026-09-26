/**
 * Foto tirada pela câmera do celular (botão de câmera do attachment-picker). A câmera entrega a
 * imagem em resolução cheia -- vários MB, e em alguns aparelhos acima do limite de 10MB do backend.
 * Pra comprovante não precisa disso: reduz pro maior lado caber em MAX_PHOTO_DIMENSION e regrava
 * em JPEG, o que costuma deixar a foto na casa de centenas de KB sem perder legibilidade.
 */
export const MAX_PHOTO_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;

export function buildCameraPhotoName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `foto-${day}_${time}.jpg`;
}

/** Dimensões finais mantendo a proporção -- nunca amplia uma imagem que já é menor que o limite. */
export function fitWithin(width: number, height: number, max: number = MAX_PHOTO_DIMENSION): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Reduz/recomprime a foto. Se o WebView não conseguir decodificar o formato (ex: HEIC) ou algo
 * falhar no canvas, devolve o arquivo original só com o nome padronizado -- a validação de
 * tipo/tamanho do picker decide depois se ele pode ser anexado.
 */
export async function shrinkPhoto(file: File, date: Date = new Date()): Promise<File> {
  const name = buildCameraPhotoName(date);
  try {
    // imageOrientation: 'from-image' aplica a rotação do EXIF (foto em retrato não sai deitada)
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('falha ao gerar o JPEG');
    // Só troca se de fato ficou menor (uma foto já pequena e bem comprimida pode crescer)
    if (blob.size >= file.size && file.type === 'image/jpeg') {
      return new File([file], name, { type: file.type });
    }
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return new File([file], name, { type: file.type });
  }
}
