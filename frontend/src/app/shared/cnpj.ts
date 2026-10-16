/** CNPJ: máscara e dígitos verificadores -- espelha `cnpj_valido` do backend (app/empresa.py). */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** "11222333000181" (ou parcial) -> "11.222.333/0001-81", conforme o usuário digita. */
export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string, pesos: number[]) => {
    const resto = [...base].reduce((soma, n, i) => soma + Number(n) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = digito(cnpj.slice(0, 12), pesos1);
  const d2 = digito(cnpj.slice(0, 12) + d1, [6, ...pesos1]);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** CPF (11) ou CNPJ (14) formatado pra exibir; outro tamanho volta como veio. */
export function formatDocumento(doc: string | null | undefined): string {
  const d = onlyDigits(doc ?? '');
  if (d.length === 14) return formatCnpj(d);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return doc ?? '';
}
