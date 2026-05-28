'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { QUOTE_LINE_MAP, ELECTRICAL_ITEMS_CATALOG } from '@/lib/quoteMap';
import { getManualCatalog, manualRateCode } from '@/lib/manualItemCatalog';

type ActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_ROLES = new Set(['SENIOR_QS', 'ADMIN']);

export async function updateRate(code: string, rate: number): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Authentication required' };
    if (!ALLOWED_ROLES.has(user.role ?? '')) return { ok: false, error: 'Not authorised' };
    if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: 'Rate must be a non-negative number' };

    await prisma.rateOverride.upsert({
      where: { code },
      update: { rate, updatedById: user.id },
      create: { code, rate, updatedById: user.id },
    });

    revalidatePath('/rates');
    return { ok: true };
  } catch (e) {
    console.error('[updateRate]', e);
    return { ok: false, error: String(e) };
  }
}

export async function updateSystemSetting(key: string, value: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: 'Authentication required' };
    if (!ALLOWED_ROLES.has(user.role ?? '')) return { ok: false, error: 'Not authorised' };

    const ALLOWED_KEYS = new Set(['vatBps', 'pgRate', 'contingencyRate']);
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: 'Unknown setting' };

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    revalidatePath('/rates');
    return { ok: true };
  } catch (e) {
    console.error('[updateSystemSetting]', e);
    return { ok: false, error: String(e) };
  }
}

/** Fetch all rate overrides + system settings for the rates page */
export async function getRatesData() {
  const [overrides, settings, manualCatalog] = await Promise.all([
    prisma.rateOverride.findMany(),
    prisma.systemSetting.findMany(),
    getManualCatalog(),
  ]);

  const overrideMap = new Map(overrides.map(o => [o.code, o.rate]));
  const settingsMap = new Map(settings.map(s => [s.key, s.value]));

  // Build grouped items from QUOTE_LINE_MAP
  const sectionMap = new Map<string, { code: string; description: string; unit: string; defaultRate: number; currentRate: number; itemType: string }[]>();

  for (const item of QUOTE_LINE_MAP) {
    const section = item.section || 'OTHER';
    const itemType = item.itemType || 'MATERIAL';
    const groupKey = itemType === 'LABOUR' ? `LABOUR – ${section}` : section;
    if (!sectionMap.has(groupKey)) sectionMap.set(groupKey, []);
    sectionMap.get(groupKey)!.push({
      code: item.code,
      description: item.description,
      unit: item.unit || '',
      defaultRate: item.rate ?? 0,
      currentRate: overrideMap.get(item.code) ?? item.rate ?? 0,
      itemType,
    });
  }

  // Add electrical items
  for (const item of ELECTRICAL_ITEMS_CATALOG) {
    const groupKey = item.itemType === 'LABOUR' ? `LABOUR – ${item.section}` : item.section;
    if (!sectionMap.has(groupKey)) sectionMap.set(groupKey, []);
    sectionMap.get(groupKey)!.push({
      code: item.id,
      description: item.description,
      unit: item.unit,
      defaultRate: item.rate,
      currentRate: overrideMap.get(item.id) ?? item.rate,
      itemType: item.itemType,
    });
  }

  for (const item of manualCatalog) {
    const groupKey = item.itemType === 'LABOUR' ? `MANUAL LABOUR – ${item.section}` : `MANUAL – ${item.section}`;
    if (!sectionMap.has(groupKey)) sectionMap.set(groupKey, []);
    const code = manualRateCode(item.id);
    sectionMap.get(groupKey)!.push({
      code,
      description: item.description,
      unit: item.unit,
      defaultRate: item.rate,
      currentRate: overrideMap.get(code) ?? item.rate,
      itemType: item.itemType,
    });
  }

  return {
    sections: Array.from(sectionMap.entries()).map(([label, items]) => ({ label, items })),
    settings: {
      vatBps: settingsMap.get('vatBps') || '1550',
      pgRate: settingsMap.get('pgRate') || '10',
      contingencyRate: settingsMap.get('contingencyRate') || '5',
    },
  };
}
