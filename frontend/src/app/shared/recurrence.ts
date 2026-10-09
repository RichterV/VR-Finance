import { toIsoDate } from './launch-date';

/**
 * Datas de recorrência mensal. Espelha `occurrence_date` de `backend/app/recorrencias.py`: dia que
 * não existe no mês (31 em abril, 29-31 em fevereiro) cai no último dia do mês -- mesma regra das
 * parcelas. Quem gera os lançamentos de verdade é o backend.
 */
export const RECURRENCE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Data do lançamento no mês (`month` 1-12) para o dia escolhido. */
export function occurrenceDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
}

/** Próximo lançamento de uma recorrência cadastrada junto com um lançamento em `launchIso`: o mês seguinte. */
export function nextOccurrenceIso(launchIso: string, day: number): string {
  const [year, month] = launchIso.split('-').map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return toIsoDate(occurrenceDate(next.year, next.month, day));
}

/** Dia do mês de uma data `AAAA-MM-DD`. */
export function dayOfIso(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** "dd/mm/aaaa" a partir de `AAAA-MM-DD`. */
export function formatIsoBr(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function monthIndex(iso: string): number {
  const [year, month] = iso.split('-').map(Number);
  return year * 12 + (month - 1);
}

function isoFromMonthIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/** Último mês padrão ao ligar "Tem data de término": 12 lançamentos contando o cadastrado. */
export function defaultEndMonthIso(launchIso: string): string {
  return isoFromMonthIndex(monthIndex(launchIso) + 11);
}

/** O último mês precisa ser depois do mês do lançamento (senão a recorrência nunca geraria nada). */
export function isEndMonthValid(launchIso: string, endIso: string): boolean {
  return monthIndex(endIso) > monthIndex(launchIso);
}

/** Quantos lançamentos ao todo, contando o cadastrado e o do último mês. */
export function totalOccurrences(launchIso: string, endIso: string): number {
  return monthIndex(endIso) - monthIndex(launchIso) + 1;
}

/** `AAAA-MM-01` a partir de ano e mês (1-12). */
export function monthIso(year: number, month: number): string {
  return isoFromMonthIndex(year * 12 + (month - 1));
}
