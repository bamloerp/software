import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { fromMinor } from '@/helpers/money';
import { 
  ClipboardDocumentCheckIcon, 
  ArrowLeftIcon, 
  DocumentChartBarIcon, 
  CalendarIcon, 
  UserGroupIcon, 
  ChartBarIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import DailyReportGenerator from './components/DailyReportGenerator';

export default async function DailyTasksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Only PM_CLERK, PROJECT_OPERATIONS_OFFICER, and ADMIN can access
  if (!['PM_CLERK', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'ADMIN', 'DEPUTY_ADMIN'].includes(user.role as string)) {
    return <div className="p-6">Not authorized</div>;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
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
  });

  if (!project) return notFound();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    include: {
      items: {
        where: {
          status: { not: 'DONE' },
          plannedStart: { lt: tomorrow },
          assignees: { some: {} },
        },
        include: {
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
            take: 1,
            include: {
              reporter: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: {
          plannedStart: 'asc',
        },
      },
    },
  });

  if (!schedule) {
    return (
      <div className="p-6">
        <div className="rounded-md bg-yellow-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">No schedule found</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>This project doesn&apos;t have a schedule yet.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to determine category
  const getCategory = (item: any) => {
    // Try to get section from quote line metadata
    if (item.quoteLine?.metaJson) {
      try {
        const meta = typeof item.quoteLine.metaJson === 'string' 
          ? JSON.parse(item.quoteLine.metaJson) 
          : item.quoteLine.metaJson;
        if (meta.section) return meta.section;
      } catch (e) {
        // ignore
      }
    }
    return item.stage || 'Uncategorized';
  };

  const grouped = schedule.items.reduce((acc, item) => {
    const category = getCategory(item);
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, typeof schedule.items>);

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
           <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                Active Project
              </span>
              <span className="text-sm text-gray-500">• {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
           </div>
           <h1 className="flex items-center text-3xl font-bold tracking-tight text-gray-900">
              <span className="text-gray-500 font-medium text-xl mr-2">Project:</span>
              <span className="text-2xl font-bold text-gray-900">{project.quote?.customer?.displayName || project.name}</span>
           </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <DailyReportGenerator projectId={projectId} />
          <Link
            href={`/projects/${projectId}/reports`}
            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <DocumentChartBarIcon className="h-4 w-4 text-gray-500" />
            View Reports
          </Link>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Project
          </Link>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 rounded-full flex-shrink-0">
            <ClipboardDocumentCheckIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">End of Day Reporting</h3>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              Report progress on active tasks below. Enter quantities completed, materials used, and update task status.
              This ensures accurate tracking of actual progress against planned work.
            </p>
          </div>
        </div>
      </div>

      {/* Tasks Grid */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-4">
          <div className="flex items-center gap-3 px-1">
             <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
             <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
               {category}
             </h2>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const lastReport = item.reports[0];
              const workerNames = item.assignees.map((a: any) =>
                [a.givenName, a.surname].filter(Boolean).join(' ')
              ).join(', ') || 'No workers assigned';
              const workerCount = item.assignees.length;

              return (
                <div
                  key={item.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-blue-300"
                >
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
                          item.status === 'DONE'
                            ? "bg-green-100 text-green-800"
                            : item.status === 'ACTIVE'
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        )}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
                    )}

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <ChartBarIcon className="h-4 w-4" />
                          <span>Planned:</span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {item.quantity} {item.unit}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <UserGroupIcon className="h-4 w-4" />
                          <span>Workers:</span>
                        </div>
                        <span className="font-medium text-gray-900 text-right truncate max-w-[120px]" title={workerNames}>
                          {workerCount} Assigned
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <CalendarIcon className="h-4 w-4" />
                          <span>Timeline:</span>
                        </div>
                        <span className="font-medium text-gray-900">
                           {new Date(item.plannedStart).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })} → {new Date(item.plannedEnd).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                    <Link
                      href={`/projects/${projectId}/daily-tasks/${item.id}`}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <ClockIcon className="h-4 w-4" />
                      Report Progress
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
