export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly column: string | null;
  readonly direction: SortDirection;
}

export const UNSORTED: SortState = { column: null, direction: 'asc' };

export function toggleSortState(state: SortState, column: string): SortState {
  if (state.column !== column) {
    return { column, direction: 'asc' };
  }
  return { column, direction: state.direction === 'asc' ? 'desc' : 'asc' };
}

/** Nulls always sort last, regardless of direction — only the non-null comparison flips with `dir`. */
function compareValues(a: unknown, b: unknown, dir: number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) * dir;
  }
  if (a < b) return -1 * dir;
  if (a > b) return 1 * dir;
  return 0;
}

export function sortItems<T>(
  items: readonly T[],
  state: SortState,
  accessor: (item: T, column: string) => unknown,
): T[] {
  if (!state.column) return [...items];
  const column = state.column;
  const dir = state.direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => compareValues(accessor(a, column), accessor(b, column), dir));
}
