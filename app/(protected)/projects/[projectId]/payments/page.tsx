import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import PaymentForms from './PaymentForms';
import { ArrowLeftIcon, ClockIcon, CheckCircleIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import clsx from 'clsx';
import { Money } from '@/components/Money';
import { readQuoteGrandTotal } from '@/lib/accounting';
import { reconcilePaymentScheduleToGrandTotal } from '@/app/lib/payments';

const formatMoney = (minor: bigint | number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(minor) / 100);
};

export default async function ProjectPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ action?: string; amount?: string; type?: string; filter?: string }>;
}) {
  const { projectId } = await params;
  const { action, amount, type, filter } = await searchParams;
  
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!['SALES_ACCOUNTS', 'ACCOUNTS', 'ADMIN'].includes(me.role as string)) {
    redirect(`/projects/${projectId}`);
  }

   await reconcilePaymentScheduleToGrandTotal(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      clientPayments: { orderBy: { receivedAt: 'desc' } },
         quote: { include: { customer: true, lines: true } },
      paymentSchedules: { select: { id: true, label: true, amountMinor: true, paidMinor: true, dueOn: true, status: true, seq: true }, orderBy: { seq: 'asc' } },
    },
  });

  if (!project) return <div className="p-6">Project not found</div>;

  const schedules = project.paymentSchedules || [];
  const payments = project.clientPayments || [];
  
  // Stats
   const contractValue = project.quote ? BigInt(Math.round(readQuoteGrandTotal(project.quote as any) * 100)) : 0n;
  const totalPaid = payments.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n);
  const balance = contractValue - totalPaid;

  const showReceiveForm = action === 'receive';
  const initialAmount = amount ? Number(amount) : 0;
  const fixedType = (type?.toUpperCase() === 'DEPOSIT' ? 'DEPOSIT' : 'INSTALLMENT') as 'DEPOSIT' | 'INSTALLMENT';

  // Filter Schedule
  const currentFilter = filter || 'ALL'; // ALL, DUE, FUTURE
  const filteredSchedules = schedules.filter(s => {
    if (currentFilter === 'DUE') return s.status === 'DUE' || s.status === 'OVERDUE' || s.status === 'PARTIAL';
    if (currentFilter === 'FUTURE') return s.status === 'PENDING';
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <Link href="/accounts/payments" className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                     <ArrowLeftIcon className="h-5 w-5" />
                  </Link>
                  <div>
                     <h1 className="text-xl font-bold text-gray-900">{project.quote?.customer?.displayName}</h1>
                     <p className="text-sm text-gray-500">Project: {project.projectNumber}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                     <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Balance Due</p>
                     <p className="text-lg font-bold text-gray-900">{formatMoney(balance)}</p>
                  </div>
               </div>
            </div>
         </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
           <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium text-gray-500">Contract Value</CardTitle>
                 <BanknotesIcon className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                 <div className="text-2xl font-bold text-gray-900">{formatMoney(contractValue)}</div>
              </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium text-gray-500">Total Paid</CardTitle>
                 <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                 <div className="text-2xl font-bold text-emerald-600">{formatMoney(totalPaid)}</div>
              </CardContent>
           </Card>
           <Card className="border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium text-gray-500">Outstanding</CardTitle>
                 <ClockIcon className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                 <div className="text-2xl font-bold text-orange-600">{formatMoney(balance)}</div>
              </CardContent>
           </Card>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="schedule" className="w-full">
           <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="schedule">Payment Schedule</TabsTrigger>
              <TabsTrigger value="history">Payment History</TabsTrigger>
           </TabsList>

           <TabsContent value="schedule" className="mt-6 space-y-6">
              
              {/* Schedule Filters */}
              <div className="flex items-center gap-2 mb-4">
                 <Link href={`/projects/${projectId}/payments?filter=ALL`} className={clsx("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", currentFilter === 'ALL' ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100")}>All</Link>
                 <Link href={`/projects/${projectId}/payments?filter=DUE`} className={clsx("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", currentFilter === 'DUE' ? "bg-orange-100 text-orange-800" : "text-gray-600 hover:bg-gray-100")}>Due / Overdue</Link>
                 <Link href={`/projects/${projectId}/payments?filter=FUTURE`} className={clsx("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", currentFilter === 'FUTURE' ? "bg-blue-100 text-blue-800" : "text-gray-600 hover:bg-gray-100")}>Future</Link>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                       <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                       </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                       {filteredSchedules.map((s) => {
                          const sAmt = BigInt(s.amountMinor);
                          const sPaid = BigInt(s.paidMinor || 0);
                          const sBal = sAmt - sPaid;
                          const isReceiveable = s.status !== 'PAID';
                          
                          // Pre-fill type
                          const itemType = s.label.toLowerCase().includes('deposit') ? 'deposit' : 'installment';

                          return (
                             <tr key={s.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.label}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(s.dueOn).toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatMoney(sAmt)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 text-right">{formatMoney(sPaid)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">{formatMoney(sBal)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                   <span className={clsx(
                                      "px-2 inline-flex text-xs leading-5 font-semibold rounded-full",
                                      s.status === 'PAID' ? "bg-green-100 text-green-800" :
                                      s.status === 'OVERDUE' ? "bg-red-100 text-red-800" :
                                      s.status === 'PARTIAL' ? "bg-yellow-100 text-yellow-800" :
                                      s.status === 'DUE' ? "bg-orange-100 text-orange-800" :
                                      "bg-gray-100 text-gray-800"
                                   )}>
                                      {s.status}
                                   </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                   {isReceiveable && (
                                      <Link 
                                         href={`/projects/${projectId}/payments?action=receive&amount=${Number(sBal)/100}&type=${itemType}`}
                                         className="text-emerald-600 hover:text-emerald-900 font-bold"
                                      >
                                         Receive
                                      </Link>
                                   )}
                                </td>
                             </tr>
                          );
                       })}
                       {filteredSchedules.length === 0 && (
                          <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No scheduled items found.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </TabsContent>

           <TabsContent value="history" className="mt-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                       <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                       </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                       {payments.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                             <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.receiptNo || '-'}</td>
                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(p.receivedAt).toLocaleDateString()}</td>
                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.method}</td>
                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{p.type.toLowerCase()}</td>
                             <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{p.description || '-'}</td>
                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">{formatMoney(p.amountMinor)}</td>
                          </tr>
                       ))}
                       {payments.length === 0 && (
                          <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No payments recorded yet.</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
