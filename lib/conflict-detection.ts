
import { prisma } from '@/lib/db';
import { ScheduleItemMinimal } from '@/lib/schedule-engine';

export async function detectAndNotifyConflicts(
    items: ScheduleItemMinimal[],
    currentProjectId: string,
    currentProjectName: string,
    currentProjectNumber: string
) {
    // 1. Identify all employees and their time ranges from the new schedule items
    const checks = items
        .filter(i => i.status !== 'DONE' && i.employeeIds && i.employeeIds.length > 0 && i.plannedStart && i.plannedEnd)
        .map(i => ({
            start: new Date(i.plannedStart!),
            end: new Date(i.plannedEnd!),
            employeeIds: i.employeeIds!,
            title: i.title
        }));

    // 1b. Clear stale conflict flags on OTHER projects that reference THIS project
    // When we re-save, conflicts may have been resolved, so wipe old flags first.
    if (currentProjectNumber) {
      const staleItems = await prisma.scheduleItem.findMany({
        where: {
          schedule: { projectId: { not: currentProjectId } },
          hasConflict: true,
          conflictNote: { contains: currentProjectNumber },
        },
        select: { id: true, scheduleId: true },
      });

      if (staleItems.length > 0) {
        await prisma.scheduleItem.updateMany({
          where: { id: { in: staleItems.map(s => s.id) } },
          data: { hasConflict: false, conflictNote: null },
        });

        // Re-check if affected schedules still have any remaining conflicts
        const affectedScheduleIds = [...new Set(staleItems.map(s => s.scheduleId))];
        for (const schedId of affectedScheduleIds) {
          const remaining = await prisma.scheduleItem.count({
            where: { scheduleId: schedId, hasConflict: true },
          });
          if (remaining === 0) {
            await prisma.schedule.update({
              where: { id: schedId },
              data: { hasConflict: false },
            });
          }
        }
      }
    }

    if (checks.length === 0) return;

    // 2. Batch query for potential conflicts
    // We want to find *other* schedule items that overlap with any of our checks for the same employees.
    // Doing this efficiently in one query is hard without complex OR clauses.
    // We can iterate or do a broad query. given the scale, a broad query for the employees might be ok, 
    // checking date ranges in memory if needed, or just iterate.
    // Let's iterate for now as it is safer and clearer.

    for (const check of checks) {
        const conflicts = await prisma.scheduleItem.findMany({
            where: {
                schedule: {
                    projectId: { not: currentProjectId }
                },
                assignees: {
                    some: {
                        id: { in: check.employeeIds }
                    }
                },
                // Overlap: (StartA <= EndB) and (EndA >= StartB)
                // Check.Start <= Item.End AND Check.End >= Item.Start
                plannedEnd: { gte: check.start },
                plannedStart: { lte: check.end },
                status: { not: 'DONE' }
            },
            include: {
                schedule: {
                    include: {
                        project: {
                            select: { id: true, name: true, projectNumber: true, assignedToId: true }
                        }
                    }
                },
                assignees: {
                    where: { id: { in: check.employeeIds } },
                    select: { id: true, givenName: true }
                }
            }
        });

        if (conflicts.length > 0) {
            // Mark the item in the input array as conflicted
            const item = items.find(it => it.title === check.title);
            if (item) {
                item.hasConflict = true;
                item.conflictNote = `Double-booked with ${conflicts.map(c => c.schedule.project.projectNumber).join(', ')}`;
            }
        }

        // 3. Notify
        for (const conflict of conflicts) {
            const otherProject = conflict.schedule.project;
            const recipientId = otherProject.assignedToId;

            if (recipientId) {
                const conflictedEmployees = conflict.assignees.map(e => e.givenName).join(', ');
                const message = `Resource Conflict Alert: Your project ${otherProject.projectNumber} (${otherProject.name}) has a conflict. Worker(s) ${conflictedEmployees} are double-booked by project ${currentProjectNumber} (${currentProjectName}) for task "${check.title}" around ${check.start.toLocaleDateString()}.`;

                // Check if similar notification exists to avoid spam (optional, but good)
                // For now, just send it.
                await prisma.notification.create({
                    data: {
                        userId: recipientId,
                        kind: 'Warning',
                        message: message,
                        link: `/projects/${otherProject.id}/schedule` // Navigate to schedule
                    }
                });

                // 4. Mark the conflict on the *other* project's item so it shows up red
                await prisma.scheduleItem.update({
                    where: { id: conflict.id },
                    data: {
                        hasConflict: true,
                        conflictNote: `Double-booked by ${currentProjectNumber} for task "${check.title}"`
                    }
                });

                // 5. Explicitly flag the other project's schedule as having conflicts
                await prisma.schedule.update({
                    where: { id: conflict.scheduleId },
                    data: { hasConflict: true }
                }).catch(err => console.error('[CONFLICT_DETECTION] Failed to flag other project schedule', err));
            }
        }
    }
}
