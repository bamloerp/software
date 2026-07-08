import type { Prisma } from '@prisma/client';
import { fromMinor } from '@/helpers/money';
import { QuoteStatus, UserRole } from './workflow';
import { computeQuotePricing } from './quotePricing';

const ZERO = BigInt(0);

type QuoteInclude = {
  lines: true;
  customer: true;
};

export type QuoteWithLines = Prisma.QuoteGetPayload<{ include: QuoteInclude }>;

export type SnapshotLine = {
  lineId: string;
  description: string;
  unit: string | null;
  quantity: number;
  unitPriceMinor: number;
  unitPrice: number;
  lineSubtotalMinor: number;
  lineSubtotal: number;
  lineDiscountMinor: number;
  lineDiscount: number;
  lineTaxMinor: number;
  lineTax: number;
  lineTotalMinor: number;
  lineTotal: number;
  meta?: Record<string, unknown> | null;
};

export type SnapshotTotals = {
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

export type QuoteSnapshot = {
  quote: {
    id: string;
    number: string | null;
    status: string;
    currency: string;
    vatBps: number;
    discountPolicy: string | null;
    createdAt: string;
    updatedAt: string;
    customer: {
      id: string;
      displayName: string;
      email: string | null;
    } | null;
  };
  totals: SnapshotTotals;
  lines: SnapshotLine[];
  meta?: Record<string, unknown> | null;
  generatedAt: string;
};

function parseJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

export function computeTotalsFromLines(
  lines: SnapshotLine[],
  options?: {
    pgRate?: bigint | number | null;
    contingencyRate?: bigint | number | null;
    vatBps?: bigint | number | null;
    metaJson?: string | Record<string, unknown> | null;
  },
): SnapshotTotals {
  if (options) {
    return computeQuotePricing({
      lines,
      pgRate: options.pgRate,
      contingencyRate: options.contingencyRate,
      vatBps: options.vatBps,
      metaJson: options.metaJson ?? null,
    }).totals;
  }

  const subtotalMinor = lines.reduce((acc, l) => acc + BigInt(Math.round(l.lineSubtotalMinor)), ZERO);
  const discountMinor = lines.reduce((acc, l) => acc + BigInt(Math.round(l.lineDiscountMinor)), ZERO);
  const taxMinor = lines.reduce((acc, l) => acc + BigInt(Math.round(l.lineTaxMinor)), ZERO);
  const grandTotalMinor = lines.reduce((acc, l) => acc + BigInt(Math.round(l.lineTotalMinor)), ZERO);
  const netMinor = subtotalMinor - discountMinor;
  return {
    subtotalMinor: Number(subtotalMinor),
    subtotal: fromMinor(subtotalMinor),
    discountMinor: Number(discountMinor),
    discount: fromMinor(discountMinor),
    netMinor: Number(netMinor),
    net: fromMinor(netMinor),
    taxMinor: Number(taxMinor),
    tax: fromMinor(taxMinor),
    grandTotalMinor: Number(grandTotalMinor),
    grandTotal: fromMinor(grandTotalMinor),
  };
}

export function buildQuoteSnapshot(params: {
  quote: QuoteWithLines;
  totalsOverride?: SnapshotTotals;
  linesOverride?: SnapshotLine[];
  metaOverride?: Record<string, unknown> | null;
}): QuoteSnapshot {
  const { quote } = params;
  const lines: SnapshotLine[] =
    params.linesOverride ??
    quote.lines.map((line) => {
      const meta = parseJson(line.metaJson ?? null);
      const unit = line.unit ?? (typeof meta?.unit === 'string' ? (meta.unit as string) : null);
      const subtotalMinor = Number(line.lineSubtotalMinor);
      const discountMinor = Number(line.lineDiscountMinor);
      const taxMinor = Number(line.lineTaxMinor);
      const totalMinor = Number(line.lineTotalMinor);
      const unitPriceMinor = Number(line.unitPriceMinor);
      return {
        lineId: line.id,
        description: line.description,
        unit,
        quantity: Number(line.quantity),
        unitPriceMinor,
        unitPrice: fromMinor(line.unitPriceMinor),
        lineSubtotalMinor: subtotalMinor,
        lineSubtotal: fromMinor(line.lineSubtotalMinor),
        lineDiscountMinor: discountMinor,
        lineDiscount: fromMinor(line.lineDiscountMinor),
        lineTaxMinor: taxMinor,
        lineTax: fromMinor(line.lineTaxMinor),
        lineTotalMinor: totalMinor,
        lineTotal: fromMinor(line.lineTotalMinor),
        meta,
      };
    });

  const totals =
    params.totalsOverride ??
    computeTotalsFromLines(lines, {
      pgRate: quote.pgRate,
      contingencyRate: quote.contingencyRate,
      vatBps: quote.vatBps,
      metaJson: params.metaOverride ?? quote.metaJson,
    });
  const meta = params.metaOverride ?? parseJson(quote.metaJson ?? null);

  return {
    quote: {
      id: quote.id,
      number: quote.number,
      status: quote.status,
      currency: quote.currency,
      vatBps: quote.vatBps,
      discountPolicy: quote.discountPolicy,
      createdAt: quote.createdAt.toISOString(),
      updatedAt: quote.updatedAt.toISOString(),
      customer: quote.customer
        ? {
            id: quote.customer.id,
            displayName: quote.customer.displayName,
            email: quote.customer.email,
          }
        : null,
    },
    totals,
    lines,
    meta,
    generatedAt: new Date().toISOString(),
  };
}

export async function createQuoteVersionTx(
  tx: Prisma.TransactionClient,
  params: {
    quote: QuoteWithLines;
    label: string;
    status: QuoteStatus;
    byRole?: UserRole | null;
    snapshot?: QuoteSnapshot;
    totalsOverride?: SnapshotTotals;
    linesOverride?: SnapshotLine[];
    metaOverride?: Record<string, unknown> | null;
  }
) {
  const count = await tx.quoteVersion.count({ where: { quoteId: params.quote.id } });
  const snapshot =
    params.snapshot ??
    buildQuoteSnapshot({
      quote: params.quote,
      totalsOverride: params.totalsOverride,
      linesOverride: params.linesOverride,
      metaOverride: params.metaOverride,
    });

  return tx.quoteVersion.create({
    data: {
      quoteId: params.quote.id,
      version: count + 1,
      label: params.label,
      status: params.status,
      byRole: params.byRole ?? null,
      snapshotJson: JSON.stringify(snapshot),
    },
  });
}

export function parseQuoteSnapshot(json: string): QuoteSnapshot {
  return JSON.parse(json) as QuoteSnapshot;
}

