import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { assertRoles } from '@/lib/workflow';
import AssetsTableToolbar from './components/AssetsTableToolbar';
import TablePagination from '@/components/ui/table-pagination';
import Link from 'next/link';
import { 
  CubeIcon, 
  TagIcon, 
  ScaleIcon, 
  CalculatorIcon, 
  PlusIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';

type SearchParamsShape = {
  q?: string;
  page?: string;
  pageSize?: string;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AssetsPage(props: {
  searchParams: Promise<SearchParamsShape>;
}) {
  const searchParams = await props.searchParams;
  const me = await getCurrentUser();
  if (!me) {
    redirect('/login');
  }
  try {
    assertRoles(me.role as any, ['ADMIN', 'DEPUTY_ADMIN', 'MANAGING_DIRECTOR', 'PROJECT_COORDINATOR'] as any);
  } catch {
    redirect('/projects');
  }

  const q = (searchParams.q ?? '').trim();
  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const pageSize = Math.max(1, Number(searchParams.pageSize ?? '30'));

  const where: any = { category: 'MULTIPURPOSE' };
  if (q) where.name = { contains: q, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        dispatchItems: {
          where: { selected: true },
          orderBy: { dispatch: { createdAt: 'desc' } },
          select: {
            id: true,
            qty: true,
            returnedQty: true,
            handedOutQty: true,
            dispatch: {
              select: {
                id: true,
                status: true,
                createdAt: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    projectNumber: true,
                    quote: { select: { customer: { select: { displayName: true, city: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-8 p-2 sm:p-4 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
            <CubeIcon className="h-8 w-8 text-barmlo-blue dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Assets Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Add and manage multipurpose materials and tools inventory.
            </p>
          </div>
        </div>
      </div>

      {/* Add New Asset Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <PlusIcon className="h-5 w-5 text-barmlo-blue" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add New Asset</h2>
          </div>
        </div>
        
        <div className="p-6">
          <form action={addMultipurposeAsset} className="grid gap-6 md:grid-cols-12 items-end">
              <div className="md:col-span-5 space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">Asset Name</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <TagIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                        name="name" 
                        placeholder="e.g. Heavy Duty Hammer" 
                        className="block w-full rounded-lg border-gray-300 pl-10 py-3 text-sm shadow-sm transition-colors focus:border-barmlo-blue focus:ring-barmlo-blue dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400" 
                        required 
                    />
                  </div>
              </div>
              
              <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">Unit</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <ScaleIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input 
                        name="unit" 
                        placeholder="e.g. pcs, kg" 
                        className="block w-full rounded-lg border-gray-300 pl-10 py-3 text-sm shadow-sm transition-colors focus:border-barmlo-blue focus:ring-barmlo-blue dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400" 
                    />
                  </div>
              </div>
              
              <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">Initial Qty</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <CalculatorIcon className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        name="qty"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0"
                        className="block w-full rounded-lg border-gray-300 pl-10 py-3 text-sm shadow-sm transition-colors focus:border-barmlo-blue focus:ring-barmlo-blue dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                        required
                    />
                  </div>
              </div>
              
              <div className="md:col-span-2">
                  <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-green-700 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 active:scale-95">
                      <PlusIcon className="h-4 w-4 stroke-2" />
                      Add Asset
                  </button>
              </div>
          </form>
        </div>
      </div>

      {/* Table Section */}
      <div className="space-y-4">
        <AssetsTableToolbar />

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50/80 backdrop-blur-sm dark:bg-gray-900/50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Asset Details
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Unit
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Deployed To
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Quantity On Hand
                  </th>
                  <th scope="col" className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {items.length === 0 ? (
                  <tr>
                    <td className="px-6 py-12 text-center text-gray-500 dark:text-gray-400" colSpan={5}>
                      <div className="flex flex-col items-center justify-center gap-2">
                        <ArchiveBoxIcon className="h-10 w-10 text-gray-300" />
                        <p className="text-base font-medium">No assets found</p>
                        <p className="text-sm">Try adjusting your search or add a new asset above.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id} className="group hover:bg-blue-50/30 transition-colors dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 mr-3 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                <CubeIcon className="h-4 w-4" />
                            </div>
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-gray-100">{it.name}</div>
                                {it.description && it.description !== it.name && (
                                    <div className="text-xs text-gray-500">{it.description}</div>
                                )}
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {it.unit ?? 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {it.dispatchItems.length === 0 ? (
                          <span className="text-sm text-gray-400">Not deployed</span>
                        ) : (
                          <div className="space-y-2">
                            {it.dispatchItems.map((deployment) => {
                              const project = deployment.dispatch.project;
                              const deployedQty = deployment.handedOutQty > 0
                                ? deployment.handedOutQty
                                : deployment.qty;
                              const remainingAtProject = Math.max(0, deployedQty - Number(deployment.returnedQty ?? 0));
                              return (
                                <Link
                                  key={deployment.id}
                                  href={`/projects/${project.id}/dispatches/${deployment.dispatch.id}`}
                                  className="block rounded-lg border border-gray-200 px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-700"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                      {project.projectNumber || project.name || 'Project'}
                                    </span>
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                      {remainingAtProject} {it.unit ?? ''}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {project.quote.customer.displayName}
                                    {project.quote.customer.city ? ` • ${project.quote.customer.city}` : ''}
                                    {` • ${deployment.dispatch.status}`}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-mono font-medium ${Number(it.qty) > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-500'}`}>
                            {it.qty}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                         {Number(it.qty) > 0 ? (
                             <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                In Stock
                             </span>
                         ) : (
                             <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                                Out of Stock
                             </span>
                         )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="border-t border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800">
              <TablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function addMultipurposeAsset(formData: FormData) {
  'use server';

  const me = await getCurrentUser();
  if (!me) redirect('/login');
  assertRoles((me as any).role, ['ADMIN', 'DEPUTY_ADMIN', 'MANAGING_DIRECTOR', 'PROJECT_COORDINATOR'] as any);

  const name = String(formData.get('name') || '').trim();
  const unit = String(formData.get('unit') || '').trim() || null;
  const qty = Number(formData.get('qty') || 0);
  const category = 'MULTIPURPOSE';

  if (!name || isNaN(qty)) {
    redirect('/assets');
  }

  const key = `${name}|${unit || ''}`.toLowerCase();

  await prisma.inventoryItem.upsert({
    where: { key },
    update: {
      qty: { increment: qty },
      quantity: { increment: qty },
      category,
    },
    create: {
      name,
      description: name,
      unit,
      qty,
      quantity: qty,
      category,
      key,
    },
  });

  redirect('/assets');
}
