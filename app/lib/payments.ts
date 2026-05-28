import { prisma } from '@/lib/db';
import { fromMinor, toBigIntMinor } from '@/helpers/money';

export async function getQuoteGrandTotalMinor(projectId: string): Promise<bigint> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { quote: { select: { metaJson: true, lines: { select: { lineTotalMinor: true } } } } },
  });
  if (!p?.quote?.metaJson) throw new Error('Quote totals not found');
  try {
    const meta = JSON.parse(p.quote.metaJson ?? '{}');
    const totals = meta?.totals;
    if (totals?.grandTotal) return toBigIntMinor(Number(totals.grandTotal));
  } catch {
    // Fall back to line totals below.
  }
  return p.quote.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor ?? 0), 0n);
}

export function addMonths(d: Date, months: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + months);
  return dt;
}




