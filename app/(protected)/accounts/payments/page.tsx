import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { 
  EyeIcon, 
  BriefcaseIcon, 
  UserIcon, 
  DocumentCheckIcon, 
  BanknotesIcon, 
  CurrencyDollarIcon, 
  BoltIcon 
} from '@heroicons/react/24/outline';
import { SearchInput } from '@/components/ui/search-input';
import TablePagination from '@/components/ui/table-pagination';
import PageSizeSelector from '@/components/ui/page-size-selector';
import { readQuoteGrandTotal } from '@/lib/accounting';
import { filterUnpaidProjects } from '@/lib/payment-filter';

const formatMoney = (minor: bigint | number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(minor) / 100);
};

export default async function PaymentsDashboard({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; pageSize?: string }>;
}) {
  const me = await getCurrentUser();

  if (!me) {
    redirect('/login');
  }
  if (!['SALES_ACCOUNTS', 'ACCOUNTS', 'ADMIN'].includes(me.role as string)) {
    redirect('/dashboard');
  }

  const { page, q, pageSize } = await searchParams;
  const currentPage = Number(page) || 1;
  const itemsPerPage = Number(pageSize) || 10;
  const skip = (currentPage - 1) * itemsPerPage;

  // Build Where Clause
  const where: any = {};
  if (q) {
    where.OR = [
      { projectNumber: { contains: q, mode: 'insensitive' } },
      { quote: { customer: { displayName: { contains: q, mode: 'insensitive' } } } },
      { quote: { number: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      quote: {
        include: {
          customer: true,
          lines: true,
        },
      },
      clientPayments: true,
    },
  });

  const filteredProjects = filterUnpaidProjects(
    projects.map((p) => ({
      id: p.id,
      contractValueMinor: p.quote
        ? BigInt(Math.round(readQuoteGrandTotal(p.quote as any) * 100))
        : 0n,
      totalPaidMinor: p.clientPayments.reduce(
        (sum, pay) => sum + BigInt(pay.amountMinor),
        0n,
      ),
    })),
  );

  const unpaidProjectIds = new Set(filteredProjects.map((p) => p.id));
  const visibleProjects = projects.filter((project) => unpaidProjectIds.has(project.id)).slice(skip, skip + itemsPerPage);
  const totalItems = filteredProjects.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
           <h1 className="text-3xl font-bold tracking-tight text-gray-900">Project Payments</h1>
           <p className="text-gray-500">Select a project to view payment history and record new payments.</p>
        </div>
        <div className="flex items-center gap-4 w-full sm:w-auto">
            <PageSizeSelector />
            <div className="w-full sm:w-72">
                <SearchInput placeholder="Search BM number or customer..." />
            </div>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center gap-1">
                    <BriefcaseIcon className="h-4 w-4" />
                    Project
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center gap-1">
                    <UserIcon className="h-4 w-4" />
                    Customer
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center justify-end gap-1">
                    <DocumentCheckIcon className="h-4 w-4" />
                    Verified Contract
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center justify-end gap-1">
                    <BanknotesIcon className="h-4 w-4" />
                    Paid to Date
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center justify-end gap-1">
                    <CurrencyDollarIcon className="h-4 w-4" />
                    Balance
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center justify-center gap-1">
                    <BoltIcon className="h-4 w-4" />
                    Action
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {visibleProjects.length === 0 ? (
                <tr>
                   <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-sm font-medium text-gray-900">No outstanding projects found</p>
                        <p className="text-sm text-gray-500">All matching projects are fully paid</p>
                      </div>
                   </td>
                </tr>
              ) : (
                visibleProjects.map((p) => {
                  const contractValue = p.quote ? BigInt(Math.round(readQuoteGrandTotal(p.quote as any) * 100)) : 0n;
                  const totalPaid = p.clientPayments.reduce((sum, pay) => sum + BigInt(pay.amountMinor), 0n);
                  const balance = contractValue - totalPaid;

                  return (
                    <tr key={p.id} className="group hover:bg-gray-50/80 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-gray-900">{p.projectNumber || p.id.slice(0, 8)}</span>
                          <span className="text-xs text-gray-500 font-mono">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-700">{p.quote?.customer?.displayName || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-sm text-gray-900">
                        {formatMoney(contractValue)}
                      </td>
                       <td className="px-6 py-4 text-right tabular-nums text-sm text-emerald-600 font-medium">
                        {formatMoney(totalPaid)}
                      </td>
                       <td className="px-6 py-4 text-right tabular-nums text-sm font-medium text-gray-900">
                        {formatMoney(balance)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          href={`/projects/${p.id}/payments`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-all"
                        >
                          <EyeIcon className="h-3.5 w-3.5 text-gray-500" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        <TablePagination
            currentPage={currentPage}
            pageSize={itemsPerPage}
            totalItems={totalItems}
        />
      </section>
    </div>
  );
}
