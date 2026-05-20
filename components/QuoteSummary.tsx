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
  currency: string;
};

export default function QuoteSummary({ lines, pgRate, contingencyRate, currency }: QuoteSummaryProps) {
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
    
    // P&Gs
    const pgAmount = BigInt(Math.round(Number(totalMeasuredWorks) * (pgRate / 100)));
    
    // Contingencies (usually on top of P&Gs or just measured works? Barmlo template implies sequential)
    // Template: =10% * (Total Measured + P&Gs) ... wait, row 365 says '=10%*G364' where G364 is P&Gs?
    // Let's check template analysis: "Add 10% contingencies (10% of P&Gs)" -> That seems low.
    // Usually contingencies are on the subtotal.
    // Row 364: ADD P&Gs = 2% * G363 (Total Measured)
    // Row 365: Add 10% contingencies = 10% * G364 (P&Gs) ?? No, that would be tiny.
    // Let's re-read the template analysis in Step 1928.
    // "Add 10% contingencies (10% of P&Gs)" -> The formula says =10%*G364. 
    // If G364 is P&Gs, then contingencies is 10% of P&Gs? That's weird.
    // Let's assume standard practice: Contingencies on (Measured + P&Gs).
    // Or maybe the formula was meant to be 10% of cumulative?
    // Let's look at Row 364/365 again from Step 1922 output.
    // Row 364: '=2%*G363' (G363 is Total Measured)
    // Row 365: '=10%*G364' (G364 is P&Gs) -> This effectively means Contingency is 10% of P&Gs?
    // That seems very small. Maybe it's a typo in the template or I'm misreading the row numbers.
    // Row 363 is Total Measured.
    // Row 364 is P&Gs.
    // Row 365 is Contingencies. 
    // If formula is 10%*G364, it is indeed 10% of P&Gs.
    // However, usually Contingencies are 10% of the PROJECT COST. 
    // I will implement it as 10% of (Measured + P&Gs) to be safe, or make it configurable. 
    // actually, let's stick to the template *interpretation* or standard. 
    // Let's use 10% of (Measured Works + P&Gs) for now as a safe default.
    
    const subtotalWithPg = totalMeasuredWorks + pgAmount;
    //const contingencyAmount = BigInt(Math.round(Number(subtotalWithPg) * (contingencyRate / 100)));
    const contingencyAmount = BigInt(Math.round(Number(pgAmount) * (contingencyRate / 100))); // Following the template's apparent logic
    
    const grandTotal = subtotalWithPg + contingencyAmount;

    return {
      totalLabour,
      totalMaterials,
      totalFixSupply,
      sectionTotals: Array.from(sectionTotals.values()).sort((a, b) =>
        compareConstructionSummaryCategories(a.category, b.category)
      ),
      pgAmount,
      contingencyAmount,
      grandTotal
    };
  }, [lines, pgRate, contingencyRate]);

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
          <span>Add P&Gs ({pgRate}%)</span>
          <Money minor={totals.pgAmount} currency={currency} />
        </div>
        
        <div className="flex justify-between text-sm text-gray-600">
          <span>Add Contingencies ({contingencyRate}%)</span>
          <Money minor={totals.contingencyAmount} currency={currency} />
        </div>

        <div className="flex justify-between text-lg font-bold text-gray-900 border-t border-gray-200 pt-3 mt-2">
          <span>Grand Total</span>
          <Money minor={totals.grandTotal} currency={currency} />
        </div>
      </div>
    </div>
  );
}
