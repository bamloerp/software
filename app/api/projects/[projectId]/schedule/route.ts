import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { getProductivitySettings, computeEstimatesForItems } from '@/app/(protected)/projects/actions';
import { detectAndNotifyConflicts } from '@/lib/conflict-detection';

type ScheduleItemInput = {
  title?: string;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  employees?: string | null;
  estHours?: number | null;
  note?: string | null;
  employeeIds?: string[];
};


export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const schedule = await prisma.schedule.findFirst({
    where: { projectId },
    include: { items: { orderBy: { createdAt: 'asc' }, include: { assignees: true } } },
  });
  if (!schedule) return NextResponse.json({ ok: true, schedule: null });

  return NextResponse.json({ ok: true, schedule });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const body = await request.json();
  const { note, items, status } = body;

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'Invalid items' }, { status: 400 });
  }

  // VALIDATION FOR ACTIVATION
  if (status === 'ACTIVE') {
    const missingAssignments = items.some((it: any) => !Array.isArray(it.employeeIds) || it.employeeIds.length === 0);
    const missingDates = items.some((it: any) => !it.plannedStart);

    if (missingAssignments) {
      return NextResponse.json({ error: 'Cannot activate: All tasks must have at least one worker assigned.' }, { status: 400 });
    }
    if (missingDates) {
      return NextResponse.json({ error: 'Cannot activate: All tasks must have a start date.' }, { status: 400 });
    }
  }

  const settings = await getProductivitySettings(projectId);
  const enrichedItems = await computeEstimatesForItems(items, settings);

  // Fetch project details for notification context
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, projectNumber: true }
  });

  if (project) {
    // Detect and notify conflicts
    await detectAndNotifyConflicts(
      enrichedItems,
      projectId,
      project.name || 'Unknown Project',
      project.projectNumber || 'No Number'
    );
  }

  const hasProjectConflicts = enrichedItems.some(it => it.hasConflict);

  let schedule = await prisma.schedule.findFirst({ where: { projectId } });

  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: {
        projectId,
        createdById: user.id,
        note: note ?? null,
        status: status || 'DRAFT',
        hasConflict: hasProjectConflicts
      },
    });
  } else {
    schedule = await prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        note: note ?? null,
        status: status ?? undefined, // Only update if provided
        hasConflict: hasProjectConflicts
      },
    });
  }

  const createQueries = enrichedItems.map((it) =>
    prisma.scheduleItem.create({
      data: {
        scheduleId: schedule.id,
        title: it.title || 'Task',
        description: it.description ?? null,
        unit: it.unit ?? null,
        quantity: it.quantity ?? null,
        plannedStart: it.plannedStart ? new Date(it.plannedStart) : null,
        plannedEnd: it.plannedEnd ? new Date(it.plannedEnd) : null,
        employees: it.employees ?? null,
        estHours: it.estHours ?? null,
        note: it.note ?? null,
        hasConflict: it.hasConflict ?? false,
        conflictNote: it.conflictNote ?? null,
        assignees: Array.isArray((it as any).employeeIds)
          ? {
            connect: (it as any).employeeIds
              .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
              .map((id: string) => ({ id })),
          }
          : undefined,
      },
    }),
  );

  // Get all existing item IDs so we can delete their task reports first
  const existingItemIds = await prisma.scheduleItem
    .findMany({ where: { scheduleId: schedule.id }, select: { id: true } })
    .then((items) => items.map((i) => i.id));

  await prisma.$transaction([
    // Delete task reports referencing existing items (FK constraint)
    ...(existingItemIds.length > 0
      ? [prisma.scheduleTaskReport.deleteMany({ where: { scheduleItemId: { in: existingItemIds } } })]
      : []),
    prisma.scheduleItem.deleteMany({ where: { scheduleId: schedule.id } }),
    ...createQueries,
  ]);

  revalidatePath(`/projects/${projectId}/schedule`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects/schedules');

  return NextResponse.json({ ok: true });
}
