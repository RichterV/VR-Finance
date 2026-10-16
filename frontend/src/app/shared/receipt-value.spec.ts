import { detectDecimalStyle, extractReceiptValue, parseAmount, parseBrlAmount } from './receipt-value';

describe('parseBrlAmount', () => {
  it('lê milhar e centavos', () => {
    expect(parseBrlAmount('1.234,56')).toBe(1234.56);
    expect(parseBrlAmount('187,45')).toBe(187.45);
    expect(parseBrlAmount('0,00')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('lê o formato em inglês', () => {
    expect(parseAmount('1,234.56', 'en')).toBe(1234.56);
    expect(parseAmount('51.99', 'en')).toBe(51.99);
  });
});

describe('detectDecimalStyle', () => {
  it('decide pelo formato que mais aparece', () => {
    expect(detectDecimalStyle('Total R$51.99\nFee R$4.00\nCNPJ 11.444.777/0001-61')).toBe('en');
    expect(detectDecimalStyle('Valor R$ 187,45\nkm 31.20')).toBe('br');
  });

  it('sem valores, vai pelo idioma; na dúvida, brasileiro', () => {
    expect(detectDecimalStyle('Thank you for your payment, total due')).toBe('en');
    expect(detectDecimalStyle('')).toBe('br');
  });
});

describe('extractReceiptValue', () => {
  it('comprovante de Pix: rótulo e valor na mesma linha', () => {
    const text = [
      'Comprovante de pagamento',
      '03 MAR 2026 - 09:12:40',
      'Valor R$ 187,45',
      'Tipo de transferência Pix',
      'CNPJ 11222333000181',
      'Valor final R$ 187,45',
      'CNPJ 11.444.777/0001-61',
    ].join('\n');
    expect(extractReceiptValue(text)).toBe(187.45);
  });

  it('OCR com as colunas separadas: valor que mais se repete', () => {
    const text = [
      'Comprovante de',
      'pagamento',
      'Valor',
      'Tipo de transferência',
      'ID da transação',
      'R$ 187,45',
      'Pix',
      'Saldo disponível R$ 1.500,00',
      'Valor final',
      'R$ 187,45',
    ].join('\n');
    expect(extractReceiptValue(text)).toBe(187.45);
  });

  it('rótulo numa linha e o valor sozinho na seguinte', () => {
    expect(extractReceiptValue('Total pago\nR$ 1.299,90\nTarifa R$ 0,00')).toBe(1299.9);
  });

  it('prefere "Valor final" a outro valor rotulado', () => {
    expect(extractReceiptValue('Valor R$ 100,00\nDesconto R$ 10,00\nValor final R$ 90,00')).toBe(90);
  });

  it('rótulo sem R$', () => {
    expect(extractReceiptValue('Valor: 45,90\nData 10/10/2026')).toBe(45.9);
  });

  it('ignora tarifa zero e devolve null sem valor', () => {
    expect(extractReceiptValue('Tarifa R$ 0,00\nPix enviado')).toBeNull();
    expect(extractReceiptValue('')).toBeNull();
  });

  it('valor negativo de extrato vira positivo', () => {
    expect(extractReceiptValue('Valor - R$ 80,00')).toBe(80);
  });

  it('DANFE: rótulos numa linha, números sem R$ na de baixo, e o R$ só nos tributos', () => {
    const text = [
      'DANFE',
      'BASE DE CÁLCULO DO ICMS   VALOR DO ICMS   BASE DE CÁLCULO DO ICMS SUBSTITUIÇÃO   VALOR TOTAL DOS PRODUTOS',
      'VALOR DO FRETE   VALOR DO SEGURO   DESCONTO   VALOR DO IPI   VALOR TOTAL DA NOTA',
      '432,10   51,85   0,00   0,00   432,10',
      '0,00   0,00   0,00   0,00   432,10 0,00',
      'PESO 1   2,140   2,140',
      'PROD1   Caixa de som   12345678   UN   1   432,10   432,10   432,10   0,00 51,85   12,00   0,00',
      'Valor aproximado dos tributos (IBPT) R$160,20. Valores',
      'totais do ICMS Interestadual: DIFAL da UF destino R$21,60 + FCP R$0,00',
    ].join('\n');
    expect(extractReceiptValue(text)).toBe(432.1);
  });

  it('ignora saldo e desconto com R$', () => {
    expect(extractReceiptValue('Pix enviado\nR$ 40,00\nSaldo R$ 1.200,00\nDesconto R$ 5,00')).toBe(40);
  });

  it('recibo em inglês com R$ e ponto decimal (Uber)', () => {
    const text = [
      'Sep 11, 2026',
      'Thanks for riding, Fulano',
      'Total   R$51.99',
      'Trip fare   R$57.99',
      'Booking Fee   R$4.00',
      'Promotion   -R$10.00',
      'Payments',
      'Mastercard Credit ••••1234   R$51.99',
      'Comfort',
      '31.20 kilometers, 27 minutes',
      'Driver Total   R$53.66',
      'Service Fee   R$10.58',
      'Uber Total   -R$1.67',
      'Total amount includes Uber fees, taxes, and promotions when applicable',
      'ISS Uber   R$0.33',
    ].join('\n');
    expect(extractReceiptValue(text)).toBe(51.99);
  });

  it('fatura em inglês: total com imposto, não o subtotal nem o imposto', () => {
    const text = [
      'INVOICE',
      'Subtotal $1,180.00',
      'Sales Tax $94.40',
      'Total (incl. tax) $1,274.40',
      'Amount paid $1,274.40',
    ].join('\n');
    expect(extractReceiptValue(text)).toBe(1274.4);
  });

  it('OCR em inglês com rótulo e valor em linhas separadas, ignorando troco', () => {
    expect(extractReceiptValue('TOTAL:\n9.00\nCASH\n10.00\nCHANGE\n1.00')).toBe(9);
  });

  it('comprovante brasileiro com um número solto com ponto continua no formato brasileiro', () => {
    expect(extractReceiptValue('Valor R$ 1.250,00\nDistância 31.20 km\nValor final R$ 1.250,00')).toBe(1250);
  });
});
