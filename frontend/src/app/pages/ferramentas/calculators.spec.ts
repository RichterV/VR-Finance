import { aliquotaIrPorPrazo, calcularJurosCompostos, calcularVistaVsPrazo } from './calculators';

describe('calcularJurosCompostos', () => {
  it('matches a hand-computed 2-month projection without aporte growth', () => {
    // taxaMensal = (1.12)^(1/12) - 1 ≈ 0.0094888...
    // mês 1: saldo = 1000 * (1+tm) + 100
    // mês 2: saldo = saldo1 * (1+tm) + 100
    const tm = Math.pow(1.12, 1 / 12) - 1;
    const saldo1 = 1000 * (1 + tm) + 100;
    const saldo2 = saldo1 * (1 + tm) + 100;

    const resultado = calcularJurosCompostos({
      valorInicial: 1000,
      taxaAnualPct: 12,
      aporteMensalInicial: 100,
      crescimentoAnualAportePct: 0,
      anos: 2 / 12,
    });

    expect(resultado.valorAcumulado).toBeCloseTo(saldo2, 6);
    expect(resultado.totalInvestido).toBeCloseTo(1200, 6);
    expect(resultado.rendimento).toBeCloseTo(saldo2 - 1200, 6);
    expect(resultado.taxaMensalEquivalentePct).toBeCloseTo(tm * 100, 6);
  });

  it('grows the aporte once per full year, not before month 12', () => {
    const resultado = calcularJurosCompostos({
      valorInicial: 0,
      taxaAnualPct: 0,
      aporteMensalInicial: 100,
      crescimentoAnualAportePct: 10,
      anos: 1,
    });

    // Sem rendimento (taxa 0%), total investido = 12 aportes de 100 -- o reajuste só vale a
    // partir do 13º mês, então o ano 1 inteiro usa o aporte original.
    expect(resultado.totalInvestido).toBeCloseTo(1200, 6);
    expect(resultado.valorAcumulado).toBeCloseTo(1200, 6);
  });

  it('reflects the aporte growth in year 2', () => {
    const semCrescimento = calcularJurosCompostos({
      valorInicial: 0,
      taxaAnualPct: 0,
      aporteMensalInicial: 100,
      crescimentoAnualAportePct: 0,
      anos: 2,
    });
    const comCrescimento = calcularJurosCompostos({
      valorInicial: 0,
      taxaAnualPct: 0,
      aporteMensalInicial: 100,
      crescimentoAnualAportePct: 10,
      anos: 2,
    });

    // Ano 1 idêntico (1200 em ambos); ano 2 do "com crescimento" usa aporte de 110/mês.
    expect(semCrescimento.totalInvestido).toBeCloseTo(2400, 6);
    expect(comCrescimento.totalInvestido).toBeCloseTo(1200 + 1320, 6);
  });
});

describe('aliquotaIrPorPrazo', () => {
  it('follows the Tesouro Direto regressive table by months (30 days each)', () => {
    expect(aliquotaIrPorPrazo(6)).toBe(22.5); // 180 dias
    expect(aliquotaIrPorPrazo(7)).toBe(20.0); // 210 dias
    expect(aliquotaIrPorPrazo(12)).toBe(20.0); // 360 dias
    expect(aliquotaIrPorPrazo(13)).toBe(17.5); // 390 dias
    expect(aliquotaIrPorPrazo(24)).toBe(17.5); // 720 dias
    expect(aliquotaIrPorPrazo(25)).toBe(15.0); // 750 dias
  });
});

describe('calcularVistaVsPrazo', () => {
  it('matches a hand-computed 2-installment projection and concludes correctly', () => {
    // à vista R$1000, a prazo R$1100 em 2x de 550, CDI 12% a.a., alíquota manual 20%.
    const jm = Math.pow(1.12, 1 / 12) - 1;
    const parcela = 550;
    const juros1 = 1000 * jm;
    const montante1 = 1000 - parcela + juros1;
    const juros2 = montante1 * jm;
    const montante2 = montante1 - parcela + juros2;
    const jurosAcumulados = juros1 + juros2;
    const jurosLiquidos = jurosAcumulados * 0.8;
    const economiaAVista = 100;

    const resultado = calcularVistaVsPrazo({
      valorAVista: 1000,
      valorAPrazo: 1100,
      numeroParcelas: 2,
      cdiAnualPct: 12,
      aliquotaManualPct: 20,
    });

    expect(resultado.parcela).toBeCloseTo(parcela, 6);
    expect(resultado.aliquotaIrPct).toBe(20);
    expect(resultado.meses).toHaveLength(2);
    expect(resultado.meses[0].montanteRestante).toBeCloseTo(montante1, 6);
    expect(resultado.meses[1].montanteRestante).toBeCloseTo(montante2, 6);
    expect(resultado.economiaAVista).toBeCloseTo(economiaAVista, 6);
    expect(resultado.jurosLiquidos).toBeCloseTo(jurosLiquidos, 6);
    // O saldo investido (parcela maior que os juros de um CDI de 12% a.a.) fica negativo no 2º mês --
    // a projeção ainda soma os juros desse mês final antes de marcar o esgotamento, igual ao script Python.
    expect(resultado.saldoEsgotado).toBe(true);
    // economia (100) vs juros líquidos (bem menor num CDI de 12% a.a. sobre 2 meses) -> à vista vence.
    expect(resultado.conclusao).toBe('vista');
  });

  it('uses the automatic regressive rate when no manual override is given', () => {
    const resultado = calcularVistaVsPrazo({
      valorAVista: 1000,
      valorAPrazo: 1100,
      numeroParcelas: 6,
      cdiAnualPct: 12,
      aliquotaManualPct: null,
    });

    expect(resultado.aliquotaIrPct).toBe(22.5);
  });

  it('flags saldoEsgotado and stops the projection when the balance goes negative', () => {
    const resultado = calcularVistaVsPrazo({
      valorAVista: 100,
      valorAPrazo: 1200,
      numeroParcelas: 12,
      cdiAnualPct: 10,
      aliquotaManualPct: 15,
    });

    expect(resultado.saldoEsgotado).toBe(true);
    expect(resultado.meses.length).toBeLessThan(12);
    expect(resultado.meses.at(-1)!.montanteRestante).toBeLessThan(0);
  });

  it('concludes "prazo" when net interest from investing beats the cash discount', () => {
    const resultado = calcularVistaVsPrazo({
      valorAVista: 1000,
      valorAPrazo: 1010,
      numeroParcelas: 12,
      cdiAnualPct: 30,
      aliquotaManualPct: 0,
    });

    expect(resultado.conclusao).toBe('prazo');
  });
});
