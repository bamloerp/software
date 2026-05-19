export type EmployeeStat = {
  id: string;
  name: string;
  role: string;
  tasksAssigned: number;
  tasksCompleted: number;
  reportsSubmitted: number;
  lastActive: string | null;
  projectCount: number;
  plannedHours: number;
};

export type GanttItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  taskTitle: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  estHours: number | null;
  reportsSubmitted: number;
};

export type TimesheetRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  taskTitle: string;
  date: string;
  activity: string | null;
  plannedHours: number | null;
  reportedBy: string | null;
  usedQty: number | null;
  usedUnit: string | null;
  remainingQty: number | null;
  remainingUnit: string | null;
};

type EmployeeStatInternal = EmployeeStat & { projectIds: Set<string> };

function dateToIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function projectDisplayName(project: any) {
  return project?.quote?.customer?.displayName || project?.name || 'Unnamed Project';
}

function employeeDisplayName(employee: any) {
  return [employee?.givenName, employee?.surname].filter(Boolean).join(' ') || 'Unknown Employee';
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildEmployeePerformanceData(schedules: any[]): {
  employees: EmployeeStat[];
  ganttItems: GanttItem[];
  timesheets: TimesheetRow[];
} {
  const employeeStats = new Map<string, EmployeeStatInternal>();
  const ganttItems: GanttItem[] = [];
  const timesheets: TimesheetRow[] = [];

  for (const schedule of schedules) {
    const project = schedule.project;
    const projectId = project?.id || schedule.projectId || 'unknown-project';
    const projectName = projectDisplayName(project);

    for (const item of schedule.items ?? []) {
      const assignees = item.assignees ?? [];
      const assigneeCount = Math.max(assignees.length, 1);
      const hoursPerAssignee = typeof item.estHours === 'number' ? item.estHours / assigneeCount : null;
      const reports = item.reports ?? [];

      for (const assignee of assignees) {
        const employeeName = employeeDisplayName(assignee);
        if (!employeeStats.has(assignee.id)) {
          employeeStats.set(assignee.id, {
            id: assignee.id,
            name: employeeName,
            role: assignee.role || 'Employee',
            tasksAssigned: 0,
            tasksCompleted: 0,
            reportsSubmitted: 0,
            lastActive: null,
            projectCount: 0,
            plannedHours: 0,
            projectIds: new Set<string>(),
          });
        }

        const stats = employeeStats.get(assignee.id)!;
        stats.tasksAssigned += 1;
        stats.projectIds.add(projectId);
        stats.projectCount = stats.projectIds.size;
        if (typeof hoursPerAssignee === 'number') {
          stats.plannedHours = roundHours(stats.plannedHours + hoursPerAssignee);
        }
        if (item.status === 'DONE' || item.status === 'COMPLETED') {
          stats.tasksCompleted += 1;
        }

        ganttItems.push({
          id: `${item.id}-${assignee.id}`,
          employeeId: assignee.id,
          employeeName,
          projectId,
          projectName,
          taskTitle: item.title || 'Untitled task',
          status: item.status || 'ACTIVE',
          plannedStart: dateToIso(item.plannedStart),
          plannedEnd: dateToIso(item.plannedEnd || item.plannedStart),
          estHours: typeof hoursPerAssignee === 'number' ? roundHours(hoursPerAssignee) : null,
          reportsSubmitted: reports.length,
        });

        for (const report of reports) {
          const reportDate = dateToIso(report.reportedForDate);
          if (reportDate) {
            stats.reportsSubmitted += 1;
            if (!stats.lastActive || reportDate > stats.lastActive) {
              stats.lastActive = reportDate;
            }
          }

          timesheets.push({
            id: `${report.id}-${assignee.id}`,
            employeeId: assignee.id,
            employeeName,
            projectId,
            projectName,
            taskTitle: item.title || 'Untitled task',
            date: reportDate || dateToIso(report.createdAt) || new Date().toISOString(),
            activity: report.activity || null,
            plannedHours: typeof hoursPerAssignee === 'number' ? roundHours(hoursPerAssignee) : null,
            reportedBy: report.reporter?.name || report.reporter?.email || null,
            usedQty: typeof report.usedQty === 'number' ? report.usedQty : null,
            usedUnit: report.usedUnit || null,
            remainingQty: typeof report.remainingQty === 'number' ? report.remainingQty : null,
            remainingUnit: report.remainingUnit || null,
          });
        }
      }
    }
  }

  const employees = Array.from(employeeStats.values())
    .map(({ projectIds, ...stats }) => stats)
    .sort((a, b) => b.tasksAssigned - a.tasksAssigned || a.name.localeCompare(b.name));

  return {
    employees,
    ganttItems: ganttItems.sort((a, b) => {
      const dateA = a.plannedStart || '';
      const dateB = b.plannedStart || '';
      return dateA.localeCompare(dateB) || a.projectName.localeCompare(b.projectName) || a.employeeName.localeCompare(b.employeeName);
    }),
    timesheets: timesheets.sort((a, b) => b.date.localeCompare(a.date) || a.employeeName.localeCompare(b.employeeName)),
  };
}