import { formatCnpj, formatDocumento, isValidCnpj, onlyDigits } from './cnpj';

describe('cnpj', () => {
  it('formats progressively while typing', () => {
    expect(formatCnpj('11')).toBe('11');
    expect(formatCnpj('112223')).toBe('11.222.3');
    expect(formatCnpj('112223330001')).toBe('11.222.333/0001');
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('11.222.333/0001-8199')).toBe('11.222.333/0001-81');
  });

  it('validates the check digits', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj(onlyDigits('11.444.777/0001-61'))).toBe(true);
  });

  it('formats CPF and CNPJ for display', () => {
    expect(formatDocumento('12345678909')).toBe('123.456.789-09');
    expect(formatDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocumento(null)).toBe('');
  });
});
