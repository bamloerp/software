import { prisma } from '@/lib/db';
import { toMinor } from '@/helpers/money';

type AnyPrismaClient = {
  manualQuoteLineTemplate: typeof prisma.manualQuoteLineTemplate;
};

function normalizeKey(s: string | null | undefined) {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export type ManualTemplateInput = {
  description: string;
  unit?: string | null;
  section?: string | null;
  itemType?: string | null;
  rate: number; // major units
};

/** Upsert a manual line template for a given user. Safe to call inside a transaction. */
export async function rememberManualLine(
  db: AnyPrismaClient,
  userId: string,
  input: ManualTemplateInput,
) {
  const description = input.description.trim();
  if (!description) return;
  const descriptionKey = normalizeKey(description);
  // Coerce to empty string so the unique compound key matches reliably
  // (Postgres treats NULLs as distinct in unique indexes).
  const unit = (input.unit ?? '').trim();
  const section = (input.section ?? '').trim();
  const itemType = input.itemType?.trim() || null;
  const unitPriceMinor = toMinor(Number(input.rate) || 0);

  await db.manualQuoteLineTemplate.upsert({
    where: {
      createdById_descriptionKey_unit_section: {
        createdById: userId,
        descriptionKey,
        unit,
        section,
      },
    },
    create: {
      createdById: userId,
      descriptionKey,
      description,
      unit,
      section,
      itemType,
      unitPriceMinor,
    },
    update: {
      description,
      unit,
      section,
      unitPriceMinor,
      ...(itemType ? { itemType } : {}),
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

export type ManualTemplateSuggestion = {
  id: string;
  description: string;
  unit: string | null;
  section: string | null;
  itemType: string | null;
  rate: number; // major units
  usageCount: number;
  lastUsedAt: string; // ISO
};

export async function listManualLineSuggestions(
  userId: string,
  limit = 50,
): Promise<ManualTemplateSuggestion[]> {
  const rows = await prisma.manualQuoteLineTemplate.findMany({
    where: { createdById: userId },
    orderBy: [{ lastUsedAt: 'desc' }, { usageCount: 'desc' }],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    unit: r.unit || null,
    section: r.section || null,
    itemType: r.itemType,
    rate: Number(r.unitPriceMinor) / 100,
    usageCount: r.usageCount,
    lastUsedAt: r.lastUsedAt.toISOString(),
  }));
}
