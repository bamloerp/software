'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ClearableNumberInput from './ClearableNumberInput';

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

type ExtraRequestRow = {
  id: string;
  qty: number;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requiresAdmin: boolean;
  requestedByName: string;
  requestedByRole?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  createdAt: string;
};

type Props = {
  clientGrouped: Record<string, LineRow[]>;
  initiallySelected?: { quoteLineId: string; qty: number }[];
  projectId: string;
  currentRole?: string | null;
  requestsByLine: Record<string, ExtraRequestRow[]>;
};

type ExtraModalState =
  | { mode: 'request'; line: LineRow }
  | { mode: 'review'; line: LineRow; request: ExtraRequestRow };

const REQUEST_ROLES = new Set(['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN']);
const REVIEW_ROLES = new Set(['PROJECT_COORDINATOR', 'ADMIN']);

export default function RequisitionPickerClient({
  clientGrouped,
  initiallySelected = [],
  projectId,
  currentRole,
  requestsByLine,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [catSelectAll, setCatSelectAll] = useState<Record<string, boolean>>({});
  const [extraModal, setExtraModal] = useState<ExtraModalState | null>(null);
  const [modalDraft, setModalDraft] = useState<{ qty: string; reason: string }>({ qty: '', reason: '' });
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  const categories = useMemo(() => Object.keys(clientGrouped), [clientGrouped]);
  const flat = useMemo(() => categories.flatMap((cat) => clientGrouped[cat] || []), [categories, clientGrouped]);
  const idxToId = useMemo(() => flat.map((l) => l.id), [flat]);

  useEffect(() => {
    const initialSelected = new Set(initiallySelected.map((row) => row.quoteLineId));
    const sel: Record<string, boolean> = {};
    const q: Record<string, number> = {};
    const catAll: Record<string, boolean> = {};
    for (const [cat, lines] of Object.entries(clientGrouped)) {
      catAll[cat] = false;
      for (const ln of lines) {
        const defaultQty = ln.remaining > 0 ? ln.remaining : 0;
        const isInit = initialSelected.has(ln.id);
        const restoredQty = isInit
          ? Math.min(
              defaultQty,
              Math.max(0, initiallySelected.find((row) => row.quoteLineId === ln.id)?.qty ?? defaultQty),
            )
          : defaultQty;
        sel[ln.id] = selected[ln.id] ?? (isInit && restoredQty > 0);
        q[ln.id] =
          ln.id in qtys
            ? qtys[ln.id]
            : restoredQty;
      }
    }
    setSelected(sel);
    setQtys(q);
    setCatSelectAll(catAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientGrouped]);

  const syncCategoryState = (id: string, updated: Record<string, boolean>) => {
    for (const [cat, lines] of Object.entries(clientGrouped)) {
      if (lines.some((l) => l.id === id)) {
        const all = lines.every((ln) => updated[ln.id]);
        setCatSelectAll((prev) => ({ ...prev, [cat]: all }));
        break;
      }
    }
  };

  const toggleLine = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      syncCategoryState(id, next);
      return next;
    });
  };

  const onQtyChange = (id: string, raw: string, max: number) => {
    let n = Number(raw);
    if (!Number.isFinite(n)) n = 0;
    n = Math.ceil(n);
    if (n < 0) n = 0;
    if (n > max) n = max;
    setQtys((prev) => ({ ...prev, [id]: n }));
    setSelected((prev) => {
      const next = { ...prev, [id]: n > 0 };
      syncCategoryState(id, next);
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    const lines = clientGrouped[cat] ?? [];
    const newVal = !catSelectAll[cat];
    setCatSelectAll((prev) => ({ ...prev, [cat]: newVal }));
    setSelected((prev) => {
      const next = { ...prev };
      for (const ln of lines) next[ln.id] = newVal;
      return next;
    });
    setQtys((prev) => {
      const next = { ...prev };
      for (const ln of lines) {
        if (newVal) {
          const fallback = next[ln.id];
          const numericRaw = Number(fallback);
          const numeric = Number.isFinite(numericRaw) ? numericRaw : ln.remaining;
          next[ln.id] = Math.min(ln.remaining, Math.max(0, numeric));
        } else {
          next[ln.id] = 0;
        }
      }
      return next;
    });
  };

  const canRequestMore = REQUEST_ROLES.has(currentRole ?? '');

  const openNewRequestModal = (line: LineRow) => {
    setModalDraft({ qty: '', reason: '' });
    setModalError(null);
    setExtraModal({ mode: 'request', line });
  };

  const openReviewModal = (line: LineRow, request: ExtraRequestRow) => {
    setModalError(null);
    setExtraModal({ mode: 'review', line, request });
  };

  const submitExtraRequest = () => {
    if (!extraModal || extraModal.mode !== 'request') return;
    const qty = Number(modalDraft.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setModalError('Enter a quantity greater than zero.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quote-lines/${extraModal.line.id}/extra-request`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ qty, reason: modalDraft.reason }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setModalError(data?.error ?? 'Failed to request more');
          return;
        }
        setExtraModal(null);
        router.refresh();
      } catch (err: any) {
        setModalError(err?.message ?? 'Failed to request more');
      }
    });
  };

  const decideExtraRequest = (approve: boolean) => {
    if (!extraModal || extraModal.mode !== 'review') return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/quote-line-extra/${extraModal.request.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ approve }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setModalError(data?.error ?? 'Failed to update request');
          return;
        }
        setExtraModal(null);
        router.refresh();
      } catch (err: any) {
        setModalError(err?.message ?? 'Failed to update request');
      }
    });
  };

  const closeModal = () => {
    setExtraModal(null);
    setModalError(null);
  };

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <section key={cat} className="space-y-4">
          <div className="flex items-center justify-between rounded-t-xl bg-gray-50 p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-500"></span>
              {cat}
            </h2>
            <label className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                checked={Boolean(catSelectAll[cat])}
                onChange={() => toggleCategory(cat)}
              />
              <span>Select All</span>
            </label>
          </div>

          <div className="overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 sm:pl-6 w-12">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Description
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-24">
                      Unit
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 w-24">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 w-24">
                      Used
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900 w-24">
                      Remaining
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-48">
                      Request Qty
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 w-32">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(clientGrouped[cat] || []).map((ln) => {
                    const idx = idxToId.indexOf(ln.id);
                    const namePrefix = `pick-${idx}`;
                    const isSelected = Boolean(selected[ln.id]);
                    const currentQty = qtys[ln.id] ?? 0;
                    const lineRequests = requestsByLine[ln.id] ?? [];
                    const pendingRequest = lineRequests.find((req) => req.status === 'PENDING');
                    const approvedSum = lineRequests
                      .filter((req) => req.status === 'APPROVED')
                      .reduce((sum, req) => sum + req.qty, 0);
                    const canReviewPending =
                      pendingRequest &&
                      (pendingRequest.requiresAdmin
                        ? currentRole === 'ADMIN'
                        : REVIEW_ROLES.has(currentRole ?? ''));

                    const canShowRequestButton =
                      canRequestMore && ln.remaining <= 0 && !pendingRequest;
                    const safeMax = Math.max(0, ln.remaining);

                    return (
                      <tr key={ln.id} className={isSelected ? 'bg-indigo-50/50' : undefined}>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 w-12">
                          <input
                            name={`${namePrefix}-include`}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLine(ln.id)}
                            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                          <label onClick={() => toggleLine(ln.id)} className="cursor-pointer hover:text-indigo-600">
                            {ln.description}
                          </label>
                          {pendingRequest && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                              <span className="font-semibold">Pending:</span> +{pendingRequest.qty} (by {pendingRequest.requestedByName})
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {ln.unit}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                          {ln.qtyOrdered + ln.approvedExtra}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                          {ln.alreadyRequested + ln.purchased}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-medium text-gray-900">
                          {ln.remaining}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <div className={isSelected ? 'opacity-100' : 'opacity-50 grayscale'}>
                            <input type="hidden" name={`${namePrefix}-quoteLineId`} value={ln.id} />
                            <ClearableNumberInput
                              name={`${namePrefix}-qty`}
                              type="text"
                              min={0}
                              max={safeMax}
                              step="1"
                              placeholder="0"
                              value={Number.isFinite(currentQty) ? Math.ceil(currentQty) : ''}
                              onChange={(e) => onQtyChange(ln.id, e.currentTarget.value, safeMax)}
                              className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 disabled:bg-gray-100"
                              allowEmpty
                            />
                          </div>
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          {canShowRequestButton && (
                            <button
                              type="button"
                              className="text-indigo-600 hover:text-indigo-900"
                              onClick={() => openNewRequestModal(ln)}
                            >
                              Request Extra
                            </button>
                          )}
                          {pendingRequest && canReviewPending && (
                            <button
                              type="button"
                              className="text-indigo-600 hover:text-indigo-900"
                              onClick={() => openReviewModal(ln, pendingRequest)}
                            >
                              Review
                            </button>
                          )}
                          {pendingRequest && !canReviewPending && (
                            <span className="text-xs text-amber-600 italic">Pending Approval</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {extraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all">
            <h3 className="text-lg font-bold text-gray-900">
              {extraModal.mode === 'request' ? 'Request Additional Quantity' : 'Review Quantity Request'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">{extraModal.line.description}</p>
            
            {extraModal.mode === 'request' ? (
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Quantity Needed</span>
                  <ClearableNumberInput
                    allowEmpty
                    className="block w-full rounded-lg border-0 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    value={modalDraft.qty}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setModalDraft((prev) => ({ ...prev, qty: value }));
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Reason for Request</span>
                  <textarea
                    className="block w-full rounded-lg border-0 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    rows={3}
                    placeholder="Why is more needed?"
                    value={modalDraft.reason}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setModalDraft((prev) => ({ ...prev, reason: value }));
                    }}
                  />
                </label>
                <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
                  Note: Requests are subject to approval by the project manager or admin.
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4 rounded-xl bg-gray-50 p-4 text-sm">
                <div className="flex justify-between border-b border-gray-200 pb-2">
                   <span className="text-gray-500">Requested Quantity</span>
                   <span className="font-semibold text-gray-900">+{extraModal.request.qty} {extraModal.line.unit ?? ''}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200 pb-2">
                   <span className="text-gray-500">Requested By</span>
                   <span className="font-medium text-gray-900">{extraModal.request.requestedByName}</span>
                </div>
                {extraModal.request.reason && (
                    <div className="pt-1">
                        <span className="block text-xs text-gray-500 mb-1">Reason provided:</span>
                        <p className="text-gray-800 italic">&quot;{extraModal.request.reason}&quot;</p>
                    </div>
                )}
              </div>
            )}

            {modalError && (
                 <div className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-600 ring-1 ring-inset ring-rose-200">
                    {modalError}
                 </div>
            )}
            
            <div className="mt-8 flex items-center justify-end gap-3">
              <button 
                type="button" 
                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors" 
                onClick={closeModal}
              >
                Cancel
              </button>
              {extraModal.mode === 'request' ? (
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={submitExtraRequest}
                  disabled={isSaving}
                >
                  {isSaving ? 'Submitting...' : 'Submit Request'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                    onClick={() => decideExtraRequest(false)}
                    disabled={isSaving}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50"
                    onClick={() => decideExtraRequest(true)}
                    disabled={isSaving}
                  >
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
