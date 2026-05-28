
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import ProjectReportsClient from './ProjectReports.client';
import { getProjectReportData } from './actions';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  
  const { projectId } = await params;
  
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectNumber: true }
  });

  if (!project) redirect('/projects');

  // Fetch all necessary data for reports
  const reportData = await getProjectReportData(projectId);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* Header / Nav */}
        <div className="flex flex-col gap-4">
            <nav className="flex items-center text-sm font-medium text-gray-500">
                <Link 
                    href={`/projects/${projectId}/daily-tasks`}
                    className="hover:text-green-600 transition-colors flex items-center bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"
                >
                    <ArrowLeftIcon className="h-4 w-4 mr-1.5 text-green-600" />
                    Back to Project
                </Link>
            </nav>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Project Reports</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {project.name} ({project.projectNumber || 'No Ref'})
                    </p>
                </div>
                <PrintButton />
            </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[500px]">
            <ProjectReportsClient data={reportData} projectId={projectId} />
        </div>

      </div>
    </div>
  );
}
