import { excluidoTexto, expiraTexto, tipoLabel } from './lixeira.utils';

describe('lixeira utils', () => {
  const agora = new Date(2026, 9, 13, 18, 0);

  it('expiraTexto conta dias de calendário até sumir', () => {
    expect(expiraTexto(new Date(2026, 9, 13, 23, 0).toISOString(), agora)).toBe('Some hoje');
    expect(expiraTexto(new Date(2026, 9, 14, 1, 0).toISOString(), agora)).toBe('Some amanhã');
    expect(expiraTexto(new Date(2026, 9, 28, 9, 0).toISOString(), agora)).toBe('Some em 15 dias');
    expect(expiraTexto(new Date(2026, 9, 12, 9, 0).toISOString(), agora)).toBe('Some hoje');
  });

  it('excluidoTexto diz quando foi excluído', () => {
    expect(excluidoTexto(new Date(2026, 9, 13, 8, 0).toISOString(), agora)).toBe('Excluído hoje');
    expect(excluidoTexto(new Date(2026, 9, 12, 23, 0).toISOString(), agora)).toBe('Excluído ontem');
    expect(excluidoTexto(new Date(2026, 9, 3, 12, 0).toISOString(), agora)).toBe('Excluído há 10 dias');
  });

  it('tipoLabel tem nome pra cada tipo e devolve a chave se não conhecer', () => {
    expect(tipoLabel('servico_veiculo')).toBe('Serviço de veículo');
    expect(tipoLabel('nota_fiscal')).toBe('Nota fiscal');
    expect(tipoLabel('xyz')).toBe('xyz');
  });
});
