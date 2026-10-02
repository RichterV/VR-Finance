import { httpErrorMessage } from './http-error';

describe('httpErrorMessage', () => {
  it('prefers the backend detail', () => {
    expect(httpErrorMessage({ status: 400, error: { detail: 'Data fora da faixa' } }, 'Erro')).toBe('Data fora da faixa');
  });

  it('explains a connection failure', () => {
    expect(httpErrorMessage({ status: 0 }, 'Erro')).toContain('Sem conexão');
  });

  it('falls back for validation lists and unknown errors', () => {
    expect(httpErrorMessage({ status: 422, error: { detail: [{ msg: 'x' }] } }, 'Erro ao salvar.')).toBe('Erro ao salvar.');
    expect(httpErrorMessage(null, 'Erro ao salvar.')).toBe('Erro ao salvar.');
  });
});
