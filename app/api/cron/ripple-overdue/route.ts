import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  recalculateRipple,
  ScheduleItemMinimal,
} from '@/lib/schedule-engine';
import { getProductivitySettings } from '@/app/(protected)/projects/actions';

export async function GET() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const schedules = await prisma.schedule.findMany({
    where: {
      items: {
        some: {
          status: { not: 'DONE' },
          plannedEnd: { lt: now },
        },
      },
    },
    include: {
      items: {
        orderBy: { plannedStart: 'asc' },
        include: { assignees: { select: { id: true } } },
      },
    },
  });

  let rippledCount = 0;

  for (const schedule of schedules) {
    const items = schedule.items;
    let firstOverdueIndex = -1;

    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'DONE') continue;
      const end = items[i].plannedEnd ? new Date(items[i].plannedEnd!) : null;
      if (end && end < now) {
        firstOverdueIndex = i;
        break;
      }
    }

    if (firstOverdueIndex === -1) continue;

    const minimalItems: ScheduleItemMinimal[] = items.map(it => ({
      id: it.id,
      title: it.title,
      unit: it.unit,
      quantity: it.quantity,
      plannedStart: it.plannedStart,
      plannedEnd: it.plannedEnd,
      employees: it.employees,
      employeeIds: it.assignees.map(a => a.id),
      estHours: it.estHours,
      description: it.description,
    }));

    const productivity = await getProductivitySettings(schedule.projectId);

    const todayStart = new Date();
    todayStart.setHours(7, 0, 0, 0);

    const updatedItems = recalculateRipple(
      minimalItems,
      firstOverdueIndex,
      todayStart,
      30,
      productivity,
    );

    // Preserve the first overdue task's original start date — work already began
    updatedItems[firstOverdueIndex].plannedStart = minimalItems[firstOverdueIndex].plannedStart;

    const toUpdate = updatedItems.slice(firstOverdueIndex);

    // Only update items that are NOT done — preserve historical dates for completed tasks
    const doneIds = new Set(items.filter(it => it.status === 'DONE').map(it => it.id));

    await prisma.$transaction(
      toUpdate
        .filter(u => u.id && !doneIds.has(u.id))
        .map(u =>
          prisma.scheduleItem.update({
            where: { id: u.id! },
            data: {
              plannedStart: u.plannedStart ? new Date(u.plannedStart as string) : null,
              plannedEnd: u.plannedEnd ? new Date(u.plannedEnd as string) : null,
              estHours: u.estHours,
            },
          }),
        ),
    );

    rippledCount++;
  }

  console.log(`[CRON] ripple-overdue: recalculated ${rippledCount} schedule(s)`);

  // ── Phase 2: Detect ALL employee scheduling conflicts across the system ──
  // Fetch every non-DONE schedule item that has at least one assignee
  const allItems = await prisma.scheduleItem.findMany({
    where: {
      status: { not: 'DONE' },
      plannedStart: { not: null },
      plannedEnd: { not: null },
      assignees: { some: {} },
      schedule: { status: { not: 'DRAFT' } },
    },
    select: {
      id: true,
      scheduleId: true,
      plannedStart: true,
      plannedEnd: true,
      assignees: { select: { id: true } },
    },
  });

  // Build a map: employeeId → list of items they're assigned to
  const empItems = new Map<string, typeof allItems>();
  for (const item of allItems) {
    for (const a of item.assignees) {
      const list = empItems.get(a.id) || [];
      list.push(item);
      empItems.set(a.id, list);
    }
  }

  // Find all items that overlap with another item for the same employee
  const conflictItemIds = new Set<string>();
  for (const [, items] of empItems) {
    if (items.length < 2) continue;
    // Sort by start date
    items.sort((a, b) => new Date(a.plannedStart!).getTime() - new Date(b.plannedStart!).getTime());
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const aEnd = new Date(items[i].plannedEnd!);
        const bStart = new Date(items[j].plannedStart!);
        if (bStart >= aEnd) break; // No more overlaps possible (sorted)
        // Items are in different schedules → conflict
        if (items[i].scheduleId !== items[j].scheduleId) {
          conflictItemIds.add(items[i].id);
          conflictItemIds.add(items[j].id);
        }
      }
    }
  }

  // Batch update: set hasConflict=true on conflicting items, false on others
  const allItemIds = allItems.map(i => i.id);
  const clearIds = allItemIds.filter(id => !conflictItemIds.has(id));

  await prisma.$transaction([
    // Mark conflicting items
    ...(conflictItemIds.size > 0
      ? [prisma.scheduleItem.updateMany({
          where: { id: { in: [...conflictItemIds] } },
          data: { hasConflict: true },
        })]
      : []),
    // Clear items that are no longer conflicting
    ...(clearIds.length > 0
      ? [prisma.scheduleItem.updateMany({
          where: { id: { in: clearIds }, hasConflict: true },
          data: { hasConflict: false, conflictNote: null },
        })]
      : []),
  ]);

  // Update Schedule-level hasConflict flag
  const conflictScheduleIds = new Set<string>();
  for (const item of allItems) {
    if (conflictItemIds.has(item.id)) {
      conflictScheduleIds.add(item.scheduleId);
    }
  }

  // Get all schedule IDs that currently have items
  const allScheduleIds = [...new Set(allItems.map(i => i.scheduleId))];
  const clearScheduleIds = allScheduleIds.filter(id => !conflictScheduleIds.has(id));

  await prisma.$transaction([
    ...(conflictScheduleIds.size > 0
      ? [prisma.schedule.updateMany({
          where: { id: { in: [...conflictScheduleIds] } },
          data: { hasConflict: true },
        })]
      : []),
    ...(clearScheduleIds.length > 0
      ? [prisma.schedule.updateMany({
          where: { id: { in: clearScheduleIds }, hasConflict: true },
          data: { hasConflict: false },
        })]
      : []),
  ]);

  console.log(`[CRON] conflicts: ${conflictItemIds.size} items across ${conflictScheduleIds.size} schedules`);
  return NextResponse.json({ ok: true, rippledCount, conflicts: conflictItemIds.size, affectedSchedules: conflictScheduleIds.size });
}
