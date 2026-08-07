import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createScheduleTaskReport, updateScheduleItemStatus } from '@/app/(protected)/projects/actions';
import SubmitButton from '@/components/SubmitButton';
import { 
  CalendarIcon, 
  ChartBarIcon, 
  UserGroupIcon, 
  ClockIcon, 
  ArrowLeftIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import ReportTabs from './ReportTabs';
import MaterialUsageList from './MaterialUsageList';
import ProgressReportFields from './ProgressReportFields';

export default async function TaskReportPage({
  params,
}: {
  params: Promise<{ projectId: string; itemId: string }>;
}) {
  const { projectId, itemId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  if (!['PM_CLERK', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'DEPUTY_ADMIN'].includes(user.role as string)) {
    return <div className="p-6">Not authorized</div>;
  }

  const item = await prisma.scheduleItem.findUnique({
    where: { id: itemId },
    include: {
      schedule: {
        select: {
          projectId: true,
          project: {
            select: {
              name: true,
              quote: { 
                select: { 
                  number: true,
                  customer: {
                    select: {
                      displayName: true,
                    }
                  }
                } 
              },
            },
          },
        },
      },
      assignees: {
        select: {
          id: true,
          givenName: true,
          surname: true,
          role: true,
        },
      },
      quoteLine: {
        select: {
          metaJson: true,
        },
      },
      reports: {
        orderBy: { reportedForDate: 'desc' },
        take: 5,
        include: {
          reporter: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!item || item.schedule.projectId !== projectId) return notFound();

  const workerNames = item.assignees
    .map((a) => [a.givenName, a.surname].filter(Boolean).join(' '))
    .join(', ') || 'No workers assigned';
  const workerCount = item.assignees.length;

  // The activity list is intentionally limited, so calculate progress from
  // every report rather than only the five reports shown below.
  const progressTotals = await prisma.scheduleTaskReport.aggregate({
    where: { scheduleItemId: itemId },
    _sum: { usedQty: true },
  });
  const totalCompleted = Number(progressTotals._sum.usedQty ?? 0);
  const remaining = Math.max(0, (item.quantity || 0) - totalCompleted);


  // Fetch available dispatch items for material usage reporting
  const dispatchItems = await prisma.dispatchItem.findMany({
    where: {
      dispatch: {
        projectId,
        status: 'DELIVERED',
      },
      // Optional: Filter out items that are fully used if desired?
      // For now, let's show all received items so they can see history/remaining.
    },
    select: {
      id: true,
      description: true,
      unit: true,
      qty: true,
      usedOutQty: true,
    },
    orderBy: { description: 'asc' },
  });

  const formattedDispatchItems = dispatchItems.map(d => ({
    ...d,
    usedOutQty: d.usedOutQty || 0,
  }));

  const submitReport = async (formData: FormData) => {
    'use server';
    const activity = String(formData.get('activity') || '');
    const usedQty = Number(formData.get('usedQty') || 0);
    const usedUnit = String(formData.get('usedUnit') || item.unit || '');
    const remainingQty = Number(formData.get('remainingQty') || 0);
    const remainingUnit = String(formData.get('remainingUnit') || item.unit || '');
    const newStatus = String(formData.get('status') || 'ACTIVE') as 'ACTIVE' | 'ON_HOLD' | 'DONE';

    await createScheduleTaskReport(itemId, {
      activity,
      usedQty,
      usedUnit,
      remainingQty,
      remainingUnit,
    });

    if (newStatus !== item.status) {
      await updateScheduleItemStatus(itemId, newStatus);
    }

    redirect(`/projects/${projectId}/daily-tasks`);
  };

  const taskReportForm = (
    <form action={submitReport} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
         <div className="p-2 bg-indigo-50 rounded-lg">
            <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
         </div>
         <h3 className="text-xl font-bold text-gray-900">Today&apos;s Progress Report</h3>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="activity" className="block text-sm font-medium text-gray-700 mb-2">
            Activity / What was done today <span className="text-red-500">*</span>
          </label>
          <textarea
            id="activity"
            name="activity"
            rows={4}
            required
            className="w-full rounded-lg border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:bg-white focus:border-indigo-500 focus:ring-indigo-500 transition-colors"
            placeholder="Describe the work completed today..."
          />
        </div>

        <ProgressReportFields
          remainingBefore={remaining}
          unit={item.unit}
          currentStatus={item.status}
        />
      </div>

      <div className="flex items-center justify-end gap-4 pt-8 mt-8 border-t border-gray-100">
        <Link
          href={`/projects/${projectId}/daily-tasks`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 transition-colors"
        >
          <XMarkIcon className="h-5 w-5" />
          Cancel
        </Link>
        <SubmitButton
          className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
          loadingText="Submitting..."
        >
          Submit Report
        </SubmitButton>
      </div>
    </form>
  );

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
           <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                Task Reporting
              </span>
              <span className="text-sm text-gray-500">• {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
           </div>
           <h1 className="flex items-center text-3xl font-bold tracking-tight text-gray-900">
              <span className="text-gray-500 font-medium text-xl mr-2">Project:</span>
              <span className="text-2xl font-bold text-gray-900">{item.schedule.project.quote?.customer?.displayName || item.schedule.project.name}</span>
           </h1>
        </div>
        <Link
          href={`/projects/${projectId}/daily-tasks`}
          className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Tasks
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Task Info */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 h-full flex flex-col">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-blue-50 rounded-full flex-shrink-0">
                  <ClipboardDocumentCheckIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                  {item.description && <p className="mt-1 text-sm text-gray-500">{item.description}</p>}
                </div>
              </div>

              <div className="space-y-4 flex-1 flex flex-col">
                 <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                       <ChartBarIcon className="h-5 w-5 text-gray-400" />
                       <span className="text-sm font-medium text-gray-600">Planned</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{item.quantity} {item.unit}</span>
                 </div>
                 
                 <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                       <ChartBarIcon className="h-5 w-5 text-green-600" />
                       <span className="text-sm font-medium text-gray-600">Completed</span>
                    </div>
                    <span className="text-sm font-bold text-green-700">{totalCompleted.toFixed(2)} {item.unit}</span>
                 </div>

                 <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                       <ChartBarIcon className="h-5 w-5 text-orange-600" />
                       <span className="text-sm font-medium text-gray-600">Remaining</span>
                    </div>
                    <span className="text-sm font-bold text-orange-700">{remaining.toFixed(2)} {item.unit}</span>
                 </div>

                 <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                       <UserGroupIcon className="h-5 w-5 text-gray-400" />
                       <span className="text-sm font-medium text-gray-600">Workers</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 truncate max-w-[120px]" title={workerNames}>
                       {workerCount} Assigned
                    </span>
                 </div>

                 <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                       <CalendarIcon className="h-5 w-5 text-gray-400" />
                       <span className="text-sm font-medium text-gray-600">Duration</span>
                    </div>
                    <div className="text-right">
                       <div className="text-xs text-gray-500">Start: {item.plannedStart ? new Date(item.plannedStart).toLocaleDateString() : '-'}</div>
                       <div className="text-xs text-gray-500">End: {item.plannedEnd ? new Date(item.plannedEnd).toLocaleDateString() : '-'}</div>
                    </div>
                 </div>

                 <div className="pt-4 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Current Status</span>
                    <span
                      className={cn(
                        "inline-flex w-full justify-center items-center rounded-md px-3 py-2 text-sm font-bold uppercase tracking-wide",
                        item.status === 'ACTIVE'
                          ? "bg-green-100 text-green-800"
                          : item.status === 'ON_HOLD'
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                      )}
                    >
                      {item.status}
                    </span>
                 </div>
              </div>
           </div>
        </div>

        {/* Right Column: Report Form & Tabs */}
        <div className="lg:col-span-2 space-y-6">
           <ReportTabs
             taskReportForm={taskReportForm}
             materialUsageList={<MaterialUsageList items={formattedDispatchItems} />}
           />

           {/* Previous Reports (Existing logic) */}
           {item.reports.length > 0 && (
             <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
               <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                 <ClockIcon className="h-5 w-5 text-gray-400" />
                 Recent Activity
               </h3>
               <div className="space-y-4">
                 {item.reports.map((report) => (
                   <div key={report.id} className="relative pl-6 pb-4 border-l-2 border-gray-100 last:pb-0">
                     <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white bg-blue-100 ring-1 ring-blue-500"></div>
                     <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                       <div>
                         <div className="text-sm font-bold text-gray-900">
                           {new Date(report.reportedForDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                         </div>
                         <div className="text-xs text-gray-500 mt-0.5">
                           by {report.reporter?.name || 'Unknown'}
                         </div>
                       </div>
                       <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full">
                         <span className="text-sm font-bold text-green-700">+{report.usedQty} {report.usedUnit}</span>
                       </div>
                     </div>
                     {report.activity && (
                       <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                         {report.activity}
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
