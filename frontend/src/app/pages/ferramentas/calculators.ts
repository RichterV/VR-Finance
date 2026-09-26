/** Portas em TypeScript das duas calculadoras Python originais (notebook Colab do usuário) -- sem
 * nenhuma chamada de rede/persistência, são cálculos puros pra rodar direto na tela.
 */

export interface JurosCompostosInput {
  valorInicial: number;
  taxaAnualPct: number;
  aporteMensalInicial: number;
  crescimentoAnualAportePct: number;
  anos: number;
}

export interface JurosCompostosResultado {
  valorAcumulado: number;
  totalInvestido: number;
  rendimento: number;
  taxaMensalEquivalentePct: number;
}

export function calcularJurosCompostos(input: JurosCompostosInput): JurosCompostosResultado {
  const taxaAnual = input.taxaAnualPct / 100;
  const crescimento = input.crescimentoAnualAportePct / 100;
  const taxaMensal = Math.pow(1 + taxaAnual, 1 / 12) - 1;

  let saldo = input.valorInicial;
  let totalInvestido = input.valorInicial;
  let aporte = input.aporteMensalInicial;

  const totalMeses = Math.round(input.anos * 12);
  for (let mes = 1; mes <= totalMeses; mes++) {
    saldo = saldo * (1 + taxaMensal) + aporte;
    totalInvestido += aporte;
    if (mes % 12 === 0) {
      aporte *= 1 + crescimento;
    }
  }

  return {
    valorAcumulado: saldo,
    totalInvestido,
    rendimento: saldo - totalInvestido,
    taxaMensalEquivalentePct: taxaMensal * 100,
  };
}

export interface VistaVsPrazoInput {
  valorAVista: number;
  valorAPrazo: number;
  numeroParcelas: number;
  cdiAnualPct: number;
  /** null = usa a alíquota regressiva automática do Tesouro Direto pelo prazo. */
  aliquotaManualPct: number | null;
}

export interface VistaVsPrazoMes {
  mes: number;
  juros: number;
  jurosAcumulados: number;
  montanteRestante: number;
  saldoEsgotado: boolean;
}

export type VistaVsPrazoConclusao = 'vista' | 'prazo' | 'indiferente';

export interface VistaVsPrazoResultado {
  parcela: number;
  aliquotaIrPct: number;
  economiaAVista: number;
  taxaDescontoMensalPct: number;
  valorPresenteParcelas: number;
  /** valorPresenteParcelas - valorAVista: positivo = a prazo custa mais em valor presente. */
  diferencaValorPresente: number;
  saldoEsgotado: boolean;
  conclusao: VistaVsPrazoConclusao;
  meses: VistaVsPrazoMes[];
}

/** Tabela regressiva de IR do Tesouro Direto/renda fixa, pelo prazo em meses (30 dias por mês, mesma
 * aproximação do script original). */
export function aliquotaIrPorPrazo(numeroParcelas: number): number {
  const dias = numeroParcelas * 30;
  if (dias <= 180) return 22.5;
  if (dias <= 360) return 20.0;
  if (dias <= 720) return 17.5;
  return 15.0;
}

export function calcularVistaVsPrazo(input: VistaVsPrazoInput): VistaVsPrazoResultado {
  const parcela = input.valorAPrazo / input.numeroParcelas;
  const aliquota = input.aliquotaManualPct ?? aliquotaIrPorPrazo(input.numeroParcelas);
  const jurosMensal = Math.pow(1 + input.cdiAnualPct / 100, 1 / 12) - 1;

  let montante = input.valorAVista;
  let jurosAcumulados = 0;
  let saldoEsgotado = false;
  const meses: VistaVsPrazoMes[] = [];

  for (let mes = 1; mes <= input.numeroParcelas; mes++) {
    const juros = montante * jurosMensal;
    jurosAcumulados += juros;
    montante = montante - parcela + juros;
    const esgotouNesteMes = montante < 0;
    meses.push({ mes, juros, jurosAcumulados, montanteRestante: montante, saldoEsgotado: esgotouNesteMes });
    if (esgotouNesteMes) {
      saldoEsgotado = true;
      break;
    }
  }

  const economiaAVista = input.valorAPrazo - input.valorAVista;

  // Desconta cada parcela (paga no fim do mês k) pelo CDI líquido de IR, o custo de oportunidade real.
  const taxaDesconto = jurosMensal * (1 - aliquota / 100);
  let valorPresenteParcelas = 0;
  for (let k = 1; k <= input.numeroParcelas; k++) {
    valorPresenteParcelas += parcela / Math.pow(1 + taxaDesconto, k);
  }
  const diferencaValorPresente = valorPresenteParcelas - input.valorAVista;

  let conclusao: VistaVsPrazoConclusao;
  if (Math.abs(diferencaValorPresente) < 0.005) {
    conclusao = 'indiferente';
  } else if (diferencaValorPresente > 0) {
    conclusao = 'vista';
  } else {
    conclusao = 'prazo';
  }

  return {
    parcela,
    aliquotaIrPct: aliquota,
    economiaAVista,
    taxaDescontoMensalPct: taxaDesconto * 100,
    valorPresenteParcelas,
    diferencaValorPresente,
    saldoEsgotado,
    conclusao,
    meses,
  };
}
