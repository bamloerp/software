import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { assertRoles } from '@/lib/workflow';
import { redirect } from 'next/navigation';
import { DispatchStatusBadge } from '@/components/ui/dispatch-status-badge';
import TablePagination from '@/components/ui/table-pagination';
import DispatchTableToolbar from './components/DispatchTableToolbar';
import { 
  TruckIcon, 
  EyeIcon, 
  PlusIcon,
  FolderIcon,
  UserIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  HashtagIcon,
  CheckCircleIcon,
  CalendarIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';
import { getPendingDispatchItems, type PendingDispatchItem } from '@/lib/dispatch-logic';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; pageSize?: string; driver?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  try {
    assertRoles(me.role as any, ['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'PROCUREMENT', 'SENIOR_PROCUREMENT', 'SECURITY', 'ADMIN', 'STORE_KEEPER', 'DRIVER'] as any);
  } catch {
    redirect('/projects');
  }

  const { q, page, status, pageSize, driver } = await searchParams;
  const currentPage = Math.max(1, Number(page || '1'));
  const size = Math.max(1, Number(pageSize || '20'));
  
  // Force driver view if the user is explicitly a driver role, or if URL param is set
  const isDriver = me.role === 'DRIVER';
  const isDriverView = isDriver || driver === 'me';

  const where: any = {};
  
  if (q) {
    where.OR = [
      { id: { contains: q, mode: 'insensitive' } },
      { createdBy: { name: { contains: q, mode: 'insensitive' } } },
      { project: { projectNumber: { contains: q, mode: 'insensitive' } } },
      { project: { quote: { customer: { displayName: { contains: q, mode: 'insensitive' } } } } },
    ];
  }

  // Determine effective status (defaulting to READY for most roles if not specified)
  const defaultStatus = (me.role === 'SECURITY' || me.role === 'DRIVER') ? 'APPROVED' : 'READY';
  const effectiveStatus = status ?? defaultStatus;

  if (effectiveStatus) {
    where.status = effectiveStatus === 'ALL' ? undefined : effectiveStatus;
    // Special handling: READY is a virtual status, not a DB status for dispatches
    if (effectiveStatus === 'READY') delete where.status; 
    
    if (where.status === undefined) delete where.status; // Cleanup if ALL or deleted
  }

  // Enforce driver filter
  if (isDriverView) {
    where.assignedToDriverId = me.id;
  }

  const isReadyMode = effectiveStatus === 'READY';
  let dispatches: any[] = [];
  let pendingProjects: PendingDispatchItem[] = [];
  let total = 0;

  if (isReadyMode) {
    pendingProjects = await getPendingDispatchItems(me.id!, me.role!);
    total = pendingProjects.length;
    // Manual pagination for projects
    pendingProjects = pendingProjects.slice((currentPage - 1) * size, currentPage * size);
  } else {
    const [d, t] = await Promise.all([
      prisma.dispatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (currentPage - 1) * size,
        take: size,
        include: {
          createdBy: { select: { name: true } },
          project: {
            select: {
              projectNumber: true,
              quote: {
                select: {
                  customer: { select: { displayName: true } }
                }
              }
            }
          },
        },
      }),
      prisma.dispatch.count({ where }),
    ]);
    dispatches = d;
    total = t;
  }

  const hasMultipurposeStock = await prisma.inventoryItem.count({
    where: { category: 'MULTIPURPOSE', qty: { gt: 0 } }
  }) > 0;

  const totalPages = Math.ceil(total / size);

  return (
    <div className="space-y-8 p-2 sm:p-4 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
            <TruckIcon className="h-8 w-8 text-barmlo-blue dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Dispatches</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage inventory dispatches and requests.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-gray-700 dark:bg-gray-800">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
           <DispatchTableToolbar role={me.role} hideStatusFilter={isDriverView} />
        </div>

        <div className="overflow-x-auto">
          {isReadyMode ? (
             <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
               <thead className="bg-gray-50/80 backdrop-blur-sm dark:bg-gray-900/50">
                 <tr>
                   <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <FolderIcon className="h-4 w-4" />
                        Project
                      </div>
                   </th>
                   <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4" />
                        Customer
                      </div>
                   </th>
                   <th scope="col" className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <ClipboardDocumentListIcon className="h-4 w-4" />
                        Pending Items
                      </div>
                   </th>
                   <th scope="col" className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <Cog6ToothIcon className="h-4 w-4" />
                        Action
                      </div>
                   </th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                 {pendingProjects.length === 0 ? (
                   <tr>
                     <td className="px-6 py-12 text-center text-gray-500 dark:text-gray-400" colSpan={4}>
                       <div className="flex flex-col items-center justify-center gap-2">
                          <TruckIcon className="h-10 w-10 text-gray-300" />
                          <p className="text-base font-medium">No projects ready for dispatch</p>
                          <p className="text-sm">All received items have been dispatched.</p>
                       </div>
                     </td>
                   </tr>
                 ) : (
                   pendingProjects.map((p) => (
                     <tr key={p.id} className="group hover:bg-blue-50/30 transition-colors dark:hover:bg-gray-700/50">
                       <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">
                         {p.projectNumber}
                       </td>
                       <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                         {p.customerName}
                       </td>
                       <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                            {p.pendingCount} Items
                          </span>
                       </td>
                       <td className="px-6 py-4 text-center">
                            <Link
                               href={`/projects/${p.id}/dispatches/new`}
                               className="inline-flex items-center gap-1 rounded border border-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                             >
                               <PlusIcon className="h-3.5 w-3.5" />
                               Create Dispatch
                             </Link>
                             {hasMultipurposeStock && (
                               <Link
                                 href={`/projects/${p.id}/dispatches/stock`}
                                 className="inline-flex items-center gap-1 rounded border border-blue-500 px-3 py-1.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"
                               >
                                 <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
                                 Dispatch Tools
                               </Link>
                             )}
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
          ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50/80 backdrop-blur-sm dark:bg-gray-900/50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <HashtagIcon className="h-4 w-4" />
                    Ref #
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <FolderIcon className="h-4 w-4" />
                    Project
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    Requester
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircleIcon className="h-4 w-4" />
                    Status
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Date
                  </div>
                </th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <Cog6ToothIcon className="h-4 w-4" />
                    Action
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {dispatches.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-gray-500 dark:text-gray-400" colSpan={6}>
                    <div className="flex flex-col items-center justify-center gap-2">
                       <TruckIcon className="h-10 w-10 text-gray-300" />
                       <p className="text-base font-medium">No dispatches found</p>
                       <p className="text-sm">Try adjusting your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                dispatches.map((d) => (
                  <tr key={d.id} className="group hover:bg-blue-50/30 transition-colors dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">
                      {d.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                       <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-gray-200">{d.project?.projectNumber || 'N/A'}</span>
                          <span className="text-xs text-gray-500">{d.project?.quote?.customer?.displayName}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {d.createdBy?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                       <div className="flex justify-center">
                          <DispatchStatusBadge status={d.status} />
                       </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link 
                        href={`/dispatches/${d.id}`}
                        className="inline-flex items-center gap-1 rounded border border-emerald-500 px-2 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                      >
                        <EyeIcon className="h-3.5 w-3.5" />
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          )}
        </div>
        
        {/* Pagination */}
        {total > 0 && (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={total}
              pageSize={size}
            />
          </div>
        )}
      </div>
    </div>
  );
}
