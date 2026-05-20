"use client";

import { useMemo } from 'react';
import Money from '@/components/Money';
import {
  compareConstructionSummaryCategories,
  getConstructionSummaryCategory,
  type ConstructionSummaryCategory,
} from '@/lib/constructionSummary';

type QuoteSummaryProps = {
  lines: Array<{
    lineTotalMinor: bigint;
    itemType: string | null;
    section: string | null;
    description: string;
  }>;
  pgRate: number;
  contingencyRate: number;
  vatBps?: bigint | number | null;
  currency: string;
};

function formatPercentRate(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }

  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toFixed(Number.isInteger(rounded) ? 0 : 2)}%`;
}

function vatPercentFromBps(vatBps: bigint | number | null | undefined): number {
  const raw = Number(vatBps ?? 0);
  const effectiveBps = raw > 0 && raw < 100 ? raw * 100 : raw;
  return effectiveBps / 100;
}

export default function QuoteSummary({ lines, pgRate, contingencyRate, vatBps, currency }: QuoteSummaryProps) {
  const totals = useMemo(() => {
    const sectionTotals = new Map<
      string,
      { category: ConstructionSummaryCategory; amount: bigint }
    >();

    lines.forEach(line => {
      const amount = line.lineTotalMinor;

      const category = getConstructionSummaryCategory(line);
      const current = sectionTotals.get(category.key);
      sectionTotals.set(category.key, {
        category,
        amount: (current?.amount ?? 0n) + amount,
      });
    });

    const orderedSections = Array.from(sectionTotals.values()).sort((a, b) =>
      compareConstructionSummaryCategories(a.category, b.category)
    );
    const totalMeasuredWorks = orderedSections.reduce((total, section) => total + section.amount, 0n);
    
    const pgAmount = BigInt(Math.round(Number(totalMeasuredWorks) * (pgRate / 100)));
    const subtotalWithPg = totalMeasuredWorks + pgAmount;
    const contingencyAmount = BigInt(Math.round(Number(pgAmount) * (contingencyRate / 100)));
    const subtotalBeforeVat = subtotalWithPg + contingencyAmount;
    const vatPercent = vatPercentFromBps(vatBps);
    const vatAmount = BigInt(Math.round(Number(subtotalBeforeVat) * (vatPercent / 100)));
    
    const grandTotal = subtotalBeforeVat + vatAmount;

    return {
      totalMeasuredWorks,
      sectionTotals: orderedSections,
      pgAmount,
      contingencyAmount,
      vatPercent,
      vatAmount,
      grandTotal
    };
  }, [lines, pgRate, contingencyRate, vatBps]);

  return (
    <div className="mt-8 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
      <div className="border-b border-gray-300 px-4 py-3">
        <h3 className="text-base font-bold uppercase text-gray-900">Construction Cost Summary</h3>
      </div>

      <div className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-300 bg-blue-50 text-xs font-bold uppercase text-gray-700">
        <div className="border-r border-gray-300 px-3 py-2 text-center">#</div>
        <div className="border-r border-gray-300 px-3 py-2">Description</div>
        <div className="px-3 py-2 text-right">Amount</div>
      </div>

      <div className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-300 text-sm font-bold uppercase text-gray-900">
        <div className="border-r border-gray-300 px-3 py-2" />
        <div className="border-r border-gray-300 px-3 py-2">Builder&apos;s Work</div>
        <div className="px-3 py-2" />
      </div>

      {totals.sectionTotals.map(({ category, amount }, index) => (
        <div key={category.key} className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-200 text-sm">
          <div className="border-r border-gray-300 px-3 py-2 text-center text-gray-600">{index + 1}</div>
          <div className="border-r border-gray-300 px-3 py-2 font-semibold uppercase text-gray-800">
            {category.label}
          </div>
          <div className="bg-blue-50 px-3 py-2 text-right font-semibold text-gray-900">
            <Money minor={amount} currency={currency} />
          </div>
        </div>
      ))}

      <div className="border-t-2 border-gray-400">
        <div className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-300 text-sm font-bold uppercase">
          <div className="border-r border-gray-300 px-3 py-2" />
          <div className="border-r border-gray-300 px-3 py-2 text-gray-900">Total Measured Works</div>
          <div className="bg-blue-50 px-3 py-2 text-right text-gray-900">
            <Money minor={totals.totalMeasuredWorks} currency={currency} />
          </div>
        </div>
        <div className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-300 text-sm">
          <div className="border-r border-gray-300 px-3 py-2" />
          <div className="border-r border-gray-300 px-3 py-2">Add P&amp;Gs ({formatPercentRate(pgRate)})</div>
          <div className="bg-blue-50 px-3 py-2 text-right font-semibold">
            <Money minor={totals.pgAmount} currency={currency} />
          </div>
        </div>
        <div className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-300 text-sm">
          <div className="border-r border-gray-300 px-3 py-2" />
          <div className="border-r border-gray-300 px-3 py-2">Add {formatPercentRate(contingencyRate)} contingencies</div>
          <div className="bg-blue-50 px-3 py-2 text-right font-semibold">
            <Money minor={totals.contingencyAmount} currency={currency} />
          </div>
        </div>
        <div className="grid grid-cols-[3rem_1fr_10rem] border-b border-gray-300 text-sm">
          <div className="border-r border-gray-300 px-3 py-2" />
          <div className="border-r border-gray-300 px-3 py-2">
            {totals.vatPercent > 0 ? `Add VAT (${formatPercentRate(totals.vatPercent)})` : 'VAT Missing'}
          </div>
          <div className="bg-blue-50 px-3 py-2 text-right font-semibold">
            <Money minor={totals.vatAmount} currency={currency} />
          </div>
        </div>
        <div className="grid grid-cols-[3rem_1fr_10rem] bg-gray-50 text-base font-bold uppercase text-gray-900">
          <div className="border-r border-gray-300 px-3 py-2" />
          <div className="border-r border-gray-300 px-3 py-2">Grand Total</div>
          <div className="bg-blue-100 px-3 py-2 text-right">
            <Money minor={totals.grandTotal} currency={currency} />
          </div>
        </div>
      </div>
    </div>
  );
}
