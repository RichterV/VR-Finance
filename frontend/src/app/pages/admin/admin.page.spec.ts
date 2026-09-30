import { formatLastActivity } from './admin.page';

describe('formatLastActivity', () => {
  it('mostra "Nunca" quando o usuário ainda não usou o app', () => {
    expect(formatLastActivity(null)).toBe('Nunca');
  });

  it('mostra "Nunca" para um valor inválido', () => {
    expect(formatLastActivity('não é data')).toBe('Nunca');
  });

  it('formata data e hora no horário local, respeitando o offset UTC', () => {
    const iso = '2026-09-28T17:05:00+00:00';
    const esperado = new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(formatLastActivity(iso)).toBe(esperado);
    expect(formatLastActivity(iso)).toMatch(/28\/09\/2026/);
  });
});
