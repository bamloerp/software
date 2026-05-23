import Link from 'next/link';

import { prisma } from '@/lib/db';

import type { Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';

import { resolveOfficeForRole } from '@/lib/office';

import { USER_ROLES, type QuoteStatus, type UserRole } from '@/lib/workflow';

import Money from '@/components/Money';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',

  SUBMITTED_REVIEW: 'Submitted for Review',

  REVIEWED: 'Reviewed',

  SENT_TO_SALES: 'Sent to Sales',

  NEGOTIATION: 'Negotiation',

  FINALIZED: 'Finalized',

  ARCHIVED: 'Archived',
};

const STATUS_BADGE_CLASSES: Record<QuoteStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',

  SUBMITTED_REVIEW: 'bg-blue-100 text-blue-700',

  REVIEWED: 'bg-emerald-100 text-emerald-700',

  SENT_TO_SALES: 'bg-amber-100 text-amber-700',

  NEGOTIATION: 'bg-purple-100 text-purple-700',

  FINALIZED: 'bg-green-100 text-green-700',

  ARCHIVED: 'bg-gray-200 text-gray-600',
};

function coerceUserRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;

  return (USER_ROLES as readonly string[]).includes(role) ? (role as UserRole) : null;
}

function parseTotal(metaJson: string | null): number | null {
  if (!metaJson) return null;

  try {
    const meta = JSON.parse(metaJson);

    const total = meta?.totals?.grandTotal;

    return typeof total === 'number' ? total : null;
  } catch {
    return null;
  }
}

export default async function MyQuotesPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <div className="p-6 text-sm text-gray-700">Authentication required.</div>;
  }

  const role = coerceUserRole(currentUser.role);

  if (!role) {
    return <div className="p-6 text-sm text-gray-700">Unsupported user role.</div>;
  }

  let userOffice: string | null = null;

  try {
    userOffice = resolveOfficeForRole(role, currentUser.office ?? null);
  } catch (error) {
    console.error('[office]', error);

    return (
      <div className="p-6 text-sm text-gray-700">
        Your office is not configured. Please contact an administrator.
      </div>
    );
  }

  const currentUserId = currentUser.id ?? null;

  let statusFilter: QuoteStatus[] | null = null;

  let title = 'My Quotes';

  let description = 'Quotations relevant to your role.';

  const where: Prisma.QuoteWhereInput = {};

  if (role === 'ADMIN') {
    // no additional filters

    title = 'All Quotations';

    description = 'All quotations across the organisation.';
  } else if (role === 'QS') {
    if (!currentUserId) {
      return <div className="p-6 text-sm text-gray-700">User identifier missing.</div>;
    }

    where.createdById = currentUserId;

    title = 'My Quotes';

    description = 'Quotations created by you.';
  } else if (role === 'SENIOR_QS') {
    statusFilter = ['SUBMITTED_REVIEW', 'NEGOTIATION'];

    where.office = userOffice ?? undefined;

    where.status = { in: statusFilter };

    title = 'Review Queue';

    description = 'Quotations awaiting your review or negotiation.';
  } else if (role === 'SALES') {
    statusFilter = ['REVIEWED', 'SENT_TO_SALES', 'NEGOTIATION'];

    where.office = userOffice ?? undefined;

    where.status = { in: statusFilter };

    title = 'Sales Pipeline';

    description = 'Quotations ready for your attention.';
  } else if (role === 'PROJECT_OPERATIONS_OFFICER') {
    if (!currentUserId) {
      return <div className="p-6 text-sm text-gray-700">User identifier missing.</div>;
    }

    where.projectManagerId = currentUserId;

    title = 'Assigned Projects';

    description = 'Quotations assigned to you as project manager.';
  } else if (role === 'CLIENT') {
    if (!currentUserId) {
      return <div className="p-6 text-sm text-gray-700">User identifier missing.</div>;
    }

    where.office = userOffice ?? undefined;

    where.projectTasks = { some: { assigneeId: currentUserId } };

    title = 'My Tasks';

    description = 'Quotations with tasks assigned to you.';
  } else {
    return (
      <div className="p-6 text-sm text-gray-700">Use the client portal to view quotations.</div>
    );
  }

  const quotes = await prisma.quote.findMany({
    where,

    include: {
      customer: true,

      projectManager: { select: { id: true, name: true } },
    },

    orderBy: { updatedAt: 'desc' },

    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>

        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{description}</p>
      </div>

      {quotes.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          No quotations found for your current filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                <th className="px-4 py-3">Quote</th>

                <th className="px-4 py-3">Client</th>

                <th className="px-4 py-3">Status</th>

                <th className="px-4 py-3">Value</th>

                <th className="px-4 py-3">Updated</th>

                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white text-sm dark:divide-gray-800 dark:bg-gray-900 dark:text-gray-100">
              {quotes.map((quote) => {
                const total = parseTotal(quote.metaJson);

                const status = (quote.status as QuoteStatus) ?? 'DRAFT';

                const statusLabel = STATUS_LABELS[status] ?? status;

                const badgeClass = STATUS_BADGE_CLASSES[status] ?? 'bg-gray-100 text-gray-700';

                return (
                  <tr key={quote.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {quote.number ?? quote.id}
                      </div>

                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {quote.projectManager
                          ? `PM: ${quote.projectManager.name ?? quote.projectManager.id}`
                          : 'Project manager not assigned'}
                      </div>
                    </td>

                    <td className="px-4 py-3">{quote.customer?.displayName ?? '-'}</td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}
                      >
                        {statusLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3">{total !== null ? <Money value={total} /> : '-'}</td>

                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(quote.updatedAt).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="inline-flex items-center rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
