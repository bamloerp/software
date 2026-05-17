/* import Link from 'next/link';

import Money from '@/components/Money';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fromMinor } from '@/helpers/money';
import { USER_ROLES, type UserRole } from '@/lib/workflow';

import ManualItemsForm from './ManualItemsForm';

export const runtime = 'nodejs';

type PageParams = {
  params: Promise<{ quoteId: string }>;
};

type QuoteLineWithVersion = Awaited<ReturnType<typeof loadQuote>>['lines'][number];

const USER_ROLE_SET = new Set<UserRole>(USER_ROLES as unknown as UserRole[]);

function coerceUserRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;
  return USER_ROLE_SET.has(role as UserRole) ? (role as UserRole) : null;
}

async function loadQuote(quoteId: string) {
  return prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      lines: {
        include: {
          addedInVersion: { select: { id: true, version: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

function ManualBadge({ line }: { line: QuoteLineWithVersion }) {
  if (line.source !== 'Manual') return null;
  const versionNumber = line.addedInVersion?.version;
  return (
    <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
      Manual{typeof versionNumber === 'number' ? ` (v${versionNumber})` : ''}
    </span>
  );
}

export default async function QuoteManualEditPage({ params }: PageParams) {
  const { quoteId } = await params;
  const [quote, currentUser] = await Promise.all([loadQuote(quoteId), getCurrentUser()]);

  if (!quote) {
    return <div className="p-6 text-sm text-gray-600">Quote not found.</div>;
  }

  const role = coerceUserRole(currentUser?.role);
  if (!role || (role !== 'QS' && role !== 'ADMIN')) {
    return <div className="p-6 text-sm text-gray-600">You do not have access to this page.</div>;
  }

  const vatPercent = quote.vatBps / 100;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Manual Items — Quote {quote.number ?? quote.id}</h1>
          <p className="text-sm text-gray-500">
            Add QS-only manual lines. Totals update automatically after save.
          </p>
        </div>
        <Link
          href={`/quotes/${quote.id}`}
          className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          ← Back to quote
        </Link>
      </header>

      <section className="rounded border bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
          Existing Lines
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <span>{line.description}</span>
                    <ManualBadge line={line} />
                  </td>
                  <td className="px-3 py-2">{line.unit ?? '-'}</td>
                  <td className="px-3 py-2 text-right">{Number(line.quantity).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Money value={fromMinor(line.unitPriceMinor)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money value={fromMinor(line.lineTotalMinor)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <ManualItemsForm quoteId={quote.id} vatPercent={vatPercent} />
    </div>
  );
}
 */
//@ts-nocheck
import Link from 'next/link';

import Money from '@/components/Money';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fromMinor } from '@/helpers/money';
import { USER_ROLES, type UserRole } from '@/lib/workflow';
import { listManualLineSuggestions } from '@/lib/manualLineTemplates';

import ManualItemsForm from './ManualItemsForm';

export const runtime = 'nodejs';

type PageParams = {
  params: Promise<{ quoteId: string }>;
};

type QuoteLineWithVersion = Awaited<ReturnType<typeof loadQuote>>['lines'][number];

const USER_ROLE_SET = new Set<UserRole>(USER_ROLES as unknown as UserRole[]);

function coerceUserRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;
  return USER_ROLE_SET.has(role as UserRole) ? (role as UserRole) : null;
}

async function loadQuote(quoteId: string) {
  return prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      customer: true,
      lines: {
        include: {
          addedInVersion: { select: { id: true, version: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

function ManualBadge({ line }: { line: QuoteLineWithVersion }) {
  if (line.source !== 'Manual') return null;
  const versionNumber = line.addedInVersion?.version;
  return (
    <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
      Manual{typeof versionNumber === 'number' ? ` (v${versionNumber})` : ''}
    </span>
  );
}

function LockedBanner({ status }: { status: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Editing is disabled because this quote is <strong>{status}</strong>. You can view existing
      lines below, but adding items is not allowed.
    </div>
  );
}

export default async function QuoteManualEditPage({ params }: PageParams) {
  const { quoteId } = await params;
  const [quote, currentUser] = await Promise.all([loadQuote(quoteId), getCurrentUser()]);

  if (!quote) {
    return <div className="p-6 text-sm text-gray-600">Quote not found.</div>;
  }

  const role = coerceUserRole(currentUser?.role);
  if (!role || (role !== 'QS' && role !== 'ADMIN')) {
    return <div className="p-6 text-sm text-gray-600">You do not have access to this page.</div>;
  }

  // 🔒 Only allow editing if NOT FINALIZED and NOT ARCHIVED
  const isLocked = quote.status === 'FINALIZED' || quote.status === 'ARCHIVED';

  const vatPercent = quote.vatBps / 100;

  const suggestions = !isLocked && currentUser?.id
    ? await listManualLineSuggestions(currentUser.id)
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Manual Items — Quote {quote.number ?? quote.id}
          </h1>
          <p className="text-sm text-gray-500">
            Add QS-only manual lines. Totals update automatically after save.
          </p>
        </div>
        <Link
          href={`/quotes/${quote.id}`}
          className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          ← Back to quote
        </Link>
      </header>

      {isLocked && <LockedBanner status={quote.status} />}

      <section className="rounded border bg-white shadow-sm">
        <div className="border-b bg-gray-50 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
          Existing Lines
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <span>{line.description}</span>
                    <ManualBadge line={line} />
                  </td>
                  <td className="px-3 py-2">{line.unit ?? '-'}</td>
                  <td className="px-3 py-2 text-right">{Number(line.quantity).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Money value={fromMinor(line.unitPriceMinor)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money value={fromMinor(line.lineTotalMinor)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 🛠️ Only render the form when editing is allowed */}
      {!isLocked && <ManualItemsForm quoteId={quote.id} vatPercent={vatPercent} suggestions={suggestions} />}
    </div>
  );
}
