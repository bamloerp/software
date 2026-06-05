import TakeOffSheet from '@/components/TakeOffSheet';
import { getCurrentUser } from '@/lib/auth';
import { assertRoles } from '@/lib/workflow';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getManualCatalog } from '@/lib/manualItemCatalog';

type NewQuotePageProps = {
  searchParams?: Promise<{ draftId?: string }>;
};

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const me = await getCurrentUser();
  if (!me) return <div className="p-6">Auth required.</div>;
  // Only QS, SENIOR_QS, ADMIN
  try {
    assertRoles(me.role as any, ['QS', 'SENIOR_QS', 'ADMIN'] as any);
  } catch {
    const r = String((me as any).role || '');
    if (['QS', 'SENIOR_QS', 'SALES'].includes(r)) redirect('/quotes');
    redirect('/projects');
  }

  const params = searchParams ? await searchParams : {};
  const draftId = typeof params?.draftId === 'string' ? params.draftId : undefined;

  const [overrides, settings, manualCatalog, draftQuote] = await Promise.all([
    prisma.rateOverride.findMany(),
    prisma.systemSetting.findMany(),
    getManualCatalog(),
    draftId
      ? prisma.quote.findUnique({
          where: { id: draftId },
          select: { id: true, status: true, createdById: true, metaJson: true },
        })
      : Promise.resolve(null),
  ]);
  const rateOverrides: Record<string, number> = {};
  for (const o of overrides) rateOverrides[o.code] = o.rate;
  const systemSettings: Record<string, string> = {};
  for (const s of settings) systemSettings[s.key] = s.value;

  const canLoadDraft =
    draftQuote?.status === 'DRAFT' && (draftQuote.createdById === me.id || me.role === 'ADMIN');
  const initialDraft = canLoadDraft
    ? { id: draftQuote.id, ...(parseJsonObject(draftQuote.metaJson).takeoffDraft as Record<string, unknown> | undefined) }
    : null;

  return (
    <div className="space-y-6 h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
      <h1 className="text-2xl font-bold">New Quote :: Take Off</h1>
      <p className="text-sm text-gray-600">
        Enter base values (red inputs/outputs and formulas mirror your Excel sheet). Totals update
        in real time.
      </p>
      <TakeOffSheet
        rateOverrides={rateOverrides}
        systemSettings={systemSettings}
        manualCatalog={manualCatalog}
        initialDraft={initialDraft}
      />
    </div>
  );
}
