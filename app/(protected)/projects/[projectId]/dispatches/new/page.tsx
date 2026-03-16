import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { getProjectDispatchableItems } from '../../dispatch-actions';
import DispatchSelector from './DispatchSelector';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import QuoteHeader from '@/components/QuoteHeader';
import { getDrivers } from '@/app/(protected)/dispatches/driver-actions';
import { getCurrentUser } from '@/lib/auth';

export default async function NewDispatchPage({ 
  params 
}: { 
  params: Promise<{ projectId: string }> 
}) {
  const { projectId } = await params;

  const me = await getCurrentUser();
  if (!me) return <div className="p-6">Auth required.</div>;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      quote: { include: { customer: true, project: true } },
    },
  });

  if (!project) return notFound();

  const [availableItems, drivers] = await Promise.all([
     getProjectDispatchableItems(projectId),
     getDrivers().catch(() => [])
  ]);

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Navigation */}
        <div className="flex flex-col gap-4">
          <nav className="flex items-center text-sm font-medium text-gray-500">
            <Link 
              href={`/projects/${projectId}/dispatches`} 
              className="hover:text-green-600 transition-colors flex items-center bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1.5 text-green-600" />
              Back to Dispatches
            </Link>
          </nav>
 
          {/* Header */}
          {project.quote ? (
            <QuoteHeader quote={project.quote} title="Dispatch Form" />
          ) : (
            <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dispatch Form</h1>
              <p className="mt-2 text-gray-500">Project: {project.name}</p>
            </div>
          )}
        </div>
 
        <DispatchSelector 
          projectId={projectId} 
          availableItems={availableItems as any} 
          drivers={drivers}
          userRole={me.role}
        />
      </div>
    </div>
  );
}
