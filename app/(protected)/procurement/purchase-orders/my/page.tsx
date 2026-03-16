import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import DownloadPdfButton from '@/components/DownloadPdfButton';
import { generatePurchaseOrderPdf } from '../[poId]/pdf-actions';
import TablePagination from '@/components/ui/table-pagination';
import MyPOsToolbar from './MyPOsToolbar';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SUBMITTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  ORDERED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  PURCHASED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  PARTIAL: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  RECEIVED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export default async function MyPurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; pageSize?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) return <div className="p-6 text-sm text-gray-600">Authentication required.</div>;

  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const pageSize = Number(sp.pageSize) || 20;

  const where: any = {};

  if (sp.status && sp.status !== 'ALL') {
    where.status = sp.status;
  }

  if (sp.q) {
    where.AND = [
      {
        OR: [
          { id: { contains: sp.q, mode: 'insensitive' } },
          { vendor: { contains: sp.q, mode: 'insensitive' } },
          { requisition: { project: { projectNumber: { contains: sp.q, mode: 'insensitive' } } } },
          { project: { projectNumber: { contains: sp.q, mode: 'insensitive' } } },
          { project: { quote: { customer: { displayName: { contains: sp.q, mode: 'insensitive' } } } } },
          { requisition: { project: { quote: { customer: { displayName: { contains: sp.q, mode: 'insensitive' } } } } } },
        ],
      },
    ];
  }

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        requisition: {
          include: {
            project: {
              select: {
                id: true,
                projectNumber: true,
                quote: { select: { customer: { select: { displayName: true } } } },
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            projectNumber: true,
            quote: { select: { customer: { select: { displayName: true } } } },
          },
        },
        items: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">All Purchase Orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All submitted purchase orders &middot; {total} total
          </p>
        </div>
      </div>

      <MyPOsToolbar />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 p-4">
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">PO #</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Project / Customer</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Vendor</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {pos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                pos.map((po) => {
                  const project = po.requisition?.project ?? po.project;
                  const customerName = project?.quote?.customer?.displayName;

                  return (
                    <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {po.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {project?.projectNumber || 'N/A'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {customerName || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {po.vendor || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                        {(Number(po.requestedMinor) / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                            STATUS_BADGE[po.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
                          )}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {new Date(po.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/procurement/purchase-orders/${po.id}`}
                            className="flex items-center gap-1 rounded border border-emerald-500 px-2 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                          >
                            <ArrowRightIcon className="h-3.5 w-3.5" />
                            View
                          </Link>
                          <DownloadPdfButton
                            quoteId={po.id}
                            generatePdf={generatePurchaseOrderPdf}
                            size="xs"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <TablePagination total={total} currentPage={page} pageSize={pageSize} />
        </div>
      </div>
    </div>
  );
}
