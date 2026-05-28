'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getManualCatalog, manualRateCode, saveManualCatalog, type ManualCatalogItem } from '@/lib/manualItemCatalog';

export type ManualCatalogInput = Omit<ManualCatalogItem, 'id'> & { id?: string };
type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const ALLOWED_ROLES = new Set(['SENIOR_QS', 'ADMIN']);

async function requireAccess() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  if (!ALLOWED_ROLES.has(user.role ?? '')) throw new Error('Not authorised');
  return user;
}

function normalizeInput(input: ManualCatalogInput): ManualCatalogItem {
  const description = String(input.description ?? '').trim();
  if (!description) throw new Error('Description is required');

  const quantity = Number(input.quantity);
  const rate = Number(input.rate);
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Quantity must be a non-negative number');
  if (!Number.isFinite(rate) || rate < 0) throw new Error('Rate must be a non-negative number');

  return {
    id: input.id?.trim() || randomUUID(),
    description,
    unit: String(input.unit ?? '').trim(),
    quantity,
    rate,
    section: String(input.section ?? 'OTHER').trim().toUpperCase() || 'OTHER',
    category: String(input.category ?? 'GENERAL').trim().toUpperCase() || 'GENERAL',
    itemType: input.itemType === 'LABOUR' ? 'LABOUR' : 'MATERIAL',
  };
}

export async function upsertManualCatalogItem(input: ManualCatalogInput): Promise<ActionResult<ManualCatalogItem>> {
  try {
    const user = await requireAccess();
    const item = normalizeInput(input);
    const catalog = await getManualCatalog();
    const index = catalog.findIndex((existing) => existing.id === item.id);
    const next = index >= 0 ? catalog.map((existing) => (existing.id === item.id ? item : existing)) : [...catalog, item];

    await prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: 'manualItemCatalog' },
        update: { value: JSON.stringify(next) },
        create: { key: 'manualItemCatalog', value: JSON.stringify(next) },
      });
      await tx.rateOverride.upsert({
        where: { code: manualRateCode(item.id) },
        update: { rate: item.rate, updatedById: user.id },
        create: { code: manualRateCode(item.id), rate: item.rate, updatedById: user.id },
      });
    });

    revalidatePath('/manual-items');
    revalidatePath('/rates');
    revalidatePath('/quotes/new');
    return { ok: true, data: item };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save item' };
  }
}

export async function deleteManualCatalogItem(id: string): Promise<ActionResult> {
  try {
    await requireAccess();
    const catalog = await getManualCatalog();
    const next = catalog.filter((item) => item.id !== id);
    await saveManualCatalog(next);

    revalidatePath('/manual-items');
    revalidatePath('/rates');
    revalidatePath('/quotes/new');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to delete item' };
  }
}
