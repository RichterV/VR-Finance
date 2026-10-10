/**
 * Foto de perfil antes do envio: recorta um quadrado no centro, reduz pra AVATAR_UPLOAD_SIZE e
 * regrava em JPEG -- a foto da câmera tem vários MB e o servidor guarda 512px de qualquer jeito. Faz
 * também o HEIC virar JPEG quando o WebView sabe decodificá-lo (o servidor não lê HEIC). O servidor
 * normaliza de novo (e tira os metadados), então isto é só pra mandar pouco pela rede.
 */
export const AVATAR_UPLOAD_SIZE = 768;
const JPEG_QUALITY = 0.88;

/** Recorte quadrado central de uma imagem `width` x `height`. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

export async function prepareAvatarPhoto(file: File): Promise<Blob> {
  try {
    // imageOrientation: 'from-image' aplica a rotação do EXIF (foto em retrato não sai deitada)
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
    const out = Math.min(AVATAR_UPLOAD_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('falha ao gerar o JPEG');
    return blob;
  } catch {
    // Formato que o WebView não decodifica: manda o original e o servidor diz se aceita.
    return file;
  }
}
