import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import PrintHeader from '@/components/PrintHeader';
import { getProjectsForReports } from '../projects/actions';
import ReportsProjectList from './ReportsProjectList';
import { ChartBarIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

export default async function GlobalReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const projects = await getProjectsForReports();

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto min-h-screen">
      <PrintHeader />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
           <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                Organization Overview
              </span>
           </div>
           <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
              <GlobeAltIcon className="h-8 w-8 text-gray-400" />
              Global Reports Center
           </h1>
           <p className="text-gray-500 mt-2">
              Select an active project below to view its detailed reports. 
              {user.role === 'PROJECT_OPERATIONS_OFFICER' || user.role === 'FOREMAN' 
                ? ' You are viewing projects assigned to you.' 
                : ' You are viewing all active projects.'}
           </p>
        </div>
        <Link
          href="/reports/employee-performance"
          className="inline-flex items-center gap-2 rounded-lg bg-barmlo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <ChartBarIcon className="h-4 w-4" />
          Employee Performance
        </Link>
      </div>

      <ReportsProjectList projects={projects} />
    </div>
  );
}
