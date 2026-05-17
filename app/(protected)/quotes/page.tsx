// app/(protected)/quotes/page.tsx
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { assertRole } from '@/lib/workflow';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import { 
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
  UserGroupIcon,
  MapPinIcon,
  CalendarDaysIcon,
  UserCircleIcon,
  TagIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import QuoteTableToolbar from './components/QuoteTableToolbar';
import QuotePagination from './components/QuotePagination';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  SUBMITTED_REVIEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  REVIEWED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  SENT_TO_SALES: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  NEGOTIATION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  FINALIZED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ARCHIVED: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// Map status to Impazamon style "Waiting for assessment" red pill etc. if needed, 
// but sticking to existing logic with rounded pills is safer for now, just styled similarly.
// Impazamon: Red pill "Waiting for assessment"

export default async function QuotesPage(props: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const searchParams = await props.searchParams;
  const me = await getCurrentUser();

  // If not authenticated, redirect immediately
  if (!me) redirect('/login');

  const role = assertRole(me.role);

  // Authorize
  const allowed = new Set(['QS', 'SENIOR_QS', 'SALES', 'ADMIN']);
  if (!allowed.has(role)) {
    redirect('/projects');
  }

  // Parsing search params
  const page = Number(searchParams.page) || 1;
  const pageSize = Number(searchParams.limit) || 20;
  const statusFilter = searchParams.status as string | undefined;
  const searchQuery = searchParams.q as string | undefined;

  const skip = (page - 1) * pageSize;

  // Role-based filters + Search filters
  let where: any = {};
  const view = searchParams.view as string | undefined;

  // Base role filter
  if (role === 'QS') {
    if (view === 'my') {
      where = { ...where, createdById: me.id };
    } else {
      where = { ...where, status: 'DRAFT' };
    }
  } else if (role === 'SENIOR_QS') {
    if (view === 'my') {
      where = { ...where, createdById: me.id };
    }
    // Otherwise SENIOR_QS sees ALL quotations across ALL stages (no status filter)
  } else if (role === 'SALES') {
    where = { ...where, status: { in: ['REVIEWED', 'SENT_TO_SALES', 'NEGOTIATION'] } };
  } // ADMIN sees all

  // Override role filter if status is explicitly requested (and allowed? For now assuming filters are additive or strict override)
  // Actually, usually users filter WITHIN their allowed scope.
  // So if I am QS, I can only see DRAFT. If I select "FINALIZED" in filter, I should see nothing or the filter should be hidden.
  // For simplicity, I will AND the filters.
  if (statusFilter) {
    // If role has restrictions, ensure we don't breach them.
    // E.g. if role=QS (only DRAFT), and user filters FINALIZED, result is empty.
    // The where clause for role is already set. I should merge them.
    if (where.status) {
        if (typeof where.status === 'string') {
            if (where.status !== statusFilter) {
                // Conflict: Role says DRAFT, Filter says FINALIZED -> Empty
                where = { ...where, status: 'IMPOSSIBLE_STATUS' };
            }
        } else if (where.status.in) {
             if (!where.status.in.includes(statusFilter)) {
                 where = { ...where, status: 'IMPOSSIBLE_STATUS' };
             } else {
                 where.status = statusFilter;
             }
        }
    } else {
        where.status = statusFilter;
    }
  }

  // Search filter
  if (searchQuery) {
    where = {
        ...where,
        OR: [
            { number: { contains: searchQuery, mode: 'insensitive' } },
            { customer: { displayName: { contains: searchQuery, mode: 'insensitive' } } },
            { customer: { city: { contains: searchQuery, mode: 'insensitive' } } },
        ]
    };
  }

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        customer: { select: { displayName: true, city: true } },
        createdById: true, // To show "Logged By" if we want
        createdBy: { select: { name: true, email: true } }
      },
      skip,
      take: pageSize,
    }),
    prisma.quote.count({ where }),
  ]);

  let pageTitle = 'Quotes';
  let pageDescription = 'Manage and view your quotations';

  if (view === 'my') {
    pageTitle = 'My Quotes';
    pageDescription = 'Quotations created by you';
  } else if (statusFilter === 'SENT_TO_SALES') {
    pageTitle = 'New Quotations';
    pageDescription = 'Quotations sent to sales pending review';
  } else if (statusFilter === 'REVIEWED') {
    pageTitle = 'Pending Endorsements';
    pageDescription = 'Reviewed quotations ready for endorsement';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{pageTitle}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{pageDescription}</p>
        </div>
        <div className="flex gap-3">
          {role !== 'SALES' && (
            <Link
              href="/quotes/new"
              className="inline-flex items-center gap-2 rounded-xl bg-barmlo-blue px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-barmlo-blue/90 hover:shadow-lg dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <PlusIcon className="h-4 w-4" />
              New Quote
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 p-4">
        <QuoteTableToolbar />

        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <UserGroupIcon className="h-4 w-4" />
                    Customer
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <MapPinIcon className="h-4 w-4" />
                    Location
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <CalendarDaysIcon className="h-4 w-4" />
                    Date
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <UserCircleIcon className="h-4 w-4" />
                    Logged By
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <TagIcon className="h-4 w-4" />
                    Status
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <BoltIcon className="h-4 w-4" />
                    Action(s)
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {quotes.length === 0 ? (
                 <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                       No quotes found matching your criteria.
                    </td>
                 </tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {q.customer?.displayName || 'Walk-in Customer'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {q.customer?.city || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(q.updatedAt).toLocaleDateString()} <span className="text-xs text-gray-400">{new Date(q.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {q.createdBy?.name || q.createdBy?.email || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                          STATUS_BADGE[q.status] || 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {q.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Edit Button - Hidden as requested */}
                        {/* <Link
                            href={`/quotes/${q.id}`}
                            className="flex items-center gap-1 rounded border border-barmlo-blue px-2 py-1 text-xs font-bold text-barmlo-blue transition-colors hover:bg-barmlo-blue/10 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                            Edit
                        </Link> */}
                        {/* View/Review Button - Green */}
                        <Link
                            href={`/quotes/${q.id}`}
                            className="flex items-center gap-1 rounded border border-emerald-500 px-2 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                        >
                            {role === 'SENIOR_QS' ? (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                    Review
                                </>
                            ) : (
                                <>
                                    <EyeIcon className="h-3.5 w-3.5" />
                                    View
                                </>
                            )}
                        </Link>
                        {role === 'ADMIN' && (
                          <DeleteQuoteButton
                            quoteId={q.id}
                            quoteNumber={q.quoteNumber}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <QuotePagination total={total} currentPage={page} pageSize={pageSize} />
      </div>
    </div>
  );
}
