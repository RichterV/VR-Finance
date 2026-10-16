import { RecordRow, RecordSource, monthsAround, pickSuggestions } from './record-sources.service';

const source = { type: 'gasto', label: 'Gasto' } as RecordSource;

function row(key: string, date: string, value: number | null): RecordRow {
  return { source, key, entityId: key, date, title: key, meta: '', value, record: {} };
}

describe('monthsAround', () => {
  it('dois meses pra trás até o seguinte, virando o ano', () => {
    expect(monthsAround(new Date(2026, 0, 15))).toEqual([
      { ano: 2025, mes: 11 },
      { ano: 2025, mes: 12 },
      { ano: 2026, mes: 1 },
      { ano: 2026, mes: 2 },
    ]);
  });
});

describe('pickSuggestions', () => {
  const today = new Date(2026, 9, 12);

  it('só o mesmo valor (em centavos), dentro da janela, mais perto de hoje primeiro', () => {
    const rows = [
      row('antigo', '2026-07-01', 187.45),
      row('longe', '2026-09-01', 187.45),
      row('perto', '2026-10-11', 187.45),
      row('outro-valor', '2026-10-11', 187.46),
      row('sem-valor', '2026-10-11', null),
      row('futuro-ok', '2026-11-20', 187.45),
      row('futuro-demais', '2026-12-01', 187.45),
    ];
    expect(pickSuggestions(rows, 187.45, today).map((r) => r.key)).toEqual(['perto', 'futuro-ok', 'longe']);
  });

  it('parcelas do mesmo grupo viram uma sugestão só (a mais perto de hoje)', () => {
    const rows = [row('g1', '2026-09-12', 100), row('g1', '2026-10-12', 100), row('g1', '2026-11-12', 100)];
    const result = pickSuggestions(rows, 100, today);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-10-12');
  });

  it('no máximo 5', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`r${i}`, `2026-10-0${i + 1}`, 10));
    expect(pickSuggestions(rows, 10, today)).toHaveLength(5);
  });
});
