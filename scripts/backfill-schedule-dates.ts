import { PrismaClient } from '@prisma/client';
import { recalculateRipple, type ProductivitySettings, type ScheduleItemMinimal } from '../lib/schedule-engine';

const prisma = new PrismaClient();

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function settingsFor(setting: Awaited<ReturnType<typeof prisma.projectProductivitySetting.findUnique>>): ProductivitySettings {
  return {
    builderShare: setting?.builderShare ?? 0.3333,
    excavationBuilder: setting?.excavationBuilder ?? 5,
    excavationAssistant: setting?.excavationAssistant ?? 5,
    brickBuilder: setting?.brickBuilder ?? 500,
    brickAssistant: setting?.brickAssistant ?? 500,
    plasterBuilder: setting?.plasterBuilder ?? 16,
    plasterAssistant: setting?.plasterAssistant ?? 16,
    cubicBuilder: setting?.cubicBuilder ?? 5,
    cubicAssistant: setting?.cubicAssistant ?? 5,
    tilerBuilder: setting?.tilerBuilder ?? 20,
    tilerAssistant: setting?.tilerAssistant ?? 20,
  };
}

async function main() {
  const schedules = await prisma.schedule.findMany({
    include: {
      project: { select: { commenceOn: true, projectNumber: true, productivitySettings: true } },
      items: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          assignees: { select: { id: true } },
          reports: {
            orderBy: [{ reportedForDate: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { reportedForDate: true },
          },
        },
      },
    },
  });

  let updatedTasks = 0;
  for (const schedule of schedules) {
    if (schedule.items.length === 0) continue;

    // Only the uninterrupted completed prefix is historical progress. A DONE
    // flag later in the schedule is retained, but its dates are recalculated
    // in sequence until it becomes the immediate current task.
    let completedPrefix = 0;
    while (completedPrefix < schedule.items.length && schedule.items[completedPrefix].status === 'DONE') {
      completedPrefix += 1;
    }

    const updates: Array<ReturnType<typeof prisma.scheduleItem.update>> = [];
    let previousEnd: Date | null = null;

    for (let index = 0; index < completedPrefix; index += 1) {
      const item = schedule.items[index];
      const reportedEnd = startOfDay(item.reports[0]?.reportedForDate ?? item.plannedEnd ?? item.updatedAt);
      const actualEnd = previousEnd && reportedEnd < previousEnd ? previousEnd : reportedEnd;
      const proposedStart = startOfDay(item.plannedStart ?? (previousEnd || schedule.project.commenceOn));
      const actualStart = previousEnd && proposedStart < previousEnd ? previousEnd : proposedStart;

      updates.push(prisma.scheduleItem.update({
        where: { id: item.id },
        data: {
          plannedStart: actualStart > actualEnd ? actualEnd : actualStart,
          plannedEnd: actualEnd,
        },
      }));
      previousEnd = actualEnd;
    }

    if (completedPrefix < schedule.items.length) {
      const remaining = schedule.items.slice(completedPrefix).map(item => ({
        ...item,
        employeeIds: item.assignees.map(employee => employee.id),
      })) as ScheduleItemMinimal[];
      const firstExistingStart = schedule.items[completedPrefix].plannedStart;
      const rippleStart = previousEnd ?? startOfDay(firstExistingStart ?? schedule.project.commenceOn);
      const recalculated = recalculateRipple(
        remaining,
        0,
        rippleStart,
        30,
        settingsFor(schedule.project.productivitySettings),
      );

      for (const item of recalculated) {
        updates.push(prisma.scheduleItem.update({
          where: { id: item.id! },
          data: {
            plannedStart: item.plannedStart ? new Date(item.plannedStart) : null,
            plannedEnd: item.plannedEnd ? new Date(item.plannedEnd) : null,
            estHours: item.estHours,
          },
        }));
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
      updatedTasks += updates.length;
    }
    console.log(`Repaired ${schedule.project.projectNumber ?? schedule.projectId}: ${updates.length} tasks`);
  }

  console.log(`Repaired ${updatedTasks} tasks across ${schedules.length} schedules.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
