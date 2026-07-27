import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { createTask, setTaskAssignees, logTaskProgress, updateTaskStatus } from './actions';
import { revalidatePath } from 'next/cache';
import SubmitButton from '@/components/SubmitButton';

export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const me = await getCurrentUser();
  if (!me) return <div className="p-6">Authentication required.</div>;
  const role = (me as any).role as string | undefined;
  const isPM = role === 'PROJECT_OPERATIONS_OFFICER' || role === 'ADMIN';
  const canAssign = isPM || role === 'HUMAN_RESOURCE';
  const isTeam = role === 'PROJECT_TEAM' || canAssign;

  const [project, templates, team, tasks] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { quote: { select: { number: true, customer: { select: { displayName: true } } } } },
    }),
    prisma.taskTemplate.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { role: 'PROJECT_TEAM' }, orderBy: { name: 'asc' } }),
    prisma.task.findMany({
      where: { projectId },
      orderBy: [{ plannedStart: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    }),
  ]);

  if (!project) return <div className="p-6">Project not found.</div>;

  const createAction = async (fd: FormData) => {
    'use server';
    await createTask(projectId, {
      templateKey: String(fd.get('templateKey') || '') || null,
      title: String(fd.get('title') || ''),
      description: String(fd.get('description') || ''),
      quantity: Number(fd.get('quantity') || 0) || null,
      plannedStart: String(fd.get('plannedStart') || '') || null,
      estimatedHours: Number(fd.get('estimatedHours') || 0) || null,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Team & Tasks — {project.quote?.number}</h1>

      {isPM && (
        <section className="rounded border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Create Task</h2>
          <form action={createAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="flex flex-col text-sm">
              <span>Template (optional)</span>
              <select name="templateKey" className="rounded border px-2 py-1">
                <option value="">— Custom —</option>
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} (per {t.unitLabel})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              <span>Title</span>
              <input name="title" required className="rounded border px-2 py-1" />
            </label>
            <label className="flex flex-col text-sm">
              <span>Planned Start</span>
              <input type="date" name="plannedStart" className="rounded border px-2 py-1" />
            </label>
            <label className="flex flex-col text-sm md:col-span-3">
              <span>Description</span>
              <textarea name="description" rows={2} className="rounded border px-2 py-1" />
            </label>
            <label className="flex flex-col text-sm">
              <span>Quantity (if templated)</span>
              <input
                type="number"
                step="0.01"
                name="quantity"
                className="rounded border px-2 py-1"
              />
            </label>
            <label className="flex flex-col text-sm">
              <span>Estimated Hours (override)</span>
              <input
                type="number"
                step="0.1"
                name="estimatedHours"
                className="rounded border px-2 py-1"
              />
            </label>
            <div className="md:col-span-3">
              <SubmitButton
                loadingText="Creating task..."
                className="rounded bg-slate-900 px-3 py-1.5 text-white"
              >
                Create Task
              </SubmitButton>
            </div>
          </form>
        </section>
      )}

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <div className="mt-3 space-y-4">
          {tasks.length === 0 && <div className="text-sm text-gray-500">No tasks yet.</div>}
          {tasks.map((task) => {
            const setAssigneesAction = async (fd: FormData) => {
              'use server';
              const entries: { userId: string; hoursPerDay: number }[] = [];
              for (const u of team) {
                if (fd.get(`assign-${task.id}-${u.id}`) === 'on') {
                  const hp = Number(fd.get(`hpd-${task.id}-${u.id}`) || 8);
                  entries.push({ userId: u.id, hoursPerDay: hp });
                }
              }
              await setTaskAssignees(task.id, entries);
            };

            const logProgressAction = async (fd: FormData) => {
              'use server';

              const percent = Number(fd.get('percent') || 0);
              const note = String(fd.get('note') || '');

              await logTaskProgress(task.id, percent, note);
            };

            const setStatus = async (status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE') => {
              'use server';
              await updateTaskStatus(task.id, status);
            };

            return (
              <div key={task.id} className="rounded border p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold">{task.title}</div>
                    <div className="text-xs text-gray-500">
                      {task.plannedStart
                        ? `Start: ${new Date(task.plannedStart).toLocaleDateString()}`
                        : 'Start: —'}
                      {' · '}
                      {task.plannedEnd
                        ? `End: ${new Date(task.plannedEnd).toLocaleDateString()}`
                        : 'End: —'}
                      {' · '}Est: {task.estimatedHours}h · {task.status} · {task.percentComplete}%
                    </div>
                    {task.description && (
                      <div className="mt-1 text-sm text-gray-700">{task.description}</div>
                    )}
                  </div>

                  {isPM && (
                    <div className="mt-2 md:mt-0 flex gap-2">
                      <form
                        action={async () => {
                          'use server';
                          await setStatus('PENDING');
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Pending</button>
                      </form>
                      <form
                        action={async () => {
                          'use server';
                          await setStatus('IN_PROGRESS');
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Start</button>
                      </form>
                      <form
                        action={async () => {
                          'use server';
                          await setStatus('BLOCKED');
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Block</button>
                      </form>
                      <form
                        action={async () => {
                          'use server';
                          await setStatus('DONE');
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Done</button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Assignments */}
                {canAssign && (
                  <form action={setAssigneesAction} className="mt-3 grid gap-2 md:grid-cols-3">
                    {team.map((u) => {
                      const assigned = task.assignments.some((a) => a.userId === u.id);
                      const current = task.assignments.find((a) => a.userId === u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name={`assign-${task.id}-${u.id}`}
                            defaultChecked={assigned}
                          />
                          <span className="w-40 truncate">{u.name ?? u.email ?? u.id}</span>
                          <span className="text-xs text-gray-500">h/day</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            name={`hpd-${task.id}-${u.id}`}
                            defaultValue={current?.hoursPerDay ?? 8}
                            className="w-20 rounded border px-2 py-1"
                          />
                        </label>
                      );
                    })}
                    <div className="md:col-span-3">
                      <button className="rounded bg-indigo-600 px-3 py-1.5 text-white">
                        Save Assignments
                      </button>
                    </div>
                  </form>
                )}

                {/* Progress logging (team/PM) */}
                {isTeam && (
                  <form action={logProgressAction} className="mt-3 flex flex-wrap gap-2 text-sm">
                    <input
                      type="number"
                      name="percent"
                      min="0"
                      max="100"
                      defaultValue={task.percentComplete}
                      className="w-24 rounded border px-2 py-1"
                    />
                    <input
                      name="note"
                      placeholder="Note (optional)"
                      className="flex-1 rounded border px-2 py-1"
                    />
                    <button className="rounded bg-slate-900 px-3 py-1.5 text-white">
                      Log Progress
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
