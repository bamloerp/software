import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { getProductivitySettings, computeEstimatesForItems } from '@/app/(protected)/projects/actions';
import { detectAndNotifyConflicts } from '@/lib/conflict-detection';
import { getCanonicalScheduleStage } from '@/lib/scheduleStageOrder';

type ScheduleItemInput = {
  id?: string | null;
  quoteLineId?: string | null;
  stage?: string | null;
  position?: number | null;
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
  if (!['ADMIN', 'DEPUTY_ADMIN', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'HUMAN_RESOURCE'].includes(user.role || '')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const schedule = await prisma.schedule.findFirst({
    where: { projectId },
    include: { items: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { assignees: true } } },
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
  if (!['ADMIN', 'DEPUTY_ADMIN', 'PROJECT_OPERATIONS_OFFICER', 'PROJECT_COORDINATOR', 'HUMAN_RESOURCE'].includes(user.role || '')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const body = await request.json();
  const { note, items, status } = body;
  const isHr = user.role === 'HUMAN_RESOURCE';

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'Invalid items' }, { status: 400 });
  }

  // VALIDATION FOR ACTIVATION
  if (status === 'ACTIVE') {
    const foundationItems = items.filter((it: any) => {
      const stage = String(it.stage || '').trim().toUpperCase();
      return stage.includes('FOUNDATION') || stage.includes('SUBSTRUCTURE');
    });
    const missingAssignments = foundationItems.some(
      (it: any) => !Array.isArray(it.employeeIds) || it.employeeIds.length === 0,
    );
    const missingDates = foundationItems.some((it: any) => !it.plannedStart);

    if (missingAssignments) {
      return NextResponse.json(
        { error: 'Cannot activate: All foundation tasks must have at least one worker assigned.' },
        { status: 400 },
      );
    }
    if (missingDates) {
      return NextResponse.json(
        { error: 'Cannot activate: All foundation tasks must have a start date.' },
        { status: 400 },
      );
    }
  }

  const settings = await getProductivitySettings(projectId);
  const enrichedItems = (await computeEstimatesForItems(items, settings))
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const rankDifference =
        getCanonicalScheduleStage(a.item).rank - getCanonicalScheduleStage(b.item).rank;
      return rankDifference || a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => ({
      ...item,
      stage: getCanonicalScheduleStage(item).label,
    }));

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
    if (isHr) {
      return NextResponse.json({ error: 'A project manager must create the schedule before HR can assign employees.' }, { status: 400 });
    }
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
        note: isHr ? undefined : note ?? null,
        status: isHr ? undefined : status ?? undefined,
        hasConflict: hasProjectConflicts
      },
    });
  }

  const incomingIds = enrichedItems
    .map((item: ScheduleItemInput) => item.id)
    .filter((id: string | null | undefined): id is string => Boolean(id));

  await prisma.$transaction(async (tx) => {
    // Draft rows can be removed freely. Once work is running, rows with reports are retained.
    if (!isHr) await tx.scheduleItem.deleteMany({
      where: {
        scheduleId: schedule.id,
        id: { notIn: incomingIds.length ? incomingIds : ['__none__'] },
        ...(schedule.status === 'ACTIVE' ? { reports: { none: {} } } : {}),
      },
    });

    for (const [index, it] of enrichedItems.entries()) {
      const employeeLinks = Array.isArray((it as any).employeeIds)
        ? (it as any).employeeIds
            .filter((id: any) => typeof id === 'string' && id.trim().length > 0)
            .map((id: string) => ({ id }))
        : null;
      const data = {
        quoteLineId: (it as ScheduleItemInput).quoteLineId ?? undefined,
        stage: (it as ScheduleItemInput).stage ?? null,
        position: (it as ScheduleItemInput).position ?? index,
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
      };

      if ((it as ScheduleItemInput).id) {
        await tx.scheduleItem.update({
          where: { id: (it as ScheduleItemInput).id! },
          data: isHr
            ? { assignees: employeeLinks ? { set: employeeLinks } : undefined }
            : { ...data, assignees: employeeLinks ? { set: employeeLinks } : undefined },
        });
      } else if (!isHr) {
        await tx.scheduleItem.create({
          data: {
            scheduleId: schedule.id,
            ...data,
            assignees: employeeLinks ? { connect: employeeLinks } : undefined,
          },
        });
      }
    }
  });

  revalidatePath(`/projects/${projectId}/schedule`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/daily-tasks`);
  revalidatePath('/projects/schedules');
  revalidatePath('/dashboard');

  return NextResponse.json({ ok: true });
}
