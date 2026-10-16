/** Interprets typed digits as cents, right-to-left ("100" -> 1,00; "1256" -> 12,56). */
export function parseCentsInput(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  const cents = digits ? parseInt(digits, 10) : 0;
  return cents / 100;
}

export function formatCurrencyValue(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
