'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import Money from '@/components/Money';
import { NegotiationActionPair } from '@/components/NegotiationActionPair';
import NegotiationStageDeleteButton from '@/components/NegotiationStageDeleteButton';
import { type QuoteSnapshot } from '@/lib/quoteSnapshot';
import { isLineIncludedInNegotiation } from '@/lib/negotiationSelections';
import { type QuoteLine, type QuoteNegotiation, type QuoteNegotiationItem } from '@prisma/client';
import { fromMinor } from '@/helpers/money';
import SubmitButton from '@/components/SubmitButton';

// Duplicated from page.tsx to avoid dependency issues
const NEGOTIATION_BADGE_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  OK: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVIEWED: 'bg-indigo-100 text-indigo-700',
  FINAL: 'bg-indigo-100 text-indigo-700',
};

function formatDecisionLabel(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveRateFromTotal(total: number, quantity: number, vatRate: number): number {
  if (!(quantity > 0) || !Number.isFinite(total)) {
    return 0;
  }
  // const netTotal = total / (1 + vatRate);
  const netTotal = total; 
  return Number((netTotal / quantity).toFixed(2));
}

type NegotiationSnapshot = {
  negotiation: QuoteNegotiation & {
    items: (QuoteNegotiationItem & {
      quoteLine: QuoteLine | null;
      reviewedBy: { id: string; name: string | null; email: string | null } | null;
    })[];
    createdBy: { id: string; name: string | null; email: string | null; role: string | null } | null;
  };
  proposedSnapshot: QuoteSnapshot | null;
  originalSnapshot: QuoteSnapshot | null;
};

interface NegotiationsListProps {
  negotiationSnapshots: NegotiationSnapshot[];
  quoteLines: QuoteLine[];
  isReviewer: boolean;
  vatRate: number;
  activeCycle: number;
  closeNegotiationAction: (negotiationId: string) => Promise<void>;
}

export default function NegotiationsList({
  negotiationSnapshots,
  quoteLines,
  isReviewer,
  vatRate,
  activeCycle,
  closeNegotiationAction,
}: NegotiationsListProps) {
  const [isOpen, setIsOpen] = useState(false);

  const lineDescription = new Map(quoteLines.map((line) => [line.id, line.description]));

  return (
    <section className="rounded-xl border bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-blue-50 px-4 py-3 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-900 dark:text-blue-100">
            Negotiations
          </h2>
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {negotiationSnapshots.length}
          </span>
        </div>
        {isOpen ? (
          <ChevronUpIcon className="h-5 w-5 text-blue-500" />
        ) : (
          <ChevronDownIcon className="h-5 w-5 text-blue-500" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-4">
            {negotiationSnapshots.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">No negotiations yet.</div>
            )}

            {negotiationSnapshots.map(
              ({ negotiation, proposedSnapshot, originalSnapshot }, index) => {
                const isLatest = index === 0;
                
                const allItemsResolved = negotiation.items.every(
                  (item) => item.status === 'OK' || item.status === 'ACCEPTED' || item.status === 'REVIEWED'
                );

                const canCloseProposal =
                  isReviewer && isLatest && negotiation.status === 'OPEN' && allItemsResolved;

                const totalDelta =
                  (proposedSnapshot?.totals.grandTotal ?? 0) - (originalSnapshot?.totals.grandTotal ?? 0);
                const stageDeleteRequests = new Map<string, number>();
                negotiation.items.forEach((item) => {
                  if (item.status !== 'PENDING') return;
                  if (isLineIncludedInNegotiation(proposedSnapshot, item.quoteLineId, true)) return;
                  const section = item.quoteLine?.section?.trim() || 'Items';
                  stageDeleteRequests.set(section, (stageDeleteRequests.get(section) ?? 0) + 1);
                });

                return (
                  <div
                    key={negotiation.id}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">
                          {negotiation.status === 'OPEN' ? 'OPEN REQUEST' : negotiation.status} -{' '}
                          {new Date(negotiation.createdAt).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Requested by {negotiation.createdBy?.name ?? negotiation.createdBy?.email ?? 'Unknown'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-sm font-semibold">
                        <div className="text-gray-900 dark:text-white text-right">
                          Proposal Total: <Money value={proposedSnapshot?.totals.grandTotal} />
                          {totalDelta !== 0 && (
                            <div
                              className={clsx(
                                'text-xs font-medium',
                                totalDelta > 0 ? 'text-red-600' : 'text-green-600'
                              )}
                            >
                              Difference: {totalDelta > 0 ? '+' : ''}
                              <Money value={totalDelta} />
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {isReviewer && isLatest && negotiation.status === 'OPEN' && stageDeleteRequests.size > 0 && (
                      <div className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/10">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
                          Stage delete requests
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[...stageDeleteRequests.entries()].map(([section, count]) => (
                            <NegotiationStageDeleteButton
                              key={section}
                              negotiationId={negotiation.id}
                              section={section}
                              count={count}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm dark:border-gray-700">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-10">#</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Description</th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-20">Unit</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Qty</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-32">Current Rate</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400 w-32">Proposed Rate</th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-32">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                          {negotiation.items.map((item, itemIndex) => {
                            const description =
                              lineDescription.get(item.quoteLineId) ?? 'Unknown Item';
                            
                            const quantity = Number(item.quoteLine?.quantity ?? 0);
                            
                            // Re-calculate current rate from original snapshot if possible, or use quote line
                            // But originalSnapshot might be null if it's a new negotiation?
                            // Actually, let's use the logic from page.tsx:
                            // "const currentRate = deriveRateFromTotal(currentTotal, quantity, vatRate);"
                            // where currentTotal comes from originalSnapshot lines.
                            
                            // Finding the line in original snapshot
                            const originalLine = originalSnapshot?.lines.find(l => l.lineId === item.quoteLineId);
                            const currentTotal = originalLine?.lineTotal ?? 0;
                            const currentRate = deriveRateFromTotal(currentTotal, quantity, vatRate);
                            
                            const proposedTotal = fromMinor(item.proposedTotalMinor);
                            const proposedRate = deriveRateFromTotal(proposedTotal, quantity, vatRate);
                            const deleteRequested = !isLineIncludedInNegotiation(proposedSnapshot, item.quoteLineId, true);
                            
                            const displayStatus = item.status === 'REVIEWED' ? 'FINAL' : item.status;
                            const reviewer = item.reviewedBy?.name ?? item.reviewedBy?.email;
                            
                            const line = quoteLines.find((l) => l.id === item.quoteLineId);
                            const lineCycle = typeof line?.cycle === 'number' ? line.cycle : 0;
                            const isCurrentCycleLine = lineCycle === activeCycle;

                            const canAct =
                              isLatest &&
                              negotiation.status === 'OPEN' &&
                              item.status === 'PENDING' &&
                              isReviewer &&
                              isCurrentCycleLine;

                            return (
                              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{itemIndex + 1}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                  <div>{description}</div>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span
                                      className={clsx(
                                        'inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-bold',
                                        NEGOTIATION_BADGE_CLASSES[displayStatus]
                                      )}
                                    >
                                      {formatDecisionLabel(displayStatus)}
                                    </span>
                                    {reviewer && (
                                      <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                        <UserIcon className="h-3 w-3" />
                                        <span>{reviewer}</span>
                                        {item.reviewedAt && (
                                          <span>• {new Date(item.reviewedAt).toLocaleDateString()}</span>
                                        )}
                                      </div>
                                    )}
                                    {deleteRequested && (
                                      <span className="inline-flex w-fit items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                        Delete Request
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">{item.quoteLine?.unit ?? '-'}</td>
                                <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white">{quantity.toLocaleString()}</td>
                                <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-white"><Money value={currentRate} /></td>
                                <td className="px-4 py-3 text-right text-sm font-bold text-blue-600 dark:text-blue-400">
                                  {deleteRequested ? 'Delete stage' : <Money value={proposedRate} />}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex justify-center">
                                    {canAct ? (
                                      <NegotiationActionPair
                                        itemId={item.id}
                                        initialRate={currentRate}
                                        mode={deleteRequested ? 'delete' : 'rate'}
                                      />
                                    ) : (
                                      <span className="text-[10px] text-gray-400 italic">
                                        {isCurrentCycleLine ? 'No actions' : `Locked`}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </section>
  );
}
