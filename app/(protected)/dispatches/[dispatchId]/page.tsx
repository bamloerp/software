import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  updateDispatchItems,
  submitDispatch,
  markItemUsedOut,
} from '@/app/(protected)/projects/actions';
import { returnItemsToInventory } from '@/app/(protected)/projects/actions';
import LoadingButton from '@/components/LoadingButton';
import { revalidatePath } from 'next/cache';
import { markItemHandedOut } from '../action';
import { redirect } from 'next/navigation';
import ApproveDispatchButton from '@/components/ApproveDispatchButton';
import Link from 'next/link';
import { ArrowLeftIcon, CheckIcon, ShieldCheckIcon, TrashIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import DispatchAcknowledgment from '@/components/dispatch-acknowledgment';
import QuoteHeader from '@/components/QuoteHeader';
import { getDrivers } from '../driver-actions';
import AssignDriverForm from '@/components/AssignDriverForm';
import DownloadPdfButton from '@/components/DownloadPdfButton';
import { generateDispatchPdf } from './pdf-actions';

export const runtime = 'nodejs';

export default async function DispatchDetail({
  params,
}: {
  params: Promise<{ dispatchId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return <div className="p-6">Auth required.</div>;
  const role = (me as any).role as string | undefined;

  const { dispatchId } = await params;
  const dispatch = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    include: { 
        project: { 
            include: { 
                quote: { include: { customer: true, project: true } }
            } 
        }, 
        items: { orderBy: { id: 'asc' } },
        createdBy: { select: { name: true } }
    },
  });
  
  if (!dispatch) return <div className="p-6">Not found.</div>;

  const canEdit = (role === 'PROJECT_OPERATIONS_OFFICER' || role === 'ADMIN') && dispatch.status === 'DRAFT';
  const isProjectOps = role === 'PROJECT_OPERATIONS_OFFICER';
  const canApprove =
    (role === 'PROJECT_OPERATIONS_OFFICER' || role === 'ADMIN') && dispatch.status === 'SUBMITTED';
  const isSecurity = role === 'SECURITY' || role === 'ADMIN';
  const isDriver = role === 'DRIVER' || role === 'ADMIN';
  const canReturn = (role === 'PROJECT_OPERATIONS_OFFICER' || role === 'PROCUREMENT' || role === 'SENIOR_PROCUREMENT' || role === 'ADMIN') && dispatch.status === 'DELIVERED';

  // Fetch drivers for security/admin if status is ready for assignment
  // User req: "without even dispatching the items first" -> Must be DISPATCHED (all items handed out)
  // Allow driver assignment as soon as it's submitted/approved for loading
  // Allow driver assignment as soon as it's submitted/approved for loading
  // User req: "assign and handover button appear only if there are items marked out"
  const hasHandedOutItems = dispatch.items.some(it => it.handedOutAt);
  const canAssignDriver = isSecurity && 
    ['SUBMITTED', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT'].includes(dispatch.status) && 
    hasHandedOutItems;
  const drivers = canAssignDriver ? await getDrivers() : [];

  // ---------- server actions ----------
  
  // Save table edits (PM)
  const saveAction = async (fd: FormData) => {
    'use server';
    const updates: { id: string; qty: number }[] = [];
    // re-fetch items to iterate stable list
    const fresh = await prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { items: true },
    });
    if (!fresh) throw new Error('Dispatch not found.');
    for (const it of fresh.items) {
      const raw = fd.get(`qty-${it.id}`);
      if (raw == null || raw === '') continue;
      const qty = Number(raw);
      if (!(qty >= 0)) throw new Error('Invalid qty');
      updates.push({ id: it.id, qty });
    }
    if (updates.length) {
      await updateDispatchItems(dispatchId, updates);
    }
    revalidatePath(`/dispatches/${dispatchId}`);
  };

  // Submit for Security (PM)
  const submitAction = async (fd: FormData) => {
    'use server';
    // persist any current edits first
    await saveAction(fd);
    await submitDispatch(dispatchId);
    redirect('/dispatches');
  };

  const deleteAction = async () => {
    'use server';
    const { deleteDispatch } = await import('@/app/(protected)/projects/actions');
    await deleteDispatch(dispatchId);
    redirect('/dispatches');
  };

  // DRIVER: acknowledge received for a single line
  const acknowledgeReceived = async (fd: FormData) => {
    'use server';
    const me = await getCurrentUser();
    if (!me) throw new Error('Auth required');
    const role = (me as any).role as string | undefined;
    if (!(role === 'DRIVER' || role === 'ADMIN')) throw new Error('Forbidden');

    const itemId = String(fd.get('itemId') ?? '');
    if (!itemId) throw new Error('Missing itemId');

    const item = await prisma.dispatchItem.findUnique({
      where: { id: itemId },
      select: { dispatchId: true, handedOutAt: true },
    });
    if (!item) throw new Error('Item not found');
    if (!item.handedOutAt) throw new Error('Item not yet handed out');

    await prisma.dispatchItem.update({
      where: { id: itemId },
      data: {
        receivedAt: new Date(),
        receivedById: me.id!,
      },
    });

    // If ALL items received, mark dispatch DELIVERED
    const remaining = await prisma.dispatchItem.count({
      where: { dispatchId, receivedAt: null },
    });
    if (remaining === 0) {
      await prisma.dispatch.update({
        where: { id: dispatchId },
        data: { status: 'DELIVERED' },
      });
    }

    revalidatePath(`/dispatches/${dispatchId}`);
  };


  const returnAction = async (fd: FormData) => {
    'use server';
    
    // fetch fresh dispatch items
    const fresh = await prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { items: true },
    });
    if (!fresh) throw new Error('Dispatch not found');

    type ReturnRow = {
      dispatchItemId: string;
      inventoryItemId: string | null;
      description: string;
      unit: string | null;
      qty: number;
      note?: string | null;
      usedOut?: boolean;
    };

    const rows: ReturnRow[] = [];

    for (const it of fresh.items) {
      const raw = fd.get(`return-${it.id}`);
      const usedOut = !!fd.get(`usedout-${it.id}`);
      const note = String(fd.get(`note-${it.id}`) || '');
      const qty = raw ? Number(raw) : 0;

      rows.push({
        dispatchItemId: it.id,
        inventoryItemId: it.inventoryItemId ?? null,
        description: it.description,
        unit: it.unit ?? null,
        qty,
        note: note || null,
        usedOut,
      });
    }

    // partition rows: returns vs used-out-only
    const toReturn = rows.filter((r) => r.qty > 0);
    const toUsedOut = rows
      .filter((r) => r.usedOut)
      .map((r) => ({
        dispatchItemId: r.dispatchItemId,
        qty: r.qty,
        inventoryItemId: r.inventoryItemId,
      }));

    // 1) apply actual returns (if any)
    if (toReturn.length > 0) {
      await returnItemsToInventory(
        dispatchId,
        fresh.projectId ?? null,
        toReturn.map((r) => ({
          dispatchItemId: r.dispatchItemId,
          inventoryItemId: r.inventoryItemId,
          description: r.description,
          unit: r.unit,
          qty: r.qty,
          note: r.note ?? null,
        })),
        null
      );
    }

    // 2) handle used-out marks
    const refreshed = await prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: { items: true },
    });
    if (!refreshed) throw new Error('Dispatch not found after return');

    for (const u of toUsedOut) {
      const it = refreshed.items.find((x) => x.id === u.dispatchItemId);
      if (!it) continue;
      const alreadyHanded = Number(it.handedOutQty ?? 0);
      const alreadyReturned = Number(it.returnedQty ?? 0);
      const alreadyUsed = Number(it.usedOutQty ?? 0);
      const available = Math.max(0, alreadyHanded - alreadyReturned - alreadyUsed);

      const markQty = u.qty > 0 ? Math.max(0, available - u.qty) : available;
      if (markQty > 0) {
        await markItemUsedOut(u.dispatchItemId, markQty);
      }
    }

    revalidatePath(`/dispatches/${dispatchId}`);
    revalidatePath('/dispatches');
    return redirect(`/dispatches/${dispatchId}`);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Navigation */}
        <div className="flex flex-col gap-4">
          <nav className="flex items-center justify-between text-sm font-medium text-gray-500">
            <Link 
              href="/dispatches" 
              className="hover:text-green-600 transition-colors flex items-center bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1.5 text-green-600" />
              Back to Dispatches
            </Link>
            <DownloadPdfButton quoteId={dispatchId} generatePdf={generateDispatchPdf} />
          </nav>

          {/* Letterhead */}
          {dispatch.project?.quote ? (
            <QuoteHeader 
              quote={dispatch.project.quote} 
              title={isDriver && ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'ARRIVED'].includes(dispatch.status) ? "Delivery Note" : "Dispatch Form"} 
            />
          ) : (
            <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                {isDriver && ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'ARRIVED'].includes(dispatch.status) ? "Delivery Note" : "Dispatch Details"}
              </h1>
              <p className="mt-2 text-gray-500">Project: {dispatch.project?.name || 'Stock Dispatch'}</p>
            </div>
          )}
        </div>

        <div className="space-y-8">
            {/* Table Section */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-900">Dispatched Items</h2>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Description
                                </th>
                                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-24">
                                    Unit
                                </th>
                                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">
                                    Qty
                                </th>
                                {(isSecurity || isDriver) && (
                                    <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-40">
                                        Actions
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {dispatch.items.map((it) => (
                                <tr key={it.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{it.description}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{it.unit || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {canEdit ? (
                                            <input
                                                name={`qty-${it.id}`}
                                                form="editForm"
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                defaultValue={Number(it.qty)}
                                                className="w-24 text-center rounded-lg border border-gray-200 px-2 py-1 text-sm font-medium focus:border-green-500 focus:ring-green-500"
                                            />
                                        ) : (
                                            <div className="text-sm font-bold text-gray-900">{Number(it.qty)}</div>
                                        )}
                                    </td>
                                    {(isSecurity || isDriver) && (
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <div className="flex justify-center gap-2">
                                                {isSecurity &&
                                                    (dispatch.status === 'APPROVED' || dispatch.status === 'IN_TRANSIT' || dispatch.status === 'DISPATCHED') &&
                                                    !it.handedOutAt && (
                                                    <form action={markItemHandedOut} className="flex items-center gap-1.5">
                                                        <input type="hidden" name="itemId" value={it.id} />
                                                        <input 
                                                            type="number" 
                                                            name="qty" 
                                                            defaultValue={Number(it.qty)} 
                                                            min={0.01} 
                                                            max={Number(it.qty)}
                                                            step="0.01"
                                                            className="w-20 rounded-md border-gray-300 py-1 px-2 text-xs font-medium focus:border-green-500 focus:ring-green-500 shadow-sm transition-all hover:border-green-400" 
                                                        />
                                                        <LoadingButton
                                                            type="submit"
                                                            className="inline-flex items-center rounded-md border border-transparent bg-green-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-green-700 transition-all active:scale-95"
                                                            loadingText="..."
                                                        >
                                                            Dispatch
                                                        </LoadingButton>
                                                    </form>
                                                )}
                                                {isSecurity && it.handedOutAt && (
                                                    <div className="flex flex-col items-center">
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border",
                                                            dispatch.status === 'DISPATCHED' || dispatch.status === 'IN_TRANSIT' || dispatch.status === 'DELIVERED'
                                                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                        )}>
                                                            <CheckIcon className="h-4 w-4" />
                                                            {dispatch.status === 'DISPATCHED' || dispatch.status === 'IN_TRANSIT' || dispatch.status === 'DELIVERED' 
                                                                ? 'Dispatched' 
                                                                : 'Handed Out'}
                                                        </span>
                                                        <span className="text-[10px] text-gray-500 mt-1 font-medium">
                                                            {new Date(it.handedOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                )}
                                                {/* Hidden for now as requested by user - Driver item acknowledgement */}
                                                {/* {isDriver &&
                                                    (dispatch.status === 'IN_TRANSIT' ||
                                                    dispatch.status === 'APPROVED' ||
                                                    dispatch.status === 'DELIVERED') &&
                                                    it.handedOutAt &&
                                                    !it.receivedAt && (
                                                    <form action={acknowledgeReceived}>
                                                        <input type="hidden" name="itemId" value={it.id} />
                                                        <LoadingButton 
                                                            type="submit"
                                                            className="inline-flex items-center rounded border border-transparent bg-barmlo-green px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-barmlo-green/90"
                                                            loadingText="..."
                                                        >
                                                            Received
                                                        </LoadingButton>
                                                    </form>
                                                )} */}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Note & Info */}
            {dispatch.note && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">Dispatch Note</h3>
                    <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border border-gray-100">{dispatch.note}</p>
                </div>
            )}

            {/* Action Footer */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-center gap-4">
                    <div className="flex gap-3 w-full">
                        <DispatchAcknowledgment 
                            dispatch={dispatch} 
                            userId={me.id!} 
                            userRole={role ?? ''} 
                        />
                        {canApprove && dispatch.status === 'SUBMITTED' && (
                            <ApproveDispatchButton dispatchId={dispatch.id} />
                        )}
                    </div>

                    {canEdit && (
                      <form
                        id="editForm"
                        action={saveAction}
                        className="w-full border-t border-gray-100 pt-4"
                      >
                        <div className="grid w-full gap-3 sm:grid-cols-3">
                          <LoadingButton
                            type="submit"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
                            loadingText="Saving..."
                          >
                            {!isProjectOps && <CheckIcon className="h-4 w-4" />}
                            Save Changes
                          </LoadingButton>
                          <LoadingButton
                            formAction={submitAction}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-barmlo-green px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-barmlo-green/90 hover:shadow-lg"
                            loadingText="Dispatching..."
                          >
                            {!isProjectOps && <ShieldCheckIcon className="h-4 w-4" />}
                            Dispatch
                          </LoadingButton>
                          <LoadingButton
                            formAction={deleteAction}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-6 py-3 text-sm font-bold text-red-600 hover:bg-red-100"
                            loadingText="Deleting..."
                          >
                            {!isProjectOps && <TrashIcon className="h-4 w-4" />}
                            Delete Draft
                          </LoadingButton>
                        </div>
                      </form>
                    )}
                </div>

                {canAssignDriver && (
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm w-full">
                        <h4 className="text-sm font-bold text-gray-700 mb-3">Assign Driver</h4>
                        <AssignDriverForm 
                            dispatchId={dispatch.id} 
                            drivers={drivers} 
                            currentDriverId={dispatch.assignedToDriverId} 
                        />
                    </div>
                )}

                {/* Return Section (if applicable) */}
                {canReturn && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <form action={returnAction}>
                            <div className="border-b border-gray-200 pb-4 mb-4">
                                <h3 className="text-lg font-bold text-gray-900">Return / Mark Used Out</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Process returns to inventory or mark items as consumed on site.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-12 gap-4 border-b border-gray-100 pb-2 text-xs font-bold uppercase text-gray-500">
                                    <div className="col-span-4">Item</div>
                                    <div className="col-span-2">Return Qty</div>
                                    <div className="col-span-2 text-center">Mark Used</div>
                                    <div className="col-span-4">Note</div>
                                </div>
                                
                                {dispatch.items
                                .filter((it) => Number(it.qty) > 0)
                                .map((it) => (
                                    <div key={it.id} className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-50 last:border-0">
                                        <div className="col-span-4">
                                            <div className="text-sm font-bold text-gray-900">{it.description}</div>
                                            <div className="text-xs text-gray-500">
                                                Dispatched: {Number(it.qty)} {it.unit ?? ''}
                                            </div>
                                        </div>

                                        <div className="col-span-2">
                                            <input
                                                name={`return-${it.id}`}
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="0"
                                                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div className="col-span-2 flex items-center justify-center">
                                            <input
                                                name={`usedout-${it.id}`}
                                                type="checkbox"
                                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div className="col-span-4">
                                            <input
                                                name={`note-${it.id}`}
                                                type="text"
                                                placeholder="Reason..."
                                                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm focus:bg-white focus:border-blue-500 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="mt-6 border-t border-gray-100 pt-4">
                                <LoadingButton 
                                    type="submit"
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-barmlo-green px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-barmlo-green/90 hover:shadow-lg"
                                    loadingText="Processing..."
                                >
                                    Process Return / Used Out
                                </LoadingButton>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
