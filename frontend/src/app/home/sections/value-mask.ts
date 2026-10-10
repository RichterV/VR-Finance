/** Modo privacidade da Home (olho do header): helpers puros usados pelas seções do dashboard. */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PCT1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Valor em R$, mascarado no modo privacidade. */
export function maskCurrency(valor: number, oculto: boolean): string {
  return oculto ? '••••••' : BRL.format(valor);
}

/** Contagem simples (qtd. de gastos/receitas), mascarada no modo privacidade. */
export function maskCount(valor: number, oculto: boolean): string {
  return oculto ? '••' : String(valor);
}

/** Percentual com 1 casa ("12,5%"), mascarado no modo privacidade. */
export function maskPercent(valor: number, oculto: boolean): string {
  return oculto ? '••%' : `${PCT1.format(valor)}%`;
}

/** "(XX,X%)" de `valor` sobre `total` -- ao lado do valor de Essenciais/Não essenciais. */
export function maskPercentParen(valor: number, total: number, oculto: boolean): string {
  if (oculto) return '(••%)';
  return `(${PCT1.format(total ? (valor / total) * 100 : 0)}%)`;
}

/** Largura de barra -- zerada no modo privacidade pra não vazar proporções. */
export function maskWidth(largura: number, oculto: boolean): number {
  return oculto ? 0 : largura;
}

/**
 * Some com os ticks numéricos dos eixos de valor, desliga o tooltip e apaga os rótulos escritos no
 * gráfico (`directLabels`), no modo privacidade.
 */
export function maskChartOptions<T>(base: T, axisKeys: string[], oculto: boolean): T {
  if (!oculto) return base;
  const options = base as any;
  const scales: Record<string, any> = { ...(options.scales ?? {}) };
  for (const key of axisKeys) {
    if (scales[key]) {
      scales[key] = { ...scales[key], ticks: { ...scales[key].ticks, callback: () => '' } };
    }
  }
  return {
    ...options,
    scales,
    plugins: {
      ...options.plugins,
      tooltip: { ...(options.plugins?.tooltip ?? {}), enabled: false },
      directLabels: { items: [] },
    },
  } as T;
}
