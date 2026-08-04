/* app/(protected)/projects/[projectId]/requisitions/new/page.tsx */
import React from 'react';
import { prisma } from '@/lib/db';
import RequisitionPickerClient from '@/components/RequisitionPickerClient';
import { createRequisitionFromQuotePicks, ensureProjectAccess } from '@/app/(protected)/projects/actions'; // path where your server action lives
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { CreateRequisitionButton } from './CreateRequisitionButton';
import QuoteHeader from '@/components/QuoteHeader';

type LineRow = {
  id: string;
  qtyOrdered: number;
  description: string;
  unit?: string | null;
  purchased: number;
  remaining: number;
  alreadyRequested: number;
  category: string;
  approvedExtra: number;
};

export default async function NewRequisitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { projectId } = await params;
  const { draftId } = await searchParams;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/dashboard');
  try {
    await ensureProjectAccess(projectId, currentUser);
  } catch {
    redirect('/projects');
  }
  const assignedProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { assignedToId: true },
  });
  if (!assignedProject?.assignedToId) redirect('/projects?tab=assignment');

  // load quote lines for the project's quote
  const quote = await prisma.quote.findFirst({
    where: { project: { id: projectId } },
    include: {
      lines: { orderBy: { createdAt: 'asc' } },
      customer: true,
      project: true,
    },
  });
  if (!quote) return notFound();

  const draftRequisition = draftId
    ? await prisma.procurementRequisition.findUnique({
        where: { id: draftId },
        include: {
          items: {
            select: {
              quoteLineId: true,
              qtyRequested: true,
            },
          },
        },
      })
    : null;

  if (draftId && (!draftRequisition || draftRequisition.projectId !== projectId || draftRequisition.status !== 'DRAFT')) {
    return notFound();
  }

  const lineIds = quote.lines.map((l) => l.id);

  const extraRequests = await prisma.quoteLineExtraRequest.findMany({
    where: { projectId, quoteLineId: { in: lineIds } },
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: { select: { name: true, role: true } },
      decidedBy: { select: { name: true, role: true } },
    },
  });

  const approvedByLine = new Map<string, number>();
  const requestsByLine: Record<string, Array<{
    id: string;
    qty: number;
    reason?: string | null;
    status: string;
    requiresAdmin: boolean;
    requestedByName: string;
    requestedByRole?: string | null;
    decidedByName?: string | null;
    decidedAt?: string | null;
    createdAt: string;
  }>> = {};

  for (const req of extraRequests) {
    if (req.status === 'APPROVED') {
      approvedByLine.set(req.quoteLineId, (approvedByLine.get(req.quoteLineId) ?? 0) + req.qty);
    }
    (requestsByLine[req.quoteLineId] ??= []).push({
      id: req.id,
      qty: req.qty,
      reason: req.reason,
      status: req.status,
      requiresAdmin: req.requiresAdmin,
      requestedByName: req.requestedBy?.name ?? 'User',
      requestedByRole: req.requestedBy?.role ?? '',
      decidedByName: req.decidedBy?.name ?? null,
      decidedAt: req.decidedAt ? req.decidedAt.toISOString() : null,
      createdAt: req.createdAt.toISOString(),
    });
  }

  // qty already requested on requisitions (by quoteLineId)
  const requestedAgg = await prisma.procurementRequisitionItem.groupBy({
    by: ['quoteLineId'],
    where: {
      quoteLineId: { in: lineIds },
      requisitionId: draftRequisition ? { not: draftRequisition.id } : undefined,
    },
    _sum: { qtyRequested: true },
  });
  const requestedByLine = new Map<string, number>();
  for (const r of requestedAgg)
    requestedByLine.set(String(r.quoteLineId), Number(r._sum.qtyRequested ?? 0));

  // purchases linked to requisition items -> map to quoteLineId
  const reqItems = await prisma.procurementRequisitionItem.findMany({
    where: { quoteLineId: { in: lineIds } },
    select: { id: true, quoteLineId: true },
  });
  const reqItemIds = reqItems.map((r) => r.id);
  const purchases = await prisma.purchase.findMany({
    where: { requisitionItemId: { in: reqItemIds } },
    include: { requisitionItem: { select: { quoteLineId: true } } },
  });
  const purchasedByLine = new Map<string, number>();
  for (const p of purchases) {
    const qid = p.requisitionItem?.quoteLineId ?? null;
    if (!qid) continue;
    purchasedByLine.set(qid, (purchasedByLine.get(qid) ?? 0) + Number(p.qty ?? 0));
  }

  // compute lines with remaining, excluding LABOUR sections
  const linesWithRemaining: LineRow[] = quote.lines
    .map((line) => {
      const ordered = Number(line.quantity ?? 0);
      const meta =
        typeof line.metaJson === 'string' ? JSON.parse(line.metaJson || '{}') : (line.metaJson ?? {});
      const category = (meta.section || meta.category || 'Uncategorized') as string;
      const isLabourType = line.itemType === 'LABOUR' || meta.itemType === 'LABOUR' || meta.type === 'LABOUR' || meta.isLabour === true;

      const unitFromMeta = typeof meta?.unit === 'string' ? meta.unit : null;
      const alreadyRequested = requestedByLine.get(line.id) ?? 0;
      const approvedExtra = approvedByLine.get(line.id) ?? 0;
      const alreadyPurchased = purchasedByLine.get(line.id) ?? 0;

      const remaining = Math.max(0, ordered + approvedExtra - alreadyRequested);
      return {
        id: line.id,
        qtyOrdered: ordered,
        description: line.description,
        unit: line.unit ?? unitFromMeta ?? null,
        purchased: alreadyPurchased,
        alreadyRequested: alreadyRequested,
        remaining,
        category,
        approvedExtra,
        isLabour: isLabourType,
      };
    })
    .filter((ln) => !ln.category.toUpperCase().startsWith('LABOUR') && !ln.isLabour);

  // group by category (ordered)
  const grouped: Record<string, LineRow[]> = {};
  for (const ln of linesWithRemaining) (grouped[ln.category] ??= []).push(ln);

  // pass grouped to client
  return (
    <div className="min-h-screen bg-slate-50/50 pb-32 font-sans">
      {/* Replaced Header with Letterhead */}
      <div className="mx-auto max-w-7xl px-6 pt-6 mb-4 no-print">
         <a href={`/projects/${projectId}/requisitions`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Back to Requisitions
         </a>
      </div>

      <main className="mx-auto max-w-7xl px-6 lg:px-8">
        <QuoteHeader quote={quote} title="Purchase Requisition" />

        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden p-6 mt-6">
          <form action={createRequisitionFromQuotePicks} className="space-y-6">
            <input type="hidden" name="projectId" value={projectId} />
            {draftRequisition && (
              <input type="hidden" name="draftRequisitionId" value={draftRequisition.id} />
            )}
            <RequisitionPickerClient
              clientGrouped={grouped}
              initiallySelected={
                draftRequisition?.items
                  .filter((item) => typeof item.quoteLineId === 'string' && item.quoteLineId.length > 0)
                  .map((item) => ({
                    quoteLineId: item.quoteLineId as string,
                    qty: Number(item.qtyRequested ?? 0),
                  })) ?? []
              }
              projectId={projectId}
              currentRole={currentUser?.role ?? null}
              requestsByLine={requestsByLine}
            />

            <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4 no-print">
              <div className="pointer-events-auto flex items-center gap-4 rounded-2xl bg-gray-900/90 p-2 pr-2 shadow-2xl backdrop-blur-md ring-1 ring-white/10 transition-transform hover:scale-105">
                 <div className="pl-4 text-sm font-medium text-gray-300">
                    Ready to submit?
                 </div>
                <CreateRequisitionButton />
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
