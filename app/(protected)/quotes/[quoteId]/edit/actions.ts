'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { calcLine } from '@/lib/formulas';
import { money } from '@/lib/money';
import { fromBps, toMinor } from '@/helpers/money';
import { buildQuoteSnapshot, createQuoteVersionTx } from '@/lib/quoteSnapshot';
import { TX_OPTS } from '@/lib/db-tx';
import { rememberManualLine } from '@/lib/manualLineTemplates';
import {
  QUOTE_STATUSES,
  USER_ROLES,
  type QuoteStatus,
  type UserRole,
} from '@/lib/workflow';

const quoteInclude = {
  customer: true,
  lines: true,
} satisfies Prisma.QuoteInclude;

const USER_ROLE_SET = new Set<UserRole>(USER_ROLES as unknown as UserRole[]);
const QUOTE_STATUS_SET = new Set<QuoteStatus>(QUOTE_STATUSES as unknown as QuoteStatus[]);

function coerceUserRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;
  return USER_ROLE_SET.has(role as UserRole) ? (role as UserRole) : null;
}

function assertRole(role: string | null | undefined): UserRole {
  const normalized = coerceUserRole(role);
  if (!normalized) {
    throw new Error('Unsupported user role');
  }
  return normalized;
}

function normalizeQuoteStatus(status: string): QuoteStatus {
  if (QUOTE_STATUS_SET.has(status as QuoteStatus)) {
    return status as QuoteStatus;
  }
  throw new Error(`Unknown quote status: ${status}`);
}

/* const ManualRowSchema = z.object({
  description: z.string().min(1),
  unit: z.string().trim().max(32).optional().nullable(),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
  section: z.string().trim().max(64).optional().nullable(),
}); */

export type ManualRowInput = z.infer<typeof ManualRowSchema>;

/* export async function addManualLines(quoteId: string, rows: ManualRowInput[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'QS' && role !== 'ADMIN') {
    throw new Error('Only QS or Admin users can add manual lines');
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Add at least one manual row');
  }

  const parsedRows = rows
    .map((row) => {
      try {
        return ManualRowSchema.parse({
          description: row.description,
          unit: row.unit ?? null,
          quantity: Number(row.quantity),
          rate: Number(row.rate),
          section: row.section ?? null,
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          throw new Error(`Invalid manual row: ${err.issues[0]?.message ?? 'validation failed'}`);
        }
        throw err;
      }
    })
    .filter((row) => row.description.trim().length > 0);

  if (parsedRows.length === 0) {
    throw new Error('No valid manual rows to add');
  }

  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: quoteInclude });
    if (!quote) throw new Error('Quote not found');

    const vatRate = fromBps(quote.vatBps);
    const newLineIds: string[] = [];

    for (const row of parsedRows) {
      const lineCalc = calcLine({ qty: row.quantity, unitPrice: money(row.rate), vatRate });
      const meta: Record<string, unknown> = {};
      if (row.section && row.section.trim().length > 0) {
        meta.section = row.section.trim();
      }

      const created = await tx.quoteLine.create({
        data: {
          quoteId,
          description: row.description.trim(),
          unit: row.unit?.trim() || null,
          quantity: row.quantity,
          unitPriceMinor: toMinor(row.rate),
          lineSubtotalMinor: toMinor(Number(lineCalc.lineSubtotal)),
          lineDiscountMinor: toMinor(Number(lineCalc.lineDiscount)),
          lineTaxMinor: toMinor(Number(lineCalc.lineTax)),
          lineTotalMinor: toMinor(Number(lineCalc.lineTotal)),
          metaJson: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
          source: 'Manual',
        },
        select: { id: true },
      });
      newLineIds.push(created.id);
    }

    const refreshedQuote = await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, include: quoteInclude });
    const snapshot = buildQuoteSnapshot({ quote: refreshedQuote });
    const totals = snapshot.totals;

    const qsEditIndex =
      (await tx.quoteVersion.count({ where: { quoteId, label: { startsWith: 'QS Edit #' } } })) + 1;

    const version = await createQuoteVersionTx(tx, {
      quote: refreshedQuote,
      label: `QS Edit #${qsEditIndex}`,
      status: normalizeQuoteStatus(refreshedQuote.status),
      byRole: 'QS',
    });

    await tx.quoteLine.updateMany({
      where: { id: { in: newLineIds } },
      data: { addedInVersionId: version.id },
    });

    await tx.quote.update({
      where: { id: quoteId },
      data: {
        metaJson: JSON.stringify({ ...(snapshot.meta ?? {}), totals }),
      },
    });
  });

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/edit`);
  redirect(`/quotes/${quoteId}`);
} */


// Reuse the same options you used elsewhere to avoid short tx timeouts.

const ManualRowSchema = z.object({
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  quantity: z.number().finite().nonnegative(),
  rate: z.number().finite().nonnegative(), // major units (e.g., 12.34)
  section: z.string().nullable().optional(),
});

/* export async function addManualLines(quoteId: string, rows: ManualRowInput[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'QS' && role !== 'ADMIN') {
    throw new Error('Only QS or Admin users can add manual lines');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Add at least one manual row');
  }

  const parsedRows = rows
    .map((row) => {
      const parsed = ManualRowSchema.safeParse({
        description: row.description,
        unit: row.unit ?? null,
        quantity: Number(row.quantity),
        rate: Number(row.rate),
        section: row.section ?? null,
      });
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'validation failed';
        throw new Error(`Invalid manual row: ${msg}`);
      }
      return parsed.data;
    })
    .filter((r) => r.description.trim().length > 0);

  if (parsedRows.length === 0) throw new Error('No valid manual rows to add');

  await prisma.$transaction(async (tx) => {
    // Load once
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: quoteInclude,
    });
    if (!quote) throw new Error('Quote not found');

    const vatRate = fromBps(quote.vatBps);

    // Create manual lines first (no version id yet)
    const createdIds: string[] = [];
    for (const row of parsedRows) {
      const lineCalc = calcLine({ qty: row.quantity, unitPrice: money(row.rate), vatRate });
      const meta: Record<string, unknown> = {};
      if (row.section && row.section.trim()) meta.section = row.section.trim();

      const created = await tx.quoteLine.create({
        data: {
          quoteId,
          description: row.description.trim(),
          unit: row.unit?.trim() || null,
          quantity: row.quantity,
          unitPriceMinor: toMinor(row.rate),
          lineSubtotalMinor: toMinor(Number(lineCalc.lineSubtotal)),
          lineDiscountMinor: toMinor(Number(lineCalc.lineDiscount)),
          lineTaxMinor: toMinor(Number(lineCalc.lineTax)),
          lineTotalMinor: toMinor(Number(lineCalc.lineTotal)),
          metaJson: Object.keys(meta).length ? JSON.stringify(meta) : null,
          cycle: quote.negotiationCycle,
          source: 'Manual',
        },
        select: { id: true },
      });
      createdIds.push(created.id);
    }

    // Refresh quote with new lines for snapshot/totals
    const refreshed = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: quoteInclude,
    });
    const snapshot = buildQuoteSnapshot({ quote: refreshed });
    const totals = snapshot.totals;

    // Compute next version # cheaply
    const max = await tx.quoteVersion.aggregate({
      where: { quoteId },
      _max: { version: true },
    });
    const nextVersion = (max._max.version ?? 0) + 1;

    // Create version INLINE on same tx client (no nested transactions)
    const version = await tx.quoteVersion.create({
      data: {
        quoteId,
        version: nextVersion,
        label: `QS Edit #${nextVersion}`,
        status: refreshed.status, // keep current
        byRole: 'QS',
        snapshotJson: JSON.stringify(snapshot),
      },
      select: { id: true },
    });

    // Link new lines to the version that introduced them
    if (createdIds.length) {
      await tx.quoteLine.updateMany({
        where: { id: { in: createdIds } },
        data: { addedInVersionId: version.id },
      });
    }

    // Update totals on the quote
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        metaJson: JSON.stringify({ ...(snapshot.meta ?? {}), totals }),
      },
    });
  }, TX_OPTS);

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/edit`);
  redirect(`/quotes/${quoteId}`);
} */

export async function addManualLines(quoteId: string, rows: ManualRowInput[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  const role = assertRole(user.role);
  if (role !== 'QS' && role !== 'ADMIN') {
    throw new Error('Only QS or Admin users can add manual lines');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Add at least one manual row');
  }

  const parsedRows = rows
    .map((row) => {
      const parsed = ManualRowSchema.safeParse({
        description: row.description,
        unit: row.unit ?? null,
        quantity: Number(row.quantity),
        rate: Number(row.rate),
        section: row.section ?? null,
      });
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'validation failed';
        throw new Error(`Invalid manual row: ${msg}`);
      }
      return parsed.data;
    })
    .filter((r) => r.description.trim().length > 0);

  if (parsedRows.length === 0) throw new Error('No valid manual rows to add');

  await prisma.$transaction(async (tx) => {
    // Load once
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: quoteInclude,
    });
    if (!quote) throw new Error('Quote not found');

    const vatRate = fromBps(quote.vatBps);

    // Create manual lines first (no version id yet)
    const createdIds: string[] = [];
    for (const row of parsedRows) {
      const lineCalc = calcLine({ qty: row.quantity, unitPrice: money(row.rate), vatRate });
      const meta: Record<string, unknown> = {};
      if (row.section && row.section.trim()) meta.section = row.section.trim();

      const created = await tx.quoteLine.create({
        data: {
          quoteId,
          description: row.description.trim(),
          unit: row.unit?.trim() || null,
          quantity: row.quantity,
          unitPriceMinor: toMinor(row.rate),
          lineSubtotalMinor: toMinor(Number(lineCalc.lineSubtotal)),
          lineDiscountMinor: toMinor(Number(lineCalc.lineDiscount)),
          lineTaxMinor: toMinor(Number(lineCalc.lineTax)),
          lineTotalMinor: toMinor(Number(lineCalc.lineTotal)),
          metaJson: Object.keys(meta).length ? JSON.stringify(meta) : null,
          cycle: quote.negotiationCycle,
          source: 'Manual',
        },
        select: { id: true },
      });
      createdIds.push(created.id);

      // Remember this manual line as a per-user template for future suggestions.
      await rememberManualLine(tx, user.id, {
        description: row.description,
        unit: row.unit,
        section: row.section,
        rate: row.rate,
      });
    }

    // Refresh quote with new lines for snapshot/totals
    const refreshed = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: quoteInclude,
    });
    const snapshot = buildQuoteSnapshot({ quote: refreshed });
    const totals = snapshot.totals;

    // Compute next version # cheaply
    const max = await tx.quoteVersion.aggregate({
      where: { quoteId },
      _max: { version: true },
    });
    const nextVersion = (max._max.version ?? 0) + 1;

    // Create version INLINE on same tx client
    const version = await tx.quoteVersion.create({
      data: {
        quoteId,
        version: nextVersion,
        label: `QS Edit #${nextVersion}`,
        status: refreshed.status, // keep current
        byRole: 'QS',
        snapshotJson: JSON.stringify(snapshot),
      },
      select: { id: true },
    });

    // Link new lines to the version that introduced them
    if (createdIds.length) {
      await tx.quoteLine.updateMany({
        where: { id: { in: createdIds } },
        data: { addedInVersionId: version.id },
      });
    }

    // Update totals on the quote
    const updatedAfterTotals = await tx.quote.update({
      where: { id: quoteId },
      data: {
        metaJson: JSON.stringify({ ...(snapshot.meta ?? {}), totals }),
      },
      include: quoteInclude,
    });

    // NEW: Auto-submit for review (QS flow) from allowed statuses
    const canSubmit =
      updatedAfterTotals.status !== 'ARCHIVED' && updatedAfterTotals.status !== 'FINALIZED';
    if (canSubmit) {
      const submitted = await tx.quote.update({
        where: { id: quoteId },
        data: { status: 'SUBMITTED_REVIEW' },
        include: quoteInclude,
      });

      // snapshot for submitted state
      const submittedSnap = buildQuoteSnapshot({ quote: submitted });
      const submittedVersionNum = nextVersion + 1;

      await tx.quoteVersion.create({
        data: {
          quoteId,
          version: submittedVersionNum,
          label: 'Submitted for review',
          status: 'SUBMITTED_REVIEW',
          byRole: 'QS',
          snapshotJson: JSON.stringify(submittedSnap),
        },
      });
    }
  }, TX_OPTS);

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/edit`);
  redirect(`/quotes/${quoteId}`);
}

