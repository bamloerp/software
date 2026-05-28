import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { assertRole } from '@/lib/workflow';
import { computeBalances, nextDueDate, formatDateYMD } from '@/lib/accounting';
import { reconcilePaymentScheduleToGrandTotal } from '@/app/lib/payments';
import Link from 'next/link';
import DispatchTableClient from '@/components/DispatchTableClient';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createDispatchFromPurchases,
  createDispatchFromInventory,
  createDispatchFromSelectedInventory,
  createRequisitionFromQuote,
  generatePaymentSchedule,
  createDispatchFromPurchasesAndTools,
  createMultipurposeDispatch,
  createScheduleFromQuote,
  requestFunding,
  ensureProjectIsPlanned,
} from '../actions';
import { createPOFromRequisition } from '@/app/(protected)/procurement/requisitions/[requisitionId]/actions';
import Money from '@/components/Money';
import { createDispatch as create_dispatch } from './dispatch-actions';
import { fromMinor } from '@/helpers/money';
import { recordDisbursement } from '@/app/(protected)/projects/actions';
import { recordClientPayment } from '@/app/(protected)/accounts/actions';
import SubmitButton from '@/components/SubmitButton';
import { setFlashMessage } from '@/lib/flash.server';
import ScheduleBlock from './_Schedule';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import DailyTasksPage from './daily-tasks/page';
import ProjectReportsPage from './reports/page';

export const runtime = 'nodejs';

async function createProcurementRequisition(projectId: string, note?: string) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (role !== 'PROJECT_OPERATIONS_OFFICER' && role !== 'ADMIN') throw new Error('Only PM/Admin');
  await ensureProjectIsPlanned(projectId);
  await prisma.procurementRequisition.create({
    data: { projectId, status: 'PENDING', note: note ?? null, submittedById: user.id! },
  });
  revalidatePath(`/projects/${projectId}`);
}

async function recordPurchase(
  requisitionId: string,
  input: { vendor: string; taxInvoiceNo: string; price: number; date: string }
) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['PROCUREMENT', 'SENIOR_PROCUREMENT', 'ADMIN'].includes(role)) throw new Error('Only Procurement/Admin');
  const reqProject = await prisma.procurementRequisition.findUnique({
    where: { id: requisitionId },
    select: { projectId: true },
  });
  if (!reqProject) throw new Error('Requisition not found');
  await ensureProjectIsPlanned(reqProject.projectId);
  await prisma.purchase.create({
    data: {
      requisitionId,
      vendor: input.vendor,
      taxInvoiceNo: input.taxInvoiceNo,
      priceMinor: BigInt(Math.round(input.price * 100)),
      purchasedAt: new Date(input.date),
    },
  });
  revalidatePath(`/projects/${reqProject.projectId}`);
}

async function createDispatch(
  projectId: string,
  items: Array<{ description: string; qty: number; unit?: string | null; requisitionItemId?: string | null }>
) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes(role)) throw new Error('Only PM/Admin');
  await ensureProjectIsPlanned(projectId);

  // Validate quantities against inventory/purchases
  for (const item of items) {
    if (item.requisitionItemId) {
      const [purchasedAgg, dispatchedAgg] = await Promise.all([
        prisma.purchase.aggregate({
          where: { requisitionItemId: item.requisitionItemId },
          _sum: { qty: true },
        }),
        prisma.dispatchItem.aggregate({
          where: { requisitionItemId: item.requisitionItemId },
          _sum: { qty: true },
        }),
      ]);
      const purchased = Number(purchasedAgg._sum.qty ?? 0);
      const dispatched = Number(dispatchedAgg._sum.qty ?? 0);
      const remaining = Math.max(0, purchased - dispatched);
      
      if (item.qty > remaining) {
        throw new Error(`Cannot dispatch ${item.qty} of ${item.description}. Only ${remaining} remaining.`);
      }
    }
  }

  await prisma.dispatch.create({
    data: {
      projectId,
      items: {
        create: items.map((i) => ({
          description: i.description,
          qty: i.qty,
          unit: i.unit ?? null,
          requisitionItemId: i.requisitionItemId ?? null,
        })),
      },
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

async function securityApprove(dispatchId: string, driverName: string) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['SECURITY', 'ADMIN'].includes(role)) throw new Error('Only Security/Admin');
  const d = await prisma.dispatch.update({
    where: { id: dispatchId },
    data: { status: 'OUT_FOR_DELIVERY', securityById: user.id!, driverName },
    include: { project: true },
  });
  revalidatePath(`/projects/${d.projectId}`);
}

import { 
  BuildingOfficeIcon, 
  CalendarIcon, 
  HashtagIcon, 
  MapPinIcon, 
  BanknotesIcon, 
  ArrowLeftIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

async function markDelivered(dispatchId: string, signedBy: string) {
  'use server';
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');
  const role = assertRole(user.role);
  if (!['DRIVER', 'SECURITY', 'ADMIN'].includes(role))
    throw new Error('Only Driver/Security/Admin');

  let d = null;
  if (['DRIVER'].includes(role)) {
    d = await prisma.dispatch.update({
      where: { id: dispatchId },
      data: { status: 'DELIVERED', signedBy, driverSignedAt: new Date(), driverById: user.id! },
      include: { project: true },
    });
  }
  if (['SECURITY'].includes(role)) {
    d = await prisma.dispatch.update({
      where: { id: dispatchId },
      data: { status: 'DELIVERED', signedBy, securitySignedAt: new Date(), securityById: user.id! },
      include: { project: true },
    });
  }

  if (['ADMIN'].includes(role)) {
    d = await prisma.dispatch.update({
      where: { id: dispatchId },
      data: { status: 'DELIVERED', signedBy },
      include: { project: true },
    });
  }

  if (!d) throw new Error('Failed to mark delivered');
  revalidatePath(`/projects/${d.projectId}`);
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Auth required</div>;
  const role = assertRole(user.role);
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      quote: { select: { number: true, metaJson: true, lines: { select: { lineTotalMinor: true } }, customer: { select: { displayName: true, email: true, phone: true, city: true } } } },
      requisitions: { include: { items: true, funding: true } },
      dispatches: { include: { items: true } },
      clientPayments: true,
      assignedTo: true,
    },
  });

  const { tab } = await searchParams;


  if (!project) return <div className="p-6">Not found</div>;

  // Strict Access Control for Project Managers
  if (role === 'PROJECT_OPERATIONS_OFFICER' && project.assignedToId !== user.id) {
    redirect('/projects');
  }

  // Redirect Sales Accounts directly to Record Payment page
  if (role === 'SALES_ACCOUNTS') {
    redirect(`/projects/${projectId}/payments`);
  }

  const hasSchedule = (await prisma.schedule.count({ where: { projectId } })) > 0;

  const requisitions = await prisma.procurementRequisition.findMany({
    where: { projectId: projectId },
    include: {
      funding: {
        include: {
          requestedBy: { select: { name: true, email: true } },
          decidedBy: { select: { name: true, email: true } },
          disbursements: { select: { id: true, amountMinor: true, paidAt: true, ref: true, attachmentUrl: true } },
        },
      },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Sort funding arrays client-side
  requisitions.forEach((r) => {
    const funding = (r as any).funding;
    if (Array.isArray(funding)) {
      funding.sort((a: any, b: any) =>
        a.createdAt && b.createdAt
          ? b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0
          : 0
      );
    }
  });

  const isPM = role === 'PROJECT_OPERATIONS_OFFICER' || role === 'ADMIN';
  const isProc = role === 'PROCUREMENT' || role === 'SENIOR_PROCUREMENT' || role === 'ADMIN';
  const isAccounts = (role as string) === 'SALES_ACCOUNTS' || (role as string).startsWith('ACCOUNT') || role === 'ADMIN';
  const canRecordPayments = (role as string) === 'SALES_ACCOUNTS' || role === 'ADMIN';
  const canViewFinancials = [
    'SALES',
    'ADMIN',
    'ACCOUNTS',
    'CASHIER',
    'ACCOUNTING_OFFICER',
    'ACCOUNTING_AUDITOR',
    'GENERAL_MANAGER',
    'MANAGING_DIRECTOR',
  ].includes(role);
  const canViewSchedule = ['PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'MANAGING_DIRECTOR', 'ADMIN'].includes(role);
  const isSalesAccountsOnly = (role as string) === 'SALES_ACCOUNTS';
  
  const sch = await prisma.paymentSchedule.findMany({ where: { projectId } });
  if (sch.length === 0) {
    try {
      await generatePaymentSchedule(projectId);
    } catch (e) {
      console.error('Failed to auto-generate payment schedule', e);
    }
  }
  await reconcilePaymentScheduleToGrandTotal(projectId);

  const schedule = await prisma.paymentSchedule.findMany({
    where: { projectId },
    orderBy: [{ seq: 'asc' }],
  });
  
  // Find deposit item
  const depositItem = schedule.find(s => s.label === 'Deposit');
  // Check if fully paid (tolerant of slight mismatches if needed, but strict for now)
  const isDepositPaid = depositItem 
    ? (BigInt(depositItem.paidMinor ?? 0n) >= BigInt(depositItem.amountMinor))
    : true; // If no deposit row, assume no deposit needed/paid.

  const requiresDeposit = (project?.status === 'CREATED' || project?.status === 'DEPOSIT_PENDING') && !isDepositPaid;
  
  const depositLocked = !!requiresDeposit;
  const opsLocked = depositLocked || !hasSchedule;
  
  const totalDue = schedule.reduce((a, s) => a + BigInt(s.amountMinor), 0n);
  const totalPaid = schedule.reduce((a, s) => a + BigInt(s.paidMinor ?? 0), 0n);
  const bal = totalDue - totalPaid;
  
  // Financial Snapshot Logic
  const firstFunding = (
    Array.isArray((project as any).requisitions)
      ? (project as any).requisitions.find((r: any) => r.funding?.status === 'APPROVED')?.funding
      : null
  ) as any;
  const totals = computeBalances({
    quote: project.quote as any,
    payments: project.clientPayments as any,
    funding: firstFunding ?? null,
  });
  const next = nextDueDate((project as any).installmentDueDay ?? null, project.commenceOn);

    return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans">
      {/* Standard Clean Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm mb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="md:flex md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                 <h1 className="text-3xl font-bold leading-tight text-gray-900">
                  Project Name: {project.quote?.customer?.displayName || 'Project'}
                </h1>
                <span className={cn(
                  "inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset",
                  project.status === 'COMPLETED' ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" :
                  project.status === 'CANCELLED' ? "bg-red-50 text-red-700 ring-red-600/20" :
                  "bg-indigo-50 text-indigo-700 ring-indigo-700/10"
                )}>
                  {project.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:space-x-6 gap-y-2">
                <div className="flex items-center text-sm text-gray-500">
                  <HashtagIcon className="mr-1.5 h-5 w-5 flex-shrink-0 text-indigo-500" aria-hidden="true" />
                  {project.projectNumber || project.id}
                </div>
                {project.quote?.customer?.city && (
                  <div className="flex items-center text-sm text-gray-500">
                    <MapPinIcon className="mr-1.5 h-5 w-5 flex-shrink-0 text-indigo-500" aria-hidden="true" />
                    {project.quote.customer.city}
                  </div>
                )}
                <div className="flex items-center text-sm text-gray-500">
                  <CalendarIcon className="mr-1.5 h-5 w-5 flex-shrink-0 text-orange-500" aria-hidden="true" />
                  Commenced: {new Date(project.commenceOn).toLocaleDateString()}
                </div>
                {next && (
                  <div className="flex items-center text-sm text-gray-500">
                    <ClockIcon className="mr-1.5 h-5 w-5 flex-shrink-0 text-orange-500" aria-hidden="true" />
                    Next Due: {formatDateYMD(next)}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-4 flex items-center md:ml-4 md:mt-0">
               <Link 
                  href="/projects" 
                  className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 mr-3 transition-colors"
               >
                  <ArrowLeftIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                  Back to Projects
               </Link>
               {canRecordPayments && (
                <Link
                  href={`/projects/${projectId}/payments`}
                  className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 mr-3"
                >
                  <BanknotesIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                  Payments
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <main className="mx-auto max-w-7xl px-6 lg:px-8 space-y-8">
        
        {/* Key Metrics Strip (Clean Cards) */}
        {canViewFinancials && (role as string) !== 'SALES_ACCOUNTS' && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
             <dl className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Contract Value</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  <Money minor={BigInt(Math.round(totals.contractTotal * 100))} />
                </dd>
             </dl>
             <dl className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Paid to Date</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-emerald-600">
                  <Money minor={BigInt(Math.round(totals.paid * 100))} />
                </dd>
             </dl>
             <dl className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Balance Due</dt>
                <dd className={cn("mt-1 text-3xl font-semibold tracking-tight", totals.remaining > 0 ? "text-rose-600" : "text-gray-900")}>
                   <Money minor={BigInt(Math.round(totals.remaining * 100))} />
                </dd>
             </dl>
          </div>
        )}

        {/* Alerts */}
        {depositLocked && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            Deposit not recorded yet. Project functions are limited until status is PLANNED.
          </div>
        )}
        
        {!depositLocked && !hasSchedule && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm">
            Project schedule not created yet. Please create a schedule to unlock requisitions and dispatches.
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="flex flex-wrap justify-center gap-6">
            
            {/* Schedule Button */}
            {!isSalesAccountsOnly && canViewSchedule && (
                <Link 
                    href={hasSchedule ? `/projects/${projectId}/schedule` : '#'} 
                    className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] group relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                    <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-orange-50 transition-all group-hover:bg-orange-100"></div>
                    <div className="relative">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-lg shadow-green-600/20">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                           </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900">Schedule</h3>
                        <p className="mt-2 text-sm text-gray-500">Manage timeline, tasks, and employee assignments.</p>
                        
                        {!hasSchedule && (
                             <div className="mt-4">
                                <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-700/10">Not Created</span>
                             </div>
                        )}
                        {hasSchedule && (
                            <div className="mt-6">
                                <span className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 transition-colors">
                                    View Schedule
                                </span>
                            </div>
                        )}
                    </div>
                </Link>
            )}

            {/* Requisitions Button */}
            {!isSalesAccountsOnly && (
                <Link 
                    href={`/projects/${projectId}/requisitions/new`}
                    className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] group relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                    <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-green-50 transition-all group-hover:bg-green-100"></div>
                     <div className="relative">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-lg shadow-green-600/20">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                           </svg>
                        </div>
                        <div className="flex justify-between items-start">
                             <h3 className="text-xl font-semibold text-gray-900">Create Requisition</h3>
                             {requisitions.length > 0 && <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-600">{requisitions.length}</span>}
                        </div>
                        <p className="mt-2 text-sm text-gray-500">Create requests directly.</p>
                         <div className="mt-6">
                             <span className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 transition-colors">
                                 Create Requisition
                             </span>
                         </div>
                    </div>
                </Link>
            )}

            {/* Dispatches Button */}
            {!isSalesAccountsOnly && (
                 <Link 
                    href={`/projects/${projectId}/dispatches`}
                    className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] group relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-1 hover:shadow-lg"
                 >
                    <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-green-50 transition-all group-hover:bg-green-100"></div>
                     <div className="relative">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-lg shadow-green-600/20">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                            </svg>
                        </div>
                         <div className="flex justify-between items-start">
                             <h3 className="text-xl font-semibold text-gray-900">Dispatches</h3>
                             {project.dispatches.length > 0 && <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-600">{project.dispatches.length}</span>}
                        </div>
                        <p className="mt-2 text-sm text-gray-500">Inventory movement and delivery tracking.</p>
                         <div className="mt-6">
                             <span className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 transition-colors">
                                 Manage Dispatches
                             </span>
                         </div>
                    </div>
                </Link>
            )}

            {/* Daily Tasks Button */}
            {!isSalesAccountsOnly && (['PM_CLERK', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN'] as string[]).includes(role) && (
                 <Link 
                    href={`/projects/${projectId}/daily-tasks`}
                    className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] group relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-1 hover:shadow-lg"
                 >
                    <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-green-50 transition-all group-hover:bg-green-100"></div>
                     <div className="relative">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-lg shadow-green-600/20">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900">Daily Tasks</h3>
                        <p className="mt-2 text-sm text-gray-500">Log progress and daily activities.</p>
                         <div className="mt-6">
                             <span className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 transition-colors">
                                 View Daily Tasks
                             </span>
                         </div>
                    </div>
                 </Link>
            )}
            
            {/* Reports Button */}
            {!isSalesAccountsOnly && (['PM_CLERK', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'MANAGING_DIRECTOR', 'ACCOUNTING_CLERK', 'ACCOUNTING_OFFICER', 'ACCOUNTS'] as string[]).includes(role) && (
                 <Link 
                    href={`/projects/${projectId}/reports`}
                    className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.33%-16px)] group relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-900/5 transition-all hover:-translate-y-1 hover:shadow-lg"
                 >
                     <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-green-50 transition-all group-hover:bg-green-100"></div>
                     <div className="relative">
                        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white shadow-lg shadow-green-600/20">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900">Reports</h3>
                        <p className="mt-2 text-sm text-gray-500">Generate analytics and progress reports.</p>
                         <div className="mt-6">
                             <span className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 transition-colors">
                                 View Reports
                             </span>
                         </div>
                    </div>
                 </Link>
            )}
            
        </div>
      </main>
    </div>
  );
}
