import TakeOffSheet from '@/components/TakeOffSheet';
import { getCurrentUser } from '@/lib/auth';
import { assertRoles } from '@/lib/workflow';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function NewQuotePage() {
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

  const [overrides, settings] = await Promise.all([
    prisma.rateOverride.findMany(),
    prisma.systemSetting.findMany(),
  ]);
  const rateOverrides: Record<string, number> = {};
  for (const o of overrides) rateOverrides[o.code] = o.rate;
  const systemSettings: Record<string, string> = {};
  for (const s of settings) systemSettings[s.key] = s.value;

  return (
    <div className="space-y-6 h-screen overflow-y-auto p-6 scrollbar-y">
      <h1 className="text-2xl font-bold">New Quote :: Take Off</h1>
      <p className="text-sm text-gray-600">
        Enter base values (red inputs/outputs and formulas mirror your Excel sheet). Totals update
        in real time.
      </p>
      <TakeOffSheet rateOverrides={rateOverrides} systemSettings={systemSettings} />
    </div>
  );
}
