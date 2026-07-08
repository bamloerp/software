import { type Quote, type FundingRequest } from '@prisma/client';
import { computeQuotePricing, parseQuoteMeta } from '@/lib/quotePricing';

export function fromMinor(n: bigint | number | null | undefined): number {
  if (n == null) return 0;
  return Number(n) / 100;
}

export function toMinor(major: number): bigint {
  return BigInt(Math.round((major ?? 0) * 100));
}

/**
 * Read grand total from quote meta snapshot if present, else sum lines if needed.
 * Expects quote.metaJson to include { totals: { grandTotal } } (as in your app).
 */
function vatPercentFromBps(vatBps: bigint | number | null | undefined): number {
  const raw = Number(vatBps ?? 0);
  const effectiveBps = raw > 0 && raw < 100 ? raw * 100 : raw;
  return effectiveBps / 100;
}

export function readQuoteGrandTotal(quote: Partial<Quote> & { lines?: Array<{ lineTotalMinor?: bigint | number | null }> }): number {
  const pricing = computeQuotePricing({
    lines: quote.lines,
    pgRate: quote.pgRate,
    contingencyRate: quote.contingencyRate,
    vatBps: quote.vatBps,
    metaJson: quote.metaJson ?? null,
  });

  if ((quote.lines?.length ?? 0) > 0) {
    return pricing.totals.grandTotal;
  }

  const storedGrandTotal = (() => {
    const meta = parseQuoteMeta(quote.metaJson ?? null);
    const grand = (meta.totals as Record<string, unknown> | undefined)?.grandTotal;
    if (typeof grand === 'number' && Number.isFinite(grand)) return grand;
    if (typeof grand === 'string' && Number.isFinite(Number(grand))) return Number(grand);
    return null;
  })();

  return storedGrandTotal ?? pricing.totals.grandTotal;
}

/**
 * Compute next installment due date from today given a desired day-of-month (1..31) and an optional start date.
 * If today is past that day this month, roll into next month. If day > daysInMonth, clamp.
 */
export function nextDueDate(dueDay: number | null | undefined, startOn?: Date | null): Date | null {
  if (!dueDay || dueDay < 1) return null;
  const base = new Date();
  // If project hasn't commenced yet, start from the commencement month.
  const ref = startOn && startOn > base ? new Date(startOn) : base;
  const tentative = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const daysInThisMonth = new Date(tentative.getFullYear(), tentative.getMonth() + 1, 0).getDate();
  const targetDayThisMonth = Math.min(dueDay, daysInThisMonth);
  const thisMonthDue = new Date(tentative.getFullYear(), tentative.getMonth(), targetDayThisMonth);
  if (thisMonthDue >= ref) return thisMonthDue;
  // Move to next month
  const nextMonth = new Date(tentative.getFullYear(), tentative.getMonth() + 1, 1);
  const daysInNext = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const targetDayNext = Math.min(dueDay, daysInNext);
  return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), targetDayNext);
}

export function formatDateYMD(d: Date | null): string {
  if (!d) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type PaymentLike = { amountMinor: bigint | number | null | undefined };

export function sumPayments(payments: PaymentLike[]): number {
  return payments.reduce((acc, p) => acc + fromMinor(p.amountMinor as any), 0);
}

export function computeBalances(args: {
  quote: Quote;
  payments: PaymentLike[];
  funding?: FundingRequest | null;
}) {
  const contractTotal = readQuoteGrandTotal(args.quote);
  const paid = sumPayments(args.payments);
  const remaining = contractTotal - paid;

  const approvedFunding =
    args.funding?.status === 'APPROVED'
      ? fromMinor(
          // allow optional approvedAmountMinor if present in runtime object
          (args.funding as any)?.approvedAmountMinor ?? args.funding.amountMinor,
        )
      : 0;
  return { contractTotal, paid, remaining, approvedFunding };
}
