/** Espelha a whitelist do backend (app/routers/attachments.py, ALLOWED_CONTENT_TYPES/MAX_FILE_SIZE_BYTES). */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export function isAllowedAttachmentFile(file: File): boolean {
  return ALLOWED_ATTACHMENT_TYPES.includes(file.type) && file.size <= MAX_ATTACHMENT_SIZE_BYTES;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Extrai uma mensagem legível de um erro de HttpClient, pra diagnosticar falhas de upload em vez de um toast genérico. */
export function extractHttpErrorMessage(err: unknown): string {
  const httpErr = err as { status?: number; error?: { detail?: string }; message?: string } | null;
  if (httpErr?.error?.detail) return httpErr.error.detail;
  if (httpErr?.status === 0) return 'sem conexão com o servidor';
  if (httpErr?.status) return `erro ${httpErr.status}`;
  return httpErr?.message ?? 'erro desconhecido';
}
