import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { permanentlyDeleteQuote, restoreDeletedQuote } from '../[quoteId]/actions';

function deletedAtFromMeta(metaJson: string | null) {
  try {
    const meta = metaJson ? JSON.parse(metaJson) : null;
    return meta?.recycleBin?.deletedAt ? new Date(meta.recycleBin.deletedAt) : null;
  } catch {
    return null;
  }
}

export default async function QuotesRecycleBinPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/quotes');

  const quotes = await prisma.quote.findMany({
    where: { status: 'ARCHIVED', project: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      number: true,
      updatedAt: true,
      metaJson: true,
      customer: { select: { displayName: true, city: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quotation Recycle Bin</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Restore deleted quotations or permanently remove quotations without projects.</p>
        </div>
        <Link href="/quotes" className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Quotes
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Quotation</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Deleted</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">Logged By</th>
              <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No deleted quotations.</td>
              </tr>
            ) : quotes.map((quote) => {
              const deletedAt = deletedAtFromMeta(quote.metaJson) ?? quote.updatedAt;
              return (
                <tr key={quote.id}>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{quote.number ?? quote.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {quote.customer?.displayName || 'Walk-in Customer'}{quote.customer?.city ? ` - ${quote.customer.city}` : ''}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{deletedAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{quote.createdBy?.name || quote.createdBy?.email || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <form action={restoreDeletedQuote.bind(null, quote.id)}>
                        <button type="submit" className="inline-flex items-center gap-1 rounded border border-emerald-500 px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-50">
                          <ArrowPathIcon className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      </form>
                      <form action={permanentlyDeleteQuote.bind(null, quote.id)}>
                        <button type="submit" className="inline-flex items-center gap-1 rounded border border-red-500 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">
                          <TrashIcon className="h-3.5 w-3.5" />
                          Permanent Delete
                        </button>
                      </form>
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
