import { httpBlobErrorMessage, httpErrorMessage } from './http-error';

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

describe('httpBlobErrorMessage', () => {
  it('reads the detail from a JSON blob (responseType blob)', async () => {
    const error = new Blob([JSON.stringify({ detail: 'Esse ano ainda não começou' })], { type: 'application/json' });
    expect(await httpBlobErrorMessage({ status: 400, error }, 'Erro')).toBe('Esse ano ainda não começou');
  });

  it('falls back when the blob is not JSON, and handles plain errors', async () => {
    expect(await httpBlobErrorMessage({ status: 500, error: new Blob(['<html>']) }, 'Erro ao gerar.')).toBe('Erro ao gerar.');
    expect(await httpBlobErrorMessage({ status: 0 }, 'Erro')).toContain('Sem conexão');
  });
});
