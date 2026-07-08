import { prisma } from '@/lib/db';
import { toBigIntMinor } from '@/helpers/money';
import { computeQuotePricing } from '@/lib/quotePricing';

export async function getQuoteGrandTotalMinor(projectId: string): Promise<bigint> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      quote: {
        select: {
          metaJson: true,
          pgRate: true,
          contingencyRate: true,
          vatBps: true,
          lines: { select: { lineTotalMinor: true } },
        },
      },
    },
  });
  if (!p?.quote) throw new Error('Quote totals not found');
  const pricing = computeQuotePricing({
    lines: p.quote.lines,
    pgRate: p.quote.pgRate,
    contingencyRate: p.quote.contingencyRate,
    vatBps: p.quote.vatBps,
    metaJson: p.quote.metaJson ?? null,
  });
  return toBigIntMinor(pricing.totals.grandTotal);
}

export async function reconcilePaymentScheduleToGrandTotal(projectId: string) {
  const [grandTotalMinor, schedules] = await Promise.all([
    getQuoteGrandTotalMinor(projectId),
    prisma.paymentSchedule.findMany({ where: { projectId }, orderBy: [{ seq: 'asc' }] }),
  ]);

  if (schedules.length === 0) return { updated: false };

  const scheduledTotal = schedules.reduce((sum, schedule) => sum + BigInt(schedule.amountMinor), 0n);
  const diff = grandTotalMinor - scheduledTotal;
  if (diff === 0n) return { updated: false };

  if (diff > 0n) {
    const lastSchedule = schedules[schedules.length - 1];
    await prisma.paymentSchedule.create({
      data: {
        projectId,
        seq: lastSchedule.seq + 1,
        label: 'Grand Total Adjustment',
        dueOn: lastSchedule.dueOn,
        amountMinor: diff,
        paidMinor: 0n,
        status: 'DUE',
      },
    });
    return { updated: true };
  }

  let amountToRemove = -diff;
  for (const schedule of [...schedules].reverse()) {
    if (amountToRemove <= 0n) break;
    const amountMinor = BigInt(schedule.amountMinor);
    const paidMinor = BigInt(schedule.paidMinor ?? 0n);
    const unpaidMinor = amountMinor - paidMinor;
    if (unpaidMinor <= 0n) continue;

    const reduction = unpaidMinor > amountToRemove ? amountToRemove : unpaidMinor;
    const nextAmount = amountMinor - reduction;
    await prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        amountMinor: nextAmount,
        status: paidMinor >= nextAmount ? 'PAID' : schedule.status,
      },
    });
    amountToRemove -= reduction;
  }

  return { updated: amountToRemove !== -diff };
}

export function addMonths(d: Date, months: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + months);
  return dt;
}




