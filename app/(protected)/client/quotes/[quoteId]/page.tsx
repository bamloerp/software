import React from 'react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import Money from '@/components/Money';
import { proposeNegotiationAmountOnly } from '@/app/(protected)/quotes/[quoteId]/actions';
import { prisma } from '@/lib/db';
import type { QuoteLine, QuoteNegotiationItem } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash.server';
import { getErrorMessage } from '@/lib/errors';
import { fromMinor } from '@/helpers/money';
import SubmitButton from '@/components/SubmitButton';
import Image from 'next/image';
import { PhoneIcon, HomeIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/solid';
import { 
  DocumentTextIcon, 
  TagIcon, 
  HashtagIcon, 
  CurrencyDollarIcon, 
  InformationCircleIcon, 
  PencilSquareIcon 
} from '@heroicons/react/24/outline';

export const runtime = 'nodejs';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED_REVIEW: 'Submitted for Review',
  REVIEWED: 'Reviewed',
  SENT_TO_SALES: 'Sent to Sales',
  NEGOTIATION: 'Negotiation',
  NEGOTIATION_REVIEW: 'Negotiation Review',
  FINALIZED: 'Finalized',
  ARCHIVED: 'Archived',
};

const NEGOTIATION_BADGE_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  OK: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVIEWED: 'bg-indigo-100 text-indigo-700',
  FINAL: 'bg-indigo-100 text-indigo-700',
};

type ClientQuotePageParams = {
  params: Promise<{ quoteId: string }>;
};

function computeTotals(
  lines: {
    lineSubtotalMinor: bigint | number;
    lineDiscountMinor: bigint | number;
    lineTaxMinor: bigint | number;
    lineTotalMinor: bigint | number;
  }[]
) {
  const subtotalMinor = lines.reduce((acc, line) => acc + BigInt(line.lineSubtotalMinor), 0n);
  const discountMinor = lines.reduce((acc, line) => acc + BigInt(line.lineDiscountMinor), 0n);
  const taxMinor = lines.reduce((acc, line) => acc + BigInt(line.lineTaxMinor), 0n);
  const totalMinor = lines.reduce((acc, line) => acc + BigInt(line.lineTotalMinor), 0n);
  const netMinor = subtotalMinor - discountMinor;
  return {
    subtotal: fromMinor(subtotalMinor),
    discount: fromMinor(discountMinor),
    net: fromMinor(netMinor),
    tax: fromMinor(taxMinor),
    grandTotal: fromMinor(totalMinor),
  };
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function deriveRateFromTotal(total: number, quantity: number, vatRate: number): number {
  if (!(quantity > 0) || !Number.isFinite(total)) {
    return 0;
  }
  const netTotal = total / (1 + vatRate);
  return Number((netTotal / quantity).toFixed(2));
}

function deriveRateFromMinor(
  totalMinor: bigint | number,
  quantity: number,
  vatRate: number
): number {
  return deriveRateFromTotal(fromMinor(totalMinor), quantity, vatRate);
}

type LineGroup = {
  section: string;
  rows: any[];
};

function buildLineGroups(lines: any[], negotiationByLine: Map<string, any>, vatRate: number): LineGroup[] {
  const groups = new Map<string, LineGroup>();

  lines.forEach((line) => {
    const meta = parseJson<Record<string, unknown>>(line.metaJson);
    const section =
      typeof meta?.section === 'string' && meta.section.trim().length > 0 ? meta.section : 'Items';

    if (!groups.has(section)) {
      groups.set(section, { section, rows: [] });
    }

    const group = groups.get(section)!;
    const unit = line.unit ?? (typeof meta?.unit === 'string' ? meta.unit : null);
    const rate = fromMinor(line.unitPriceMinor);
    const quantity = Number(line.quantity);
    const negotiationItem = negotiationByLine.get(line.id) ?? null;

    group.rows.push({
      ...line,
      unit,
      rate,
      quantity,
      negotiationItem,
    });
  });

  return Array.from(groups.values());
}

export default async function ClientQuotePage({ params }: ClientQuotePageParams) {
  const { quoteId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return <div className="p-6">You must sign in to view client quotes.</div>;
  }

  if (user.role !== 'CLIENT' && user.role !== 'ADMIN' && user.role !== 'SALES') {
    return <div className="p-6">This area is only available to client accounts.</div>;
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      project: { select: { name: true } },
      lines: {
        include: {
          addedInVersion: { select: { version: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      negotiations: {
        include: {
          proposedVersion: true,
          originalVersion: true,
          items: {
            include: {
              quoteLine: true,
              reviewedBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      versions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!quote) {
    return <div className="p-6">Quote not found.</div>;
  }

  const ownsQuote =
    user.role === 'ADMIN' ||
    user.role === 'SALES' ||
    (quote.customer?.email && user.email && quote.customer.email === user.email);

  if (!ownsQuote) {
    return <div className="p-6">You do not have access to this quote.</div>;
  }

  const activeCycle = quote.negotiationCycle ?? 0;

  console.log(quote);

  const latestNegotiation = quote.negotiations[0] ?? null;
  console.log('Latest negotiation:', latestNegotiation);
  const allResolved =
    !!latestNegotiation &&
    latestNegotiation.items.every((i) => i.status === 'OK' || i.status === 'ACCEPTED');

  let role = user.role;
  let stat = quote?.status;
  const canSubmitProposal =
    (role === 'CLIENT' || role === 'SALES' || role === 'ADMIN') &&
    stat === 'NEGOTIATION' &&
    !(latestNegotiation && latestNegotiation.status !== 'OPEN') &&
    !allResolved;

  console.log('Can submit proposal:', canSubmitProposal);
  const negotiationByLine = new Map<string, any>();
  if (latestNegotiation) {
    latestNegotiation.items.forEach((item) => {
      negotiationByLine.set(item.quoteLineId, item);
    });
  }

  const totals = computeTotals(quote.lines);
  const vatRate = quote.vatBps / 10000;
  const vatPercent = vatRate * 100;
  const latestVersion = quote.versions[0] ?? null;

  const groups = buildLineGroups(quote.lines, negotiationByLine, vatRate);

  const submitProposal = async (formData: FormData) => {
    'use server';

    try {
      const activeCycle = quote.negotiationCycle ?? 0;

      const payload = quote.lines
        .filter((line) => (line.cycle ?? 0) === activeCycle)
        .map((line) => {
          const key = `line-${line.id}-rate`;
          const raw = formData.get(key);
          if (raw == null || raw === '') return null;
          const rate = Number(raw);
          if (!Number.isFinite(rate) || rate < 0) {
            throw new Error(`Invalid rate for line ${(line as QuoteLine).description}`);
          }
          return { lineId: line.id, rate };
        })
        .filter(Boolean) as { lineId: string; rate: number }[];

      if (payload.length === 0) {
        throw new Error('Provide at least one rate to propose.');
      }

      const result = await proposeNegotiationAmountOnly(quote.id, payload);

      if (!result.ok) {
        throw new Error(result.error ?? 'Failed to submit proposal.');
      }

      setFlashMessage({ type: 'success', message: 'Proposal submitted for review.' });
    } catch (error) {
      setFlashMessage({ type: 'error', message: getErrorMessage(error) });
    }

    revalidatePath(`/client/quotes/${quote.id}`);
    revalidatePath(`/quotes/${quote.id}`);

    const currentUser = await getCurrentUser();
    if (currentUser?.role === 'SALES') {
      redirect('/dashboard');
    }

    redirect(`/quotes/${quote.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 shadow-sm border border-gray-200 rounded-lg print:border-none print:shadow-none">
        {/* Top Section: Logo & Contact */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-6">
             <div className="relative mb-2 h-32 w-72 max-w-full">
               <Image src="/Barmlo%20Logo%202026.png" alt="Barmlo Logo" fill className="object-contain object-left" />
             </div>

          <div className="flex flex-col gap-2 text-sm text-blue-900 mt-4 md:mt-0 text-right md:items-end">
             <div className="flex items-center gap-2 justify-end">
                <PhoneIcon className="w-4 h-4 text-blue-900" />
                <span className="font-bold italic">+263782939350, +263787555007</span>
             </div>
             <div className="flex items-center gap-2 justify-end">
                <HomeIcon className="w-4 h-4 text-blue-900" />
                <span className="font-bold italic">132 J Chinamano Ave Harare</span>
             </div>
             <div className="flex items-center gap-2 justify-end">
                <EnvelopeIcon className="w-4 h-4 text-blue-900" />
                <span className="font-bold italic">info@barmlo.co.zw</span>
             </div>
             <div className="flex items-center gap-2 justify-end">
                <GlobeAltIcon className="w-4 h-4 text-blue-900" />
                <span className="font-bold italic">www.barmlo.co.zw</span>
             </div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-0.5 bg-blue-900 mb-4"></div>

        {/* TIN / Vendor & Title */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-8">
           <div className="text-sm font-bold text-gray-700 space-y-1">
              <p>TIN NO: 2000873176</p>
              <p>VENDOR NO: 718689</p>
           </div>
           <div className="mt-4 md:mt-0">
              <h2 className="text-3xl font-bold text-gray-500 uppercase tracking-wide">QUOTATION</h2>
           </div>
        </div>

        {/* Info Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
           {/* Customer Info */}
           <div className="border border-gray-300">
              <div className="bg-blue-100/50 px-2 py-1 border-b border-gray-300 font-bold text-gray-700 text-sm">CUSTOMER INFO</div>
              <div className="p-2 text-sm space-y-1">
                 <p><span className="font-bold text-gray-700">Name:</span> {quote.customer?.displayName}</p>
                 <p><span className="font-bold text-gray-700">Address:</span> {quote.customer?.city || 'Harare'}</p>
                 <p><span className="font-bold text-gray-700">Phone, E-mail:</span> {quote.customer?.phone || quote.customer?.email || '-'}</p>
                 <p><span className="font-bold text-gray-700">Ref:</span> {quote.project?.name || 'PROPOSED HOUSE CONSTRUCTION'}</p>
              </div>
           </div>

           {/* Quote Details */}
           <div className="border border-gray-300">
              <div className="grid grid-cols-2 border-b border-gray-300 bg-blue-100/50 text-center font-bold text-gray-700 text-sm">
                 <div className="px-2 py-1 border-r border-gray-300">QUOTE #</div>
                 <div className="px-2 py-1">DATE</div>
              </div>
              <div className="grid grid-cols-2 border-b border-gray-300 text-center text-sm">
                 <div className="px-2 py-1 border-r border-gray-300">{quote.number || quote.id.slice(0, 8)}</div>
                 <div className="px-2 py-1">{new Date(quote.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="grid grid-cols-2 border-b border-gray-300 bg-blue-100/50 text-center font-bold text-gray-700 text-sm">
                 <div className="px-2 py-1 border-r border-gray-300">CUSTOMER ID</div>
                 <div className="px-2 py-1">VALID UNTIL</div>
              </div>
              <div className="grid grid-cols-2 text-center text-sm">
                 <div className="px-2 py-1 border-r border-gray-300">{quote.customer?.id.slice(0, 5) || 'CUST01'}</div>
                 <div className="px-2 py-1">{new Date(new Date(quote.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</div>
              </div>
           </div>
        </div>
      </div>

      {/* <section className="rounded border bg-white p-4 shadow-sm">
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <span className="font-semibold">Customer:</span> {quote.customer?.displayName ?? '-'}
          </div>
          <div>
            <span className="font-semibold">Currency:</span> {quote.currency}
          </div>
          <div>
            <span className="font-semibold">VAT:</span> {vatPercent.toFixed(2)}%
          </div>
          <div>
            <span className="font-semibold">Grand Total:</span> <Money value={totals.grandTotal} />
          </div>
        </div>
      </section> */}

      <form action={submitProposal} className="space-y-4">
        <section className="rounded border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <DocumentTextIcon className="h-4 w-4 text-gray-500" />
                    <span>Description</span>
                  </div>
                </th>
                <th className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <TagIcon className="h-4 w-4 text-gray-500" />
                    <span>Unit</span>
                  </div>
                </th>
                <th className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <HashtagIcon className="h-4 w-4 text-gray-500" />
                    <span>Qty</span>
                  </div>
                </th>
                <th className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <CurrencyDollarIcon className="h-4 w-4 text-gray-500" />
                    <span>Current Rate</span>
                  </div>
                </th>
                <th className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <InformationCircleIcon className="h-4 w-4 text-gray-500" />
                    <span>Status</span>
                  </div>
                </th>
                {quote.status === 'NEGOTIATION' && (
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <PencilSquareIcon className="h-4 w-4 text-gray-500" />
                      <span>Proposed Rate</span>
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <React.Fragment key={group.section}>
                  <tr className="bg-gray-50">
                    <td
                      colSpan={quote.status === 'NEGOTIATION' ? 6 : 5}
                      className="px-3 py-2 font-bold text-gray-700 border-y"
                    >
                      {group.section}
                    </td>
                  </tr>
                  {group.rows.map((line) => {
                    const rate = line.rate;
                    const lineCycle = line.cycle ?? 0;
                    const isCurrentCycle = lineCycle === activeCycle;
                    const negotiationItem = line.negotiationItem;
                    const quantity = line.quantity;
                    const statusRaw = negotiationItem?.status ?? null;
                    const status = statusRaw === 'REVIEWED' ? 'FINAL' : statusRaw;
                    const proposedRate = negotiationItem
                      ? deriveRateFromMinor(negotiationItem.proposedTotalMinor, quantity, vatRate)
                      : rate;
                    const isPending = status === null || status === 'PENDING' || status === 'REJECTED';
                    const isEditable = isCurrentCycle && isPending;
                    const displayValue = isPending ? proposedRate : rate;

                    const statusLabel = status
                      ? status
                          .toLowerCase()
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (char: any) => char.toUpperCase())
                      : null;

                    const statusClass = status
                      ? (NEGOTIATION_BADGE_CLASSES[status as keyof typeof NEGOTIATION_BADGE_CLASSES] ??
                        'bg-gray-100 text-gray-600')
                      : null;
                    const reviewer = negotiationItem?.reviewedBy
                      ? (negotiationItem.reviewedBy.name ?? negotiationItem.reviewedBy.email)
                      : null;

                    return (
                      <tr key={line.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            <span>{line.description}</span>
                            {line.source === 'Manual' && (
                              <span className="inline-flex w-fit items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                                Manual
                                {line.addedInVersion?.version
                                  ? ` (v${line.addedInVersion.version})`
                                  : ''}
                              </span>
                            )}
                            {!isCurrentCycle && (
                              <span className="text-xs text-gray-500">Locked (cycle {lineCycle})</span>
                            )}
                            {status && reviewer && status !== 'PENDING' && (
                              <span className="text-xs text-gray-500">Reviewed by {reviewer}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">{line.unit ?? '-'}</td>
                        <td className="px-3 py-2 text-right">{quantity.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <Money value={rate} />
                        </td>

                        <td className="px-3 py-2 text-right">
                          {statusLabel ? (
                            <span
                              className={clsx(
                                'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
                                statusClass
                              )}
                            >
                              {statusLabel}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No proposal</span>
                          )}
                          {!isCurrentCycle && (
                            <span className="mt-1 block text-[10px] uppercase text-gray-400">
                              Locked (cycle {lineCycle})
                            </span>
                          )}
                        </td>
                        {quote.status === 'NEGOTIATION' && (
                          <td className="px-3 py-2 text-right">
                            {isEditable ? (
                              <input
                                type="number"
                                name={`line-${line.id}-rate`}
                                defaultValue={displayValue.toFixed(2)}
                                min="0"
                                step="0.01"
                                className={clsx(
                                  'w-28 rounded border border-gray-300 px-2 py-1 text-right shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
                                )}
                              />
                            ) : (
                              <Money value={displayValue} />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </section>

        {canSubmitProposal && (
          <div className="mt-8">
            <SubmitButton
              loadingText="Submitting..."
              className="w-full rounded-xl bg-green-600 py-4 text-lg font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-lg"
            >
              Submit Proposal
            </SubmitButton>
          </div>
        )}
      </form>
    </div>
  );
}
