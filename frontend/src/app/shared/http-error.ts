/**
 * Mensagem pra mostrar ao usuário a partir de um erro do HttpClient: o `detail` que o backend
 * devolve (ex: "A data deve estar entre hoje e o fim do mês seguinte"), "sem conexão" quando nem
 * chegou no servidor, ou o texto genérico da tela. Detalhe de validação do Pydantic (422, uma lista)
 * não é legível -- cai no genérico.
 */
export function httpErrorMessage(err: unknown, fallback: string): string {
  const httpErr = err as { status?: number; error?: { detail?: unknown } } | null;
  const detail = httpErr?.error?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (httpErr?.status === 0) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return fallback;
}

function readBlobText(blob: Blob): Promise<string> {
  // FileReader em vez de Blob.text(): o jsdom dos testes não tem Blob.text().
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * Igual a `httpErrorMessage`, pra requisições com `responseType: 'blob'` (PDFs): aí o `detail` do
 * backend chega dentro de um Blob e precisa ser lido antes.
 */
export async function httpBlobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const httpErr = err as { status?: number; error?: unknown } | null;
  if (httpErr?.error instanceof Blob) {
    try {
      return httpErrorMessage({ status: httpErr.status, error: JSON.parse(await readBlobText(httpErr.error)) }, fallback);
    } catch {
      return httpErrorMessage({ status: httpErr.status }, fallback);
    }
  }
  return httpErrorMessage(err, fallback);
}
