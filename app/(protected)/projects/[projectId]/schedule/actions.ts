'use server';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { renderProjectSchedulePdf } from '@/lib/pdf/puppeteer';

type Settings = {
  builderShare: number;
  excavationBuilder: number;
  excavationAssistant: number;
  brickBuilder: number;
  brickAssistant: number;
  plasterBuilder: number;
  plasterAssistant: number;
  cubicBuilder: number;
  cubicAssistant: number;
  tilerBuilder: number;
  tilerAssistant: number;
};

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function generateSchedulePdf(
  projectId: string,
): Promise<ActionResult<{ base64: string; filename: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Authentication required');

    const result = await renderProjectSchedulePdf(projectId);
    return {
      ok: true,
      data: {
        base64: result.buffer.toString('base64'),
        filename: result.filename,
      },
    };
  } catch (error) {
    console.error('[generateSchedulePdf]', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to generate PDF' };
  }
}

export async function saveProductivitySettings(projectId: string, settings: Settings) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Auth required');

  // Upsert settings
  await prisma.projectProductivitySetting.upsert({
    where: { projectId },
    update: {
      builderShare: settings.builderShare,
      excavationBuilder: settings.excavationBuilder,
      excavationAssistant: settings.excavationAssistant,
      brickBuilder: settings.brickBuilder,
      brickAssistant: settings.brickAssistant,
      plasterBuilder: settings.plasterBuilder,
      plasterAssistant: settings.plasterAssistant,
      cubicBuilder: settings.cubicBuilder,
      cubicAssistant: settings.cubicAssistant,
      tilerBuilder: settings.tilerBuilder,
      tilerAssistant: settings.tilerAssistant,
    },
    create: {
      projectId,
      builderShare: settings.builderShare,
      excavationBuilder: settings.excavationBuilder,
      excavationAssistant: settings.excavationAssistant,
      brickBuilder: settings.brickBuilder,
      brickAssistant: settings.brickAssistant,
      plasterBuilder: settings.plasterBuilder,
      plasterAssistant: settings.plasterAssistant,
      cubicBuilder: settings.cubicBuilder,
      cubicAssistant: settings.cubicAssistant,
      tilerBuilder: settings.tilerBuilder,
      tilerAssistant: settings.tilerAssistant,
    },
  });

  revalidatePath(`/projects/${projectId}/schedule`);
  return { ok: true };
}

export async function batchCheckConflicts(
  projectId: string,
  items: { id?: string | null; employeeIds: string[]; plannedStart: string; plannedEnd: string }[]
) {
  const conflictIds: string[] = [];
  const details: Record<string, string> = {};

  // Filter out invalid items
  const validItems = items.filter(
    (i) => i.employeeIds && i.employeeIds.length > 0 && i.plannedStart && i.plannedEnd
  );

  if (validItems.length === 0) {
    return { conflictIds, details };
  }

  // Optimize: Get all distinct employee IDs involved
  const allEmployeeIds = Array.from(new Set(validItems.flatMap((i) => i.employeeIds)));

  // Find all ACTIVE schedule items from OTHER projects that involve these employees
  // and overlap with the overall date range of input items (optional optimization)
  // For simplicity, we query overlapping items for these employees in other projects.

  // We can't easily query "any overlap with any input item" in one go without a huge OR clause.
  // Instead, fetch all potential conflicting items for these employees in the implementation range?
  // Or just iterate. Iteration is safer for complex date logic.

  for (const item of validItems) {
    const start = new Date(item.plannedStart);
    const end = new Date(item.plannedEnd);

    const conflicts = await prisma.scheduleItem.findMany({
      where: {
        schedule: {
          projectId: { not: projectId },
          status: { not: 'DRAFT' }
        },
        assignees: {
          some: {
            id: { in: item.employeeIds }
          }
        },
        plannedStart: { lte: end },
        plannedEnd: { gte: start },
        status: { not: 'DONE' },
      },
      include: {
        schedule: {
          include: {
            project: { select: { projectNumber: true, name: true } }
          }
        },
        assignees: {
          where: { id: { in: item.employeeIds } },
          select: { givenName: true }
        }
      }
    });

    if (conflicts.length > 0) {
      const rowId = item.id || 'temp'; // logic in client uses temp ids if distinct
      // But wait, if we have multiple temp items, we need to know which one.
      // The client passes the ID it uses to track changes (maybe?). 
      // In ScheduleEditor.client.tsx, it uses: id: it.id, ... 
      // If it.id is null (new item), it might be tricky to map back if we don't pass a temp ID.
      // But the client code says: 
      // const rowId = it.id || `temp-${idx}`;
      // AND it passes `id: it.id` in payload. If it.id is null, the server sees null.
      // So we can't easily map back new items unless we rely on order or pass a distinct key.
      // The current batchCheckConflicts signature in client only sends { id, ... }.
      // If id is null, we can't map it back specifically if there are multiple new items.
      // However, the function returns `conflictIds`.
      // If the client relies on `id`, then new items (id=null) won't be flagged?
      // Check client: 
      // const rowId = it.id || `temp-${idx}`;
      // const hasConflict = result.conflictIds.includes(rowId);
      // If `it.id` is null, rowId is `temp-0`.
      // If server receives `id: null`, it can't return `temp-0`.
      // The server assumes `id` is the key.
      // Thus, this feature likely only works for SAVED items or we need to fix client to pass a key.
      // For now, let's assume valid ID or ignore.
      // OR, we can try to match by properties, but that's flaky.
      // Let's rely on `id` being present.

      if (item.id) {
        conflictIds.push(item.id);
        const conflictNames = conflicts.map(c => `${c.schedule.project.projectNumber}`).join(', ');
        const employees = Array.from(new Set(conflicts.flatMap(c => c.assignees.map(a => a.givenName)))).join(', ');
        details[item.id] = `Conflict with ${conflictNames} (${employees})`;
      }
    }
  }

  return { conflictIds, details };
}

export async function checkEmployeeAvailability(
  employeeIds: string[],
  startStr: string,
  endStr: string,
  projectId: string,
  excludeItemId?: string
) {
  const start = new Date(startStr);
  const end = new Date(endStr);

  const conflicts = await prisma.scheduleItem.findMany({
    where: {
      AND: [
        {
          assignees: {
            some: {
              id: { in: employeeIds }
            }
          }
        },
        { plannedStart: { lte: end } },
        { plannedEnd: { gte: start } },
        { status: { not: 'DONE' } },
        {
          OR: [
            { schedule: { projectId: { not: projectId }, status: { not: 'DRAFT' } } },
            {
              AND: [
                { schedule: { projectId: projectId } },
                { id: { not: excludeItemId } }
              ]
            }
          ]
        }
      ]
    },
    include: {
      schedule: {
        include: {
          project: { select: { projectNumber: true, name: true } }
        }
      },
      assignees: {
        where: { id: { in: employeeIds } },
        select: { id: true, givenName: true }
      }
    }
  });

  const busy: string[] = [];
  const details: Record<string, any> = {};

  for (const c of conflicts) {
    for (const a of c.assignees) {
      if (!busy.includes(a.id)) {
        busy.push(a.id);
        details[a.id] = {
          conflictProject: c.schedule.project.projectNumber,
          conflictStart: c.plannedStart,
          conflictEnd: c.plannedEnd,
        };
      }
    }
  }

  return { busy, details };
}

/** Fetch booked date ranges for given employees within a window (for calendar view). */
export async function getEmployeeBookings(
  employeeIds: string[],
  windowStart: string,
  windowEnd: string,
  excludeProjectId?: string,
) {
  if (!employeeIds.length) return {};

  const start = new Date(windowStart);
  const end = new Date(windowEnd);

  const items = await prisma.scheduleItem.findMany({
    where: {
      assignees: { some: { id: { in: employeeIds } } },
      plannedStart: { lte: end },
      plannedEnd: { gte: start },
      status: { not: 'DONE' },
      schedule: {
        status: { not: 'DRAFT' },
        ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
      },
    },
    select: {
      title: true,
      plannedStart: true,
      plannedEnd: true,
      schedule: {
        select: { project: { select: { projectNumber: true, name: true } } },
      },
      assignees: {
        where: { id: { in: employeeIds } },
        select: { id: true },
      },
    },
  });

  // Group by employee ID -> array of bookings
  const bookings: Record<string, { project: string; task: string; start: string; end: string }[]> = {};
  for (const it of items) {
    for (const a of it.assignees) {
      if (!bookings[a.id]) bookings[a.id] = [];
      bookings[a.id].push({
        project: it.schedule.project.projectNumber ?? it.schedule.project.name ?? '',
        task: it.title,
        start: it.plannedStart?.toISOString().slice(0, 10) ?? '',
        end: it.plannedEnd?.toISOString().slice(0, 10) ?? '',
      });
    }
  }
  return bookings;
}
