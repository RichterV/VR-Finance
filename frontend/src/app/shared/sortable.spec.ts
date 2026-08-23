import { sortItems, toggleSortState, UNSORTED } from './sortable';

describe('toggleSortState', () => {
  it('starts ascending when a new column is clicked', () => {
    expect(toggleSortState(UNSORTED, 'value')).toEqual({ column: 'value', direction: 'asc' });
  });

  it('flips to descending on a second click of the same column', () => {
    const first = toggleSortState(UNSORTED, 'value');
    expect(toggleSortState(first, 'value')).toEqual({ column: 'value', direction: 'desc' });
  });

  it('flips back to ascending on a third click of the same column', () => {
    const asc = toggleSortState(UNSORTED, 'value');
    const desc = toggleSortState(asc, 'value');
    expect(toggleSortState(desc, 'value')).toEqual({ column: 'value', direction: 'asc' });
  });

  it('resets to ascending when switching to a different column', () => {
    const valueDesc = toggleSortState(toggleSortState(UNSORTED, 'value'), 'value');
    expect(toggleSortState(valueDesc, 'date')).toEqual({ column: 'date', direction: 'asc' });
  });
});

describe('sortItems', () => {
  interface Row {
    id: number;
    name: string | null;
    value: number;
  }

  const rows: Row[] = [
    { id: 1, name: 'Casa', value: 300 },
    { id: 2, name: 'alimentação', value: 100 },
    { id: 3, name: null, value: 200 },
  ];
  const accessor = (row: Row, column: string): unknown => (row as unknown as Record<string, unknown>)[column];

  it('returns items unchanged (but as a new array) when unsorted', () => {
    const result = sortItems(rows, UNSORTED, accessor);
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  it('sorts numbers ascending and descending', () => {
    expect(sortItems(rows, { column: 'value', direction: 'asc' }, accessor).map((r) => r.value)).toEqual([100, 200, 300]);
    expect(sortItems(rows, { column: 'value', direction: 'desc' }, accessor).map((r) => r.value)).toEqual([300, 200, 100]);
  });

  it('sorts strings case-insensitively using pt-BR locale', () => {
    const sorted = sortItems([rows[0], rows[1]], { column: 'name', direction: 'asc' }, accessor);
    expect(sorted.map((r) => r.name)).toEqual(['alimentação', 'Casa']);
  });

  it('pushes null/undefined values to the end regardless of direction', () => {
    const asc = sortItems(rows, { column: 'name', direction: 'asc' }, accessor);
    expect(asc[asc.length - 1].name).toBeNull();

    const desc = sortItems(rows, { column: 'name', direction: 'desc' }, accessor);
    expect(desc[desc.length - 1].name).toBeNull();
  });
});
