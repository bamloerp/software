import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import PrintHeader from '@/components/PrintHeader';
import PrintButton from '@/components/PrintButton';
import EmployeePerformanceView from './EmployeePerformanceView';
import { buildEmployeePerformanceData } from './performanceData';

export default async function ProjectEmployeePerformancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      quote: {
        select: {
           number: true,
           customer: { select: { displayName: true } }
        }
      }
    }
  });

  if (!project) return notFound();

  // Fetch Schedule with Assignees and Reports
  const schedule = await prisma.schedule.findUnique({
    where: { projectId },
    include: {
      items: {
        include: {
          assignees: {
            select: {
              id: true,
              userId: true,
              givenName: true,
              surname: true,
              role: true,
            },
          },
          reports: {
             select: {
                id: true,
                reporterId: true,
                reportedForDate: true,
                activity: true,
                usedQty: true,
                usedUnit: true,
                remainingQty: true,
                remainingUnit: true,
                reporter: {
                  select: {
                    name: true,
                    email: true,
                  }
                }
             }
          }
        },
      },
    },
  });

  const { employees, ganttItems, timesheets } = schedule
    ? buildEmployeePerformanceData([{ ...schedule, project }])
    : { employees: [], ganttItems: [], timesheets: [] };

  return (
    <div className="p-6 space-y-8 max-w-[1400px] mx-auto bg-gray-50 min-h-screen">
      <PrintHeader />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
           <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-600/10">
                Performance Metrics
              </span>
           </div>
           <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Employee Performance
           </h1>
           <p className="text-gray-500 mt-2">
              Project: <span className="font-semibold text-gray-900">{project.quote?.customer?.displayName || project.name}</span>
           </p>
        </div>
        <div className="flex items-center gap-3">
            <Link
              href={`/projects/${projectId}/reports`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-all"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Reports
            </Link>
            <PrintButton />
        </div>
      </div>

      {employees.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
              <UserGroupIcon className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No Employees Assigned</h3>
              <p className="mt-1 text-sm text-gray-500">Assign employees to schedule items to see performance stats.</p>
          </div>
      ) : (
        // Render the client component for interactivity
        <EmployeePerformanceView employees={employees} ganttItems={ganttItems} timesheets={timesheets} />
      )}
    </div>
  );
}
