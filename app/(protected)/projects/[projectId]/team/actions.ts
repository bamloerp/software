'use server';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// Helper: (re)compute plannedEnd from estimatedHours and sum of hoursPerDay
async function recomputeDates(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignments: true },
  });
  if (!task) return;

  if (!task.plannedStart) return; // if no start, skip auto end calc
  const totalHoursPerDay =
    task.assignments.reduce((a, a2) => a + Number(a2.hoursPerDay ?? 0), 0) || 0;
  if (totalHoursPerDay <= 0) return;

  const daysNeeded = Math.ceil(Number(task.estimatedHours) / totalHoursPerDay);
  const start = new Date(task.plannedStart);
  const end = new Date(start);
  end.setDate(end.getDate() + daysNeeded);

  await prisma.task.update({
    where: { id: taskId },
    data: { plannedEnd: end },
  });
}

export async function createTask(projectId: string, args: {
  templateKey?: string | null;
  title: string;
  description?: string | null;
  quantity?: number | null;
  plannedStart?: string | null; // yyyy-mm-dd
  estimatedHours?: number | null; // optional override
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes((user as any).role)) {
    throw new Error('Only Project Managers can create tasks');
  }

  let estimatedHours = Number(args.estimatedHours ?? 0);
  let template = null as null | { hoursPerUnit: number; complexityFactor: number };

  if (args.templateKey) {
    const t = await prisma.taskTemplate.findUnique({ where: { key: args.templateKey } });
    if (!t) throw new Error('Template not found');
    template = { hoursPerUnit: t.hoursPerUnit, complexityFactor: t.complexityFactor };

    const qty = Number(args.quantity ?? 0);
    estimatedHours = estimatedHours > 0
      ? estimatedHours
      : Math.max(1, qty * t.hoursPerUnit * (t.complexityFactor ?? 1));
  } else if (estimatedHours <= 0) {
    estimatedHours = 8; // default 1 day
  }

  const plannedStart = args.plannedStart ? new Date(args.plannedStart) : null;

  const created = await prisma.task.create({
    data: {
      projectId,
      templateKey: args.templateKey ?? null,
      title: args.title.trim(),
      description: args.description?.trim() ?? null,
      quantity: args.quantity ?? null,
      estimatedHours,
      plannedStart,
      status: 'PENDING',
      createdById: user.id!,
    },
  });

  if (plannedStart) await recomputeDates(created.id);

  revalidatePath(`/projects/${projectId}/team`);
  return { ok: true, taskId: created.id };
}

/* export async function setTaskAssignees(taskId: string, assignees: { userId: string; hoursPerDay?: number }[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes((user as any).role)) {
    throw new Error('Only Project Managers can assign tasks');
  }

  await prisma.$transaction(async (tx) => {
    await tx.taskAssignment.deleteMany({ where: { taskId } });
    if (assignees.length) {
      await tx.taskAssignment.createMany({
        data: assignees.map(a => ({
          taskId,
          userId: a.userId,
          hoursPerDay: Number(a.hoursPerDay ?? 8),
        })),
      });
    }
  });

  await recomputeDates(taskId);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (task) revalidatePath(`/projects/${task.projectId}/team`);
  return { ok: true };
} */

/* export async function logTaskProgress(taskId: string, args: { percent: number; note?: string | null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  // TEAM members, PM, ADMIN can log progress
  if (!['PROJECT_TEAM', 'PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes((user as any).role)) {
    throw new Error('Not allowed');
  }

  const pct = Math.max(0, Math.min(100, Math.floor(Number(args.percent))));
  await prisma.$transaction(async (tx) => {
    await tx.taskProgress.create({
      data: {
        taskId,
        userId: user.id!,
        percent: pct,
        note: args.note?.trim() ?? null,
      },
    });
    await tx.task.update({
      where: { id: taskId },
      data: { percentComplete: pct, status: pct >= 100 ? 'DONE' : 'IN_PROGRESS' },
    });
  });

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (task) revalidatePath(`/projects/${task.projectId}/team`);
  return { ok: true };
} */

export async function updateTaskStatus(taskId: string, status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE') {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  if (!['PROJECT_OPERATIONS_OFFICER', 'ADMIN'].includes((user as any).role)) {
    throw new Error('Only PM can change status');
  }
  await prisma.task.update({ where: { id: taskId }, data: { status } });
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (task) revalidatePath(`/projects/${task.projectId}/team`);
  return { ok: true };
}

export async function logTaskProgress(taskId: string, percent: number, note: string) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  // Only assigned user, PM of the project, or Admin can log
  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    include: {
      project: { include: { ProjectMember: { include: { user: true } } } },
      assignments: { include: { user: true } },
    },
  });
  if (!task) throw new Error('Task not found');

  const isAssigned = task.assignments.some(a => a.userId === me.id);
  const isPM = task.project.ProjectMember.some(m => m.userId === me.id && m.role === 'PM');
  const isAdmin = (me as any).role === 'ADMIN';
  if (!(isAssigned || isPM || isAdmin)) throw new Error('Not allowed');

  const p = Math.max(0, Math.min(100, Number(percent)));

  await prisma.taskProgress.create({
    data: {
      taskId,
      userId: me.id!,
      percent: Math.round(p),
      note: note?.trim() || null,
    },
  });

  // If 100%, optionally flip status to DONE
  if (p === 100) {
    await prisma.projectTask.update({ where: { id: taskId }, data: { status: 'DONE' } });
  } else {
    await prisma.projectTask.update({ where: { id: taskId }, data: { status: 'ACTIVE' } });
  }

  revalidatePath(`/projects/${task.projectId}/team`);
}


export async function setTaskAssignees(taskId: string, entries: { userId: string; hoursPerDay: number }[]) {
  const me = await getCurrentUser();
  if (!me) throw new Error('Auth required');

  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    include: { project: { include: { ProjectMember: true } } },
  });
  if (!task) throw new Error('Task not found');

  const isPM = task.project.ProjectMember.some(m => m.userId === me.id && m.role === 'PM');
  const canAssign = ['ADMIN', 'HUMAN_RESOURCE'].includes((me as any).role);
  if (!(isPM || canAssign)) throw new Error('Only PM, HR, or Admin can assign');

  // Replace assignments
  await prisma.taskAssignment.deleteMany({ where: { taskId } });
  if (entries.length) {
    await prisma.taskAssignment.createMany({
      data: entries.map(e => ({
        taskId,
        userId: e.userId,
        hoursPerDay: Math.max(1, Math.min(12, Number(e.hoursPerDay || 8))),
      })),
    });
  }

  // Recompute plannedEnd if plannedStart exists and there is capacity
  if (task.plannedStart && entries.length) {
    const capacity = entries.reduce((a, e) => a + (Number(e.hoursPerDay) || 0), 0);
    const hours = task.estimatedHours || 8;
    const daysNeeded = Math.ceil(hours / Math.max(1, capacity));
    const start = new Date(task.plannedStart);
    const end = new Date(start);
    end.setDate(start.getDate() + daysNeeded);
    await prisma.projectTask.update({
      where: { id: taskId },
      data: { plannedEnd: end },
    });
  }

  revalidatePath(`/projects/${task.projectId}/team`);
}

