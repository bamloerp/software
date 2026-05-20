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
    let totalLabour = 0n;
    let totalMaterials = 0n;
    const sectionTotals = new Map<
      string,
      { category: ConstructionSummaryCategory; amount: bigint }
    >();

    lines.forEach(line => {
      const amount = line.lineTotalMinor;
      
      // Category Totals
      if (line.itemType === 'LABOUR') {
        totalLabour += amount;
      } else {
        totalMaterials += amount;
      }

      const category = getConstructionSummaryCategory(line);
      const current = sectionTotals.get(category.key);
      sectionTotals.set(category.key, {
        category,
        amount: (current?.amount ?? 0n) + amount,
      });
    });

    const totalFixSupply = totalLabour + totalMaterials;
    const totalMeasuredWorks = totalFixSupply; // Or sum of sections, should vary slightly if sections missing
    
    const pgAmount = BigInt(Math.round(Number(totalMeasuredWorks) * (pgRate / 100)));
    const subtotalWithPg = totalMeasuredWorks + pgAmount;
    const contingencyAmount = BigInt(Math.round(Number(pgAmount) * (contingencyRate / 100)));
    const subtotalBeforeVat = subtotalWithPg + contingencyAmount;
    const vatPercent = vatPercentFromBps(vatBps);
    const vatAmount = BigInt(Math.round(Number(subtotalBeforeVat) * (vatPercent / 100)));
    
    const grandTotal = subtotalBeforeVat + vatAmount;

    return {
      totalLabour,
      totalMaterials,
      totalFixSupply,
      sectionTotals: Array.from(sectionTotals.values()).sort((a, b) =>
        compareConstructionSummaryCategories(a.category, b.category)
      ),
      pgAmount,
      contingencyAmount,
      subtotalBeforeVat,
      vatPercent,
      vatAmount,
      grandTotal
    };
  }, [lines, pgRate, contingencyRate, vatBps]);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mt-8">
      <h3 className="text-lg font-bold text-gray-900 border-b pb-4 mb-4">Construction Cost Summary</h3>
      
      {/* High Level Totals */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Labour</span>
          <Money minor={totals.totalLabour} currency={currency} />
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Total Materials</span>
          <Money minor={totals.totalMaterials} currency={currency} />
        </div>
        <div className="flex justify-between font-medium border-t pt-2 mt-2 col-span-2">
          <span>Total Fix & Supply</span>
          <Money minor={totals.totalFixSupply} currency={currency} />
        </div>
      </div>

      {/* Section Breakdown */}
      <div className="space-y-3 border-t pt-4">
        <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Section Summary</h4>
        {totals.sectionTotals.map(({ category, amount }) => (
          <div key={category.key} className="flex justify-between text-sm">
            <span className="text-gray-700 uppercase">{category.label}</span>
            <Money minor={amount} currency={currency} />
          </div>
        ))}
      </div>

      {/* Final Calculation */}
      <div className="mt-6 space-y-3 bg-gray-50 p-4 rounded-lg">
        <div className="flex justify-between text-sm font-medium">
          <span>Total Measured Works</span>
          <Money minor={totals.totalFixSupply} currency={currency} />
        </div>
        
        <div className="flex justify-between text-sm text-gray-600">
          <span>Add P&Gs ({formatPercentRate(pgRate)})</span>
          <Money minor={totals.pgAmount} currency={currency} />
        </div>
        
        <div className="flex justify-between text-sm text-gray-600">
          <span>Add Contingencies ({contingencyRate}%)</span>
          <Money minor={totals.contingencyAmount} currency={currency} />
        </div>

        <div className="flex justify-between text-sm font-medium text-gray-700 border-t border-gray-200 pt-3">
          <span>Subtotal before VAT</span>
          <Money minor={totals.subtotalBeforeVat} currency={currency} />
        </div>

        <div className="flex justify-between text-sm text-gray-600">
          <span>{totals.vatPercent > 0 ? `Add VAT (${formatPercentRate(totals.vatPercent)})` : 'VAT Missing'}</span>
          <Money minor={totals.vatAmount} currency={currency} />
        </div>

        <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-200 pt-3 mt-2">
          <span>Grand Total</span>
          <Money minor={totals.grandTotal} currency={currency} />
        </div>
      </div>
    </div>
  );
}
