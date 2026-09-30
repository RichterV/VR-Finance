import { MESES_COMPLETOS } from './months';

/**
 * Data de lançamento de um gasto/receita novo: hoje por padrão, ou qualquer dia de hoje até o
 * fim do mês seguinte. Espelha `resolve_launch_date`/`max_launch_date` de `backend/app/utils.py`
 * (quem garante a faixa de verdade é o backend). Datas sempre em `AAAA-MM-DD`, no fuso local.
 */
export function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** Último dia do mês seguinte a `now`. */
export function maxLaunchDateIso(now: Date = new Date()): string {
  // Dia 0 do mês +2 = último dia do mês +1.
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
}

/** "Outubro/2026" quando a data cai num mês diferente do atual; null se for o mês atual. */
export function otherMonthLabel(iso: string, now: Date = new Date()): string | null {
  const [year, month] = iso.split('-').map(Number);
  if (year === now.getFullYear() && month === now.getMonth() + 1) return null;
  return `${MESES_COMPLETOS[month - 1]}/${year}`;
}
