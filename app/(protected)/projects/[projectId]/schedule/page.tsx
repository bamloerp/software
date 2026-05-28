import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import ScheduleEditor from './ScheduleEditor.client';
import { createScheduleFromQuote } from '../../actions';
import { getProductivitySettings } from '../../actions';
import SubmitButton from '@/components/SubmitButton';
import PrintHeader from '@/components/PrintHeader';
import QuoteHeader from '@/components/QuoteHeader';
import PrintButton from '@/components/PrintButton';
import { redirect } from 'next/navigation';
import Link from 'next/link';

async function extractScheduleFromQuote(projectId: string) {
  'use server';
  await createScheduleFromQuote(projectId);
  redirect(`/projects/${projectId}/schedule`);
}

export default async function ProjectSchedulePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const me = await getCurrentUser();

  const [schedule, employees, productivity, project] = await Promise.all([
    prisma.schedule.findFirst({
      where: { projectId },
      include: { items: { orderBy: { createdAt: 'asc' }, include: { assignees: true } } },
    }),
    prisma.employee.findMany({
      orderBy: [{ givenName: 'asc' }, { surname: 'asc' }],
      select: { id: true, givenName: true, surname: true, role: true },
    }),
    getProductivitySettings(projectId),
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        quote: {
          include: {
            customer: true,
            project: true,
          },
        },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 space-y-6">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      {project?.quote ? (
        <QuoteHeader quote={project.quote} title="Work Schedule" />
      ) : (
        <>
          <PrintHeader className="flex" />
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Project Name: {project?.quote?.customer?.displayName}
            </h1>
          </div>
        </>
      )}
      <ScheduleEditor
        projectId={projectId}
        schedule={schedule ?? null}
        user={me ?? null}
        employees={employees}
        productivity={productivity}
      />
    </div>
  );
}
