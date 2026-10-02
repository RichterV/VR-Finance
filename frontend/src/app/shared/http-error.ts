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
