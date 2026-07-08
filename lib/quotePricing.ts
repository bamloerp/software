import { fromMinor } from '@/helpers/money';

export type QuoteDiscountMode = 'percent' | 'amount';

export type QuoteDiscount = {
  mode: QuoteDiscountMode;
  value: number;
};

export type QuotePricingTotals = {
  subtotalMinor: number;
  subtotal: number;
  discountMinor: number;
  discount: number;
  netMinor: number;
  net: number;
  taxMinor: number;
  tax: number;
  grandTotalMinor: number;
  grandTotal: number;
};

export type QuotePricingBreakdown = {
  totals: QuotePricingTotals;
  measuredWorksMinor: number;
  measuredWorks: number;
  pgAmountMinor: number;
  pgAmount: number;
  contingencyAmountMinor: number;
  contingencyAmount: number;
  subtotalBeforeVatMinor: number;
  subtotalBeforeVat: number;
  vatPercent: number;
  vatAmountMinor: number;
  vatAmount: number;
  preDiscountTotalMinor: number;
  preDiscountTotal: number;
  quoteDiscount: QuoteDiscount | null;
};

type QuotePricingInput = {
  lines?: Array<{ lineTotalMinor?: bigint | number | null }>;
  pgRate?: bigint | number | null;
  contingencyRate?: bigint | number | null;
  vatBps?: bigint | number | null;
  metaJson?: string | Record<string, unknown> | null;
};

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function vatPercentFromBps(vatBps: bigint | number | null | undefined): number {
  const raw = Number(vatBps ?? 0);
  const effectiveBps = raw > 0 && raw < 100 ? raw * 100 : raw;
  return effectiveBps / 100;
}

export function parseQuoteMeta(metaJson: unknown): Record<string, unknown> {
  if (!metaJson) return {};
  if (typeof metaJson === 'object' && !Array.isArray(metaJson)) {
    return { ...(metaJson as Record<string, unknown>) };
  }
  if (typeof metaJson !== 'string') return {};
  try {
    const parsed = JSON.parse(metaJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readStoredTotals(metaJson: unknown): QuotePricingTotals | null {
  const meta = parseQuoteMeta(metaJson);
  const rawTotals = meta.totals;
  if (!rawTotals || typeof rawTotals !== 'object' || Array.isArray(rawTotals)) {
    return null;
  }

  const totals = rawTotals as Record<string, unknown>;
  const grandTotal = readFiniteNumber(totals.grandTotal);
  if (grandTotal === null) return null;

  const discount = readFiniteNumber(totals.discount) ?? 0;
  const tax = readFiniteNumber(totals.tax) ?? 0;
  const subtotal = readFiniteNumber(totals.subtotal) ?? grandTotal + discount;
  const net = readFiniteNumber(totals.net) ?? grandTotal;

  return {
    subtotalMinor: Math.round(subtotal * 100),
    subtotal,
    discountMinor: Math.round(discount * 100),
    discount,
    netMinor: Math.round(net * 100),
    net,
    taxMinor: Math.round(tax * 100),
    tax,
    grandTotalMinor: Math.round(grandTotal * 100),
    grandTotal,
  };
}

export function readQuoteDiscount(metaJson: unknown): QuoteDiscount | null {
  const meta = parseQuoteMeta(metaJson);
  const raw = meta.quoteDiscount;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const mode = (raw as Record<string, unknown>).mode;
  const value = readFiniteNumber((raw as Record<string, unknown>).value);
  if ((mode !== 'percent' && mode !== 'amount') || value === null || value <= 0) {
    return null;
  }

  return {
    mode,
    value: Number(value.toFixed(2)),
  };
}

export function describeQuoteDiscount(discount: QuoteDiscount | null): string | null {
  if (!discount) return null;
  return discount.mode === 'percent'
    ? `Quotation Discount (${discount.value}%)`
    : 'Quotation Discount';
}

export function serializeQuoteMeta(input: {
  metaJson?: string | Record<string, unknown> | null;
  quoteDiscount?: QuoteDiscount | null;
  totals?: QuotePricingTotals | null;
}): string {
  const meta = parseQuoteMeta(input.metaJson ?? null);

  if ('quoteDiscount' in input) {
    if (input.quoteDiscount && input.quoteDiscount.value > 0) {
      meta.quoteDiscount = input.quoteDiscount;
    } else {
      delete meta.quoteDiscount;
    }
  }

  if ('totals' in input) {
    if (input.totals) {
      meta.totals = input.totals;
    } else {
      delete meta.totals;
    }
  }

  return JSON.stringify(meta);
}

export function validateQuoteDiscountInput(
  mode: string,
  rawValue: unknown,
  preDiscountTotal: number,
): QuoteDiscount | null {
  const value = readFiniteNumber(rawValue) ?? 0;
  if (value <= 0) return null;

  if (mode !== 'percent' && mode !== 'amount') {
    throw new Error('Choose whether the discount is a percentage or a fixed amount.');
  }

  if (mode === 'percent') {
    if (value >= 100) {
      throw new Error('Percentage discount must be less than 100%.');
    }
    return { mode, value: Number(value.toFixed(2)) };
  }

  if (value >= preDiscountTotal) {
    throw new Error('Amount discount must be less than the quotation total.');
  }

  return { mode, value: Number(value.toFixed(2)) };
}

export function computeQuotePricing(input: QuotePricingInput): QuotePricingBreakdown {
  const lines = input.lines ?? [];
  const meta = parseQuoteMeta(input.metaJson ?? null);
  const quoteDiscount = readQuoteDiscount(meta);
  const hasLines = lines.length > 0;

  if (!hasLines) {
    const storedTotals = readStoredTotals(meta);
    const totals =
      storedTotals ??
      {
        subtotalMinor: 0,
        subtotal: 0,
        discountMinor: 0,
        discount: 0,
        netMinor: 0,
        net: 0,
        taxMinor: 0,
        tax: 0,
        grandTotalMinor: 0,
        grandTotal: 0,
      };

    const preDiscountTotal = totals.grandTotal + totals.discount;
    return {
      totals,
      measuredWorksMinor: 0,
      measuredWorks: 0,
      pgAmountMinor: 0,
      pgAmount: 0,
      contingencyAmountMinor: 0,
      contingencyAmount: 0,
      subtotalBeforeVatMinor: 0,
      subtotalBeforeVat: 0,
      vatPercent: vatPercentFromBps(input.vatBps),
      vatAmountMinor: totals.taxMinor,
      vatAmount: totals.tax,
      preDiscountTotalMinor: Math.round(preDiscountTotal * 100),
      preDiscountTotal,
      quoteDiscount,
    };
  }

  const measuredWorksMinorBig = lines.reduce(
    (sum, line) => sum + BigInt(line.lineTotalMinor ?? 0),
    0n,
  );
  const measuredWorksMinor = Number(measuredWorksMinorBig);
  const pgAmountMinor = Math.round(measuredWorksMinor * (Number(input.pgRate ?? 0) / 100));
  const contingencyAmountMinor = Math.round(pgAmountMinor * (Number(input.contingencyRate ?? 0) / 100));
  const subtotalBeforeVatMinor = measuredWorksMinor + pgAmountMinor + contingencyAmountMinor;
  const vatPercent = vatPercentFromBps(input.vatBps);
  const vatAmountMinor = Math.round(subtotalBeforeVatMinor * (vatPercent / 100));
  const preDiscountTotalMinor = subtotalBeforeVatMinor + vatAmountMinor;

  let discountMinor = 0;
  if (quoteDiscount) {
    discountMinor =
      quoteDiscount.mode === 'percent'
        ? Math.round(preDiscountTotalMinor * (quoteDiscount.value / 100))
        : Math.round(quoteDiscount.value * 100);

    if (discountMinor >= preDiscountTotalMinor) {
      discountMinor = Math.max(0, preDiscountTotalMinor - 1);
    }
  }

  const grandTotalMinor = Math.max(0, preDiscountTotalMinor - discountMinor);
  const totals: QuotePricingTotals = {
    subtotalMinor: preDiscountTotalMinor,
    subtotal: fromMinor(preDiscountTotalMinor),
    discountMinor,
    discount: fromMinor(discountMinor),
    netMinor: grandTotalMinor,
    net: fromMinor(grandTotalMinor),
    taxMinor: vatAmountMinor,
    tax: fromMinor(vatAmountMinor),
    grandTotalMinor,
    grandTotal: fromMinor(grandTotalMinor),
  };

  return {
    totals,
    measuredWorksMinor,
    measuredWorks: fromMinor(measuredWorksMinor),
    pgAmountMinor,
    pgAmount: fromMinor(pgAmountMinor),
    contingencyAmountMinor,
    contingencyAmount: fromMinor(contingencyAmountMinor),
    subtotalBeforeVatMinor,
    subtotalBeforeVat: fromMinor(subtotalBeforeVatMinor),
    vatPercent,
    vatAmountMinor,
    vatAmount: fromMinor(vatAmountMinor),
    preDiscountTotalMinor,
    preDiscountTotal: fromMinor(preDiscountTotalMinor),
    quoteDiscount,
  };
}