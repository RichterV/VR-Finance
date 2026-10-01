/**
 * Câmera, seletor de arquivo e folha de compartilhar mandam o app pro segundo plano -- o retorno
 * logo depois não deve pedir digital (ver AppLockService). Estado solto de módulo, e não um
 * serviço, pra quem chama (anexos, downloads) não precisar arrastar a injeção do bloqueio junto.
 */
let expectedExitAt: number | null = null;

/** Chamar logo antes de abrir câmera, seletor de arquivo ou folha de compartilhar. */
export function markExpectedExternalActivity(): void {
  expectedExitAt = Date.now();
}

/** Horário da última saída esperada (ou null), zerando o registro -- vale pra um retorno só. */
export function consumeExpectedExit(): number | null {
  const value = expectedExitAt;
  expectedExitAt = null;
  return value;
}
