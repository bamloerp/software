import { randomUUID } from 'crypto';

import { prisma } from '@/lib/db';
import { MANUAL_ITEM_CATALOG_KEY, type ManualCatalogItem } from '@/lib/manualItemCatalogShared';
export { MANUAL_ITEM_CATALOG_KEY, manualRateCode, type ManualCatalogItem } from '@/lib/manualItemCatalogShared';

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeItem(input: Partial<ManualCatalogItem>): ManualCatalogItem | null {
  const description = String(input.description ?? '').trim();
  if (!description) return null;

  const id = String(input.id ?? '').trim() || randomUUID();
  const unit = String(input.unit ?? '').trim();
  const section = String(input.section ?? 'OTHER').trim().toUpperCase() || 'OTHER';
  const category = String(input.category ?? 'GENERAL').trim().toUpperCase() || 'GENERAL';
  const itemType = input.itemType === 'LABOUR' ? 'LABOUR' : 'MATERIAL';

  return {
    id,
    description,
    unit,
    quantity: Math.max(0, asNumber(input.quantity, 1)),
    rate: Math.max(0, asNumber(input.rate, 0)),
    section,
    category,
    itemType,
  };
}

export function parseManualCatalog(value: string | null | undefined): ManualCatalogItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeItem(item as Partial<ManualCatalogItem>))
      .filter((item): item is ManualCatalogItem => Boolean(item));
  } catch {
    return [];
  }
}

export async function getManualCatalog(): Promise<ManualCatalogItem[]> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: MANUAL_ITEM_CATALOG_KEY } });
  return parseManualCatalog(setting?.value);
}

export async function saveManualCatalog(items: ManualCatalogItem[]) {
  const normalized = items
    .map((item) => normalizeItem(item))
    .filter((item): item is ManualCatalogItem => Boolean(item));

  await prisma.systemSetting.upsert({
    where: { key: MANUAL_ITEM_CATALOG_KEY },
    update: { value: JSON.stringify(normalized) },
    create: { key: MANUAL_ITEM_CATALOG_KEY, value: JSON.stringify(normalized) },
  });

  return normalized;
}
