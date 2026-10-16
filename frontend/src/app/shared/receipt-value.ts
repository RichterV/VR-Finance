/**
 * Acha o valor pago no texto de um comprovante (PDF do banco ou OCR de uma imagem). Funções puras;
 * a leitura do arquivo fica em receipt-value.service.ts.
 *
 * Separador decimal: o documento todo segue um só. Comprovante brasileiro usa "1.234,56"; recibo em
 * inglês (Uber, Amazon, apps de fora) usa "1,234.56" -- inclusive com "R$51.99". O padrão que mais
 * aparece no texto decide (`detectDecimalStyle`); empate vai pelo idioma, e na dúvida fica o
 * brasileiro. Sem isso, "R$51.99" não era lido como valor nenhum.
 *
 * Ordem: (1) um rótulo de valor ("Valor final", "Valor total", "Total pago", "Valor", "Total",
 * "Amount paid"...) com o valor na mesma linha ou sozinho na linha seguinte; (2) sem rótulo junto --
 * comum no OCR, que lê a coluna dos rótulos e a dos valores separadas, e no DANFE, que põe os
 * rótulos numa linha e os números (sem "R$") na de baixo --, o valor que mais se repete no
 * documento, com ou sem símbolo de moeda (o total costuma aparecer várias vezes: "Valor" e "Valor
 * final", ou total dos produtos, total da nota e valor do item); no empate, o primeiro com símbolo,
 * senão o primeiro. Zero é ignorado (tarifa R$ 0,00), e linhas de imposto, frete, desconto, saldo,
 * troco etc. não contam -- no DANFE o único valor com "R$" era o "Valor aproximado dos tributos".
 */

export type DecimalStyle = 'br' | 'en';

const LABELS: RegExp[] = [
  /valor\s+final/i,
  /valor\s+total/i,
  /total\s+pago/i,
  /valor\s+pago/i,
  /valor\s+(da|do)\s+(transfer[eê]ncia|pagamento|compra|transa[cç][aã]o|pix|boleto)/i,
  /valor\s+cobrado/i,
  /(valor|total)\s+a\s+pagar/i,
  /valor\s+total\s+da\s+nota/i,
  /grand\s+total/i,
  /total\b.*\bincl(\.|usive|uding)?\b/i,
  /(total|amount)\s+(paid|charged)/i,
  /(total|amount|balance)\s+due/i,
  /^round(ed|ing)?\s+total/i,
  /^total\s+amount/i,
  /^valor\b/i,
  /^total\b/i,
  /^amount\b/i,
];

/** Linhas com outro valor que não o pago (impostos, frete, desconto, saldo, troco...). */
const IGNORED_LINE = new RegExp(
  [
    'tribut|imposto|\\bicms\\b|\\bipi\\b|\\bibpt\\b|difal|\\bfcp\\b|\\biss|\\bpis\\b|cofins',
    'desconto|frete|troco|saldo|limite|juros|multa|seguro|cashback',
    '\\btax(es)?\\b|\\bvat\\b|\\bgst\\b|\\bsst\\b|discount|shipping|\\bchange\\b|rounding|\\btips?\\b',
    'promotion|\\bfees?\\b|\\bcredit\\s+limit',
  ].join('|'),
  'i',
);

/** "Total incl. GST": a linha cita o imposto, mas o valor é o total -- não ignora. */
const TAX_INCLUDED = /\bincl(\.|usive|uding|ui)?\b|\bcom\s+impostos\b/i;

/** Total antes do imposto ("Total excl. tax", "sem impostos", "subtotal"): não é o valor pago. */
const PRE_TAX = /\bexcl(\.|usive|uding)?\b|\bsem\s+impostos\b|\bsub\s*-?\s*total\b|before\s+tax/i;

const CURRENCY = String.raw`(?:R\$|US\$|\$|€|£|\bRM|\bBRL|\bUSD|\bEUR)`;

const NUMBER: Record<DecimalStyle, string> = {
  br: String.raw`\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}`,
  en: String.raw`\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}`,
};

interface Patterns {
  withSymbol: RegExp;
  bare: RegExp;
  alone: RegExp;
}

const PATTERNS: Record<DecimalStyle, Patterns> = {
  br: buildPatterns('br'),
  en: buildPatterns('en'),
};

function buildPatterns(style: DecimalStyle): Patterns {
  const n = NUMBER[style];
  return {
    withSymbol: new RegExp(String.raw`${CURRENCY}\s*-?\s*(${n})(?![\d])`, 'gi'),
    bare: new RegExp(String.raw`(?<![\d,.])(${n})(?![\d,.]\d)(?![\d])`, 'g'),
    alone: new RegExp(String.raw`^(?:${CURRENCY}\s*)?-?\s*(?:${n})$`, 'i'),
  };
}

export function parseAmount(raw: string, style: DecimalStyle): number | null {
  const normalized = style === 'br' ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function parseBrlAmount(raw: string): number | null {
  return parseAmount(raw, 'br');
}

const ENGLISH_WORDS = /\b(total|amount|paid|receipt|invoice|payment|thanks|thank you|fare|due)\b/gi;
const PORTUGUESE_WORDS = /\b(valor|pago|pagamento|comprovante|nota|transfer[eê]ncia|data|recebedor)\b/gi;

/** Separador decimal do documento: o formato de valor que mais aparece; empate pelo idioma. */
export function detectDecimalStyle(text: string): DecimalStyle {
  const br = (text.match(PATTERNS.br.bare) ?? []).length;
  const en = (text.match(PATTERNS.en.bare) ?? []).length;
  if (br !== en) return br > en ? 'br' : 'en';
  const english = (text.match(ENGLISH_WORDS) ?? []).length;
  const portuguese = (text.match(PORTUGUESE_WORDS) ?? []).length;
  return english > portuguese ? 'en' : 'br';
}

function amountsIn(line: string, pattern: RegExp, style: DecimalStyle): number[] {
  return Array.from(line.matchAll(pattern))
    .map((m) => parseAmount(m[1], style))
    .filter((v): v is number => v !== null);
}

/** Valor de uma linha com rótulo: com símbolo de moeda de preferência; sem ele só se for o único número. */
function labeledAmount(line: string, style: DecimalStyle): number | null {
  const withSymbol = amountsIn(line, PATTERNS[style].withSymbol, style);
  if (withSymbol.length) return withSymbol[0];
  const bare = amountsIn(line, PATTERNS[style].bare, style);
  return bare.length === 1 ? bare[0] : null;
}

function isIgnored(line: string): boolean {
  return IGNORED_LINE.test(line) && !TAX_INCLUDED.test(line);
}

export function extractReceiptValue(text: string): number | null {
  const style = detectDecimalStyle(text);
  const patterns = PATTERNS[style];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const label of LABELS) {
    for (let i = 0; i < lines.length; i++) {
      if (!label.test(lines[i]) || isIgnored(lines[i]) || PRE_TAX.test(lines[i])) continue;
      const sameLine = labeledAmount(lines[i], style);
      if (sameLine !== null) return sameLine;
      const next = lines[i + 1];
      if (next && patterns.alone.test(next)) {
        const nextValue = labeledAmount(next, style);
        if (nextValue !== null) return nextValue;
      }
    }
  }

  const counted = lines.filter((l) => !isIgnored(l));
  const withSymbol = counted.flatMap((l) => amountsIn(l, patterns.withSymbol, style));
  const all = counted.flatMap((l) => amountsIn(l, patterns.bare, style));
  if (!all.length) return null;
  const counts = new Map<number, number>();
  for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return withSymbol.find((v) => counts.get(v) === max) ?? all.find((v) => counts.get(v) === max) ?? null;
}
