/* "use server";
import { evaluateAll } from '@/lib/ruleEngine';
import { prisma } from '@/lib/db';
import { money } from '@/lib/money';
import { calcLine, subtotal, discount as discountFn, netBeforeTax, tax, grandTotal } from '@/lib/formulas';

export async function computeAutoQuote(baseInputs: Record<string, number>) {
  const { evaluated } = await evaluateAll(baseInputs);
  // Expose all computed values; in a real mapping you might filter by codes relevant for quote lines
  const values = evaluated.map((e) => ({ code: e.code, value: e.value }));
  return { values };
}

export async function createAutoQuote(input: { baseInputs: Record<string, number>; include: { code: string; value: number }[] }) {
  // Create a temporary customer if none exists
  const customer = await prisma.customer.findFirst();
  const customerId = customer?.id || (await prisma.customer.create({ data: { displayName: 'Walk-in Customer' } })).id;
  const vatRate = parseFloat(process.env.VAT_DEFAULT || '0.15');
  const currency = process.env.NEXT_PUBLIC_CURRENCY || 'USD';

  // Turn selected computed values into simple lines (description=code, unitPrice=value for demo)
  // In a real setup you would map codes -> product + unit price lookup.
  const linesCalced = input.include.map((i) => calcLine({ qty: 1, unitPrice: money(i.value), vatRate }));
  const sub = subtotal(linesCalced);
  const disc = discountFn(sub, 'none');
  const net = netBeforeTax(sub, disc);
  const t = tax(net, vatRate);
  const g = grandTotal(net, t);

  const quote = await prisma.quote.create({
    data: {
      customerId,
      currency,
      vatRate: vatRate.toString() as any,
      discountPolicy: 'none',
      metaJson: JSON.stringify({ baseInputs: input.baseInputs }),
      lines: {
        create: input.include.map((i, idx) => ({
          description: i.code,
          quantity: '1',
          unitPrice: i.value.toString(),
          lineSubtotal: linesCalced[idx].lineSubtotal.toString(),
          lineDiscount: linesCalced[idx].lineDiscount.toString(),
          lineTax: linesCalced[idx].lineTax.toString(),
          lineTotal: linesCalced[idx].lineTotal.toString(),
        })),
      },
    },
  });
  return { quoteId: quote.id };
}

 */

"use server";

import { evaluateAll } from "@/lib/ruleEngine";
import { prisma } from "@/lib/db";
import { money } from "@/lib/money";
import {
  calcLine,
  subtotal,
  discount as discountFn,
  netBeforeTax,
  tax,
  grandTotal,
} from "@/lib/formulas";

// helpers (or import from your shared helpers)
const toMinor = (amount: number, scale = 2): bigint =>
  BigInt(Math.round((amount ?? 0) * Math.pow(10, scale)));
const toBps = (pct: number) => Math.round((pct ?? 0) * 100); // 15.00 -> 1500
const parseVatEnvToPercent = (raw: string | undefined) => {
  const n = Number(raw ?? "0.155"); // supports "0.1500" or "15"
  return n <= 1 ? n * 100 : n;
};

async function ensureSystemUserId() {
  const email = "system@local";
  const u = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "System", role: "ADMIN" },
  });
  return u.id;
}

export async function computeAutoQuote(baseInputs: Record<string, number>) {
  const { evaluated } = await evaluateAll(baseInputs);
  const values = evaluated.map((e) => ({ code: e.code, value: e.value }));
  return { values };
}


// --- SECTION & TYPE MAPPING ---

// Helper to deduce section & type from the code string
// In a real app, you might have a DB table for this mapping.
// For now, we'll use a static mapping based on the Barmlo template codes.
function getLineCategory(code: string): { section: string; itemType: 'MATERIAL' | 'LABOUR' | 'FIX_SUPPLY' } {
  const c = code.toUpperCase();

  // Materials commonly reference "Take Off" or specific material names
  if (c.includes('SAND') || c.includes('CEMENT') || c.includes('BRICK') || c.includes('WIRE') || c.includes('CONCRETE')) {
    if (c.includes('FOUNDATION') || c.includes('SUBSTRUCTURE')) return { section: 'SUBSTRUCTURE', itemType: 'MATERIAL' };
    if (c.includes('ROOF')) return { section: 'ROOFING', itemType: 'MATERIAL' };
    if (c.includes('PLASTER')) return { section: 'PLASTERING', itemType: 'MATERIAL' };
    return { section: 'GENERAL MATERIALS', itemType: 'MATERIAL' };
  }

  // Labour items often have 'LABOUR' in name or are distinct
  if (c.includes('LABOUR') || c.includes('FIXING') || c.includes('INSTALL')) {
    return { section: 'LABOUR', itemType: 'LABOUR' };
  }

  // Fallback defaults based on potential prefixes
  if (c.startsWith('SUB')) return { section: 'SUBSTRUCTURE', itemType: 'MATERIAL' };
  if (c.startsWith('SUP')) return { section: 'SUPERSTRUCTURE', itemType: 'MATERIAL' };
  if (c.startsWith('ROOF')) return { section: 'ROOFING', itemType: 'MATERIAL' };

  return { section: 'GENERAL', itemType: 'MATERIAL' };
}

export async function createAutoQuote(input: {
  baseInputs: Record<string, number>;
  include: { code: string; value: number; unit?: string }[];
  customerId?: string;
  vatRate?: number;
  currency?: string;
  assumptions?: string[];
  exclusions?: string[];
}) {
  // ensure customer
  let customerId = input.customerId;
  if (!customerId) {
    const existing = await prisma.customer.findFirst();
    customerId =
      existing?.id ||
      (
        await prisma.customer.create({
          data: { displayName: "Walk-in Customer" },
        })
      ).id;
  }

  const userId = await ensureSystemUserId();

  // VAT: env default is "0.1500" -> 15%; accept override
  const vatPct =
    typeof input.vatRate === "number"
      ? input.vatRate
      : parseVatEnvToPercent(process.env.VAT_DEFAULT);
  const currency = input.currency || process.env.NEXT_PUBLIC_CURRENCY || "USD";

  // Calculate in display units for totals
  const linesCalced = input.include.map((i) =>
    calcLine({ qty: 1, unitPrice: money(i.value), vatRate: vatPct })
  );
  const sub = subtotal(linesCalced);
  const disc = discountFn(sub, "none");
  const net = netBeforeTax(sub, disc);
  const t = tax(net, vatPct);
  const g = grandTotal(net, t);

  // Build Prisma payload using MINOR units + nested relations
  const quote = await prisma.quote.create({
    data: {
      currency,
      vatBps: toBps(vatPct), // 15 -> 1500
      discountPolicy: "none",

      // New Summary & Notes Fields
      pgRate: 2.0,             // Default 2%
      contingencyRate: 10.0,   // Default 10%
      assumptions: input.assumptions ? JSON.stringify(input.assumptions) : null,
      exclusions: input.exclusions ? JSON.stringify(input.exclusions) : null,

      metaJson: JSON.stringify({
        baseInputs: input.baseInputs,
        totalsPreview: {
          subtotal: Number(sub),
          discount: Number(disc),
          net: Number(net),
          tax: Number(t),
          grandTotal: Number(g),
        },
      }),
      createdBy: { connect: { id: userId } },
      customer: { connect: { id: customerId } },

      lines: {
        create: input.include.map((i, idx) => {
          const c = linesCalced[idx];
          const qty = 1;
          const price = Number(i.value ?? 0);

          // Determine section and type
          const { section, itemType } = getLineCategory(i.code);

          return {
            description: i.code,
            unit: i.unit ?? null,
            quantity: qty,

            // New Categorization Fields
            section,
            itemType,

            // Money in MINOR UNITS (BigInt)
            unitPriceMinor: toMinor(price),
            lineSubtotalMinor: toMinor(Number(c.lineSubtotal)),
            lineDiscountMinor: toMinor(Number(c.lineDiscount)),
            lineTaxMinor: toMinor(Number(c.lineTax)),
            lineTotalMinor: toMinor(Number(c.lineTotal)),

            metaJson: JSON.stringify({
              code: i.code,
              unit: i.unit ?? "",
              source: "autoQuote",
            }),
          };
        }),
      },
    },
  });

  return { quoteId: quote.id };
}
