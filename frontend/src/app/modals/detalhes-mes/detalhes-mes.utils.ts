import { Gasto } from '../../services/gastos.service';
import { IndicadorMensal } from '../../services/notificacoes.service';
import { ComposicaoGastos } from '../../services/resumo.service';

/** Filtros da lista de lançamentos (chips). Vários ligados = precisa atender a todos. */
export type FiltroGasto = 'essencial' | 'nao_essencial' | 'parcelado' | 'recorrente' | 'anexo';
export type ModoLista = 'categoria' | 'valor' | 'data';

/** Sentido "bom" de cada indicador: gasto subir é ruim, receita subir é bom; caixa pretendido é neutro. */
export type Sentido = 'menor-melhor' | 'maior-melhor' | 'neutro';
export type Tom = 'bom' | 'ruim' | 'neutro';

const PCT0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "↑ 12% vs média" / "Igual à média" / "Sem histórico pra comparar". */
export function variacaoTexto(ind: Pick<IndicadorMensal, 'media' | 'variacao_pct'>): string {
  if (ind.media === null) return 'Sem histórico pra comparar';
  if (ind.variacao_pct === null) return ind.media === 0 ? 'Novo neste mês' : 'Sem comparação';
  if (Math.abs(ind.variacao_pct) < 1) return 'Igual à média';
  return `${ind.variacao_pct > 0 ? '↑' : '↓'} ${PCT0.format(Math.abs(ind.variacao_pct))}% vs média`;
}

/** "R$ 300 acima da média" -- pra valores que podem ser negativos (disponível, caixa real), onde % confunde. */
export function diferencaTexto(ind: Pick<IndicadorMensal, 'valor' | 'media'>, formatar: (v: number) => string): string {
  if (ind.media === null) return 'Sem histórico pra comparar';
  const diferenca = ind.valor - ind.media;
  if (Math.abs(diferenca) < 1) return 'Igual à média';
  return `${diferenca > 0 ? '↑' : '↓'} ${formatar(Math.abs(diferenca))} ${diferenca > 0 ? 'acima' : 'abaixo'} da média`;
}

/** Tom pela diferença absoluta (mesma regra de variacaoTom, sem depender de %). */
export function diferencaTom(ind: Pick<IndicadorMensal, 'valor' | 'media'>, sentido: Sentido): Tom {
  return ind.media === null ? 'neutro' : variacaoTom(ind.valor - ind.media, sentido);
}

export function variacaoTom(variacao: number | null, sentido: Sentido): Tom {
  if (variacao === null || Math.abs(variacao) < 1 || sentido === 'neutro') return 'neutro';
  const subiu = variacao > 0;
  return (subiu && sentido === 'maior-melhor') || (!subiu && sentido === 'menor-melhor') ? 'bom' : 'ruim';
}

export function aplicaFiltros(gastos: Gasto[], filtros: ReadonlySet<FiltroGasto>, comAnexo: ReadonlySet<string>, categoria: number | null): Gasto[] {
  return gastos.filter((g) => {
    if (categoria !== null && g.item_id !== categoria) return false;
    if (filtros.has('essencial') && g.priority !== 'essencial') return false;
    if (filtros.has('nao_essencial') && g.priority !== 'nao_essencial') return false;
    if (filtros.has('parcelado') && !g.is_installment) return false;
    if (filtros.has('recorrente') && !g.recorrencia_id) return false;
    if (filtros.has('anexo') && !comAnexo.has(chaveAnexo(g))) return false;
    return true;
  });
}

/** Chave do anexo: grupo de parcelamento quando existe (mesma convenção do upload). */
export function chaveAnexo(g: Gasto): string {
  return g.installment_group_id ?? String(g.id);
}

export interface GrupoCategoria {
  itemId: number;
  nome: string;
  total: number;
  gastos: Gasto[];
}

/** Agrupa por categoria, maior subtotal primeiro; dentro do grupo, maior valor primeiro. */
export function agruparPorCategoria(gastos: Gasto[]): GrupoCategoria[] {
  const grupos = new Map<number, GrupoCategoria>();
  for (const g of gastos) {
    const grupo = grupos.get(g.item_id) ?? { itemId: g.item_id, nome: g.item_name, total: 0, gastos: [] };
    grupo.total += g.value;
    grupo.gastos.push(g);
    grupos.set(g.item_id, grupo);
  }
  return [...grupos.values()]
    .map((grupo) => ({ ...grupo, total: Math.round(grupo.total * 100) / 100, gastos: [...grupo.gastos].sort((a, b) => b.value - a.value) }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export function ordenar(gastos: Gasto[], modo: 'valor' | 'data'): Gasto[] {
  return [...gastos].sort((a, b) => (modo === 'valor' ? b.value - a.value : b.date.localeCompare(a.date) || b.value - a.value));
}

/** Posição (1, 2, 3) dos 3 maiores gastos do mês, por id. */
export function ranking(gastos: Gasto[]): Map<number, number> {
  return new Map(
    [...gastos]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((g, i) => [g.id, i + 1]),
  );
}

/** Gastos com data depois de hoje, em ordem de data. */
export function programados(gastos: Gasto[], hojeIso: string): Gasto[] {
  return gastos.filter((g) => g.date > hojeIso).sort((a, b) => a.date.localeCompare(b.date) || b.value - a.value);
}

export interface Segmento {
  chave: string;
  rotulo: string;
  valor: number;
  pct: number;
}

/** Fatias da composição do gasto (só as que têm valor), em % do total. */
export function segmentosComposicao(c: ComposicaoGastos): Segmento[] {
  const partes: [string, string, number][] = [
    ['recorrentes', 'Recorrentes', c.recorrentes],
    ['parcelas', 'Parcelas', c.parcelas],
    ['essenciais', 'Avulsos essenciais', c.avulsos_essenciais],
    ['nao-essenciais', 'Avulsos não essenciais', c.avulsos_nao_essenciais],
  ];
  const total = partes.reduce((acc, [, , v]) => acc + v, 0);
  return partes
    .filter(([, , v]) => v > 0)
    .map(([chave, rotulo, valor]) => ({ chave, rotulo, valor, pct: total ? (valor / total) * 100 : 0 }));
}

export interface UsoReceita {
  gastosPct: number;
  caixaPct: number;
  livrePct: number;
  /** Quanto gastos + caixa passaram da receita (em % da receita); 0 se não passaram. */
  excessoPct: number;
}

/** Quanto da receita foi pra gastos, pra caixa e quanto sobra. Null sem receita no mês. */
export function usoDaReceita(receita: number, gastos: number, caixa: number): UsoReceita | null {
  if (receita <= 0) return null;
  const gastosPct = (gastos / receita) * 100;
  const caixaPct = (caixa / receita) * 100;
  const soma = gastosPct + caixaPct;
  if (soma <= 100) return { gastosPct, caixaPct, livrePct: 100 - soma, excessoPct: 0 };
  // Passou da receita: as fatias são escaladas pra caber na barra, e o excesso vira aviso.
  return { gastosPct: (gastosPct / soma) * 100, caixaPct: (caixaPct / soma) * 100, livrePct: 0, excessoPct: soma - 100 };
}
