"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowsRightLeftIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EmployeeStat, GanttItem, TimesheetRow } from './performanceData';

export type { EmployeeStat, GanttItem, TimesheetRow } from './performanceData';

type ViewMode = 'PERFORMANCE' | 'GANTT' | 'TIMESHEET' | 'COMPARE';
type PresentationMode = 'CHART' | 'TABLE';

export default function EmployeePerformanceView({
  employees,
  ganttItems = [],
  timesheets = [],
}: {
  employees: EmployeeStat[];
  ganttItems?: GanttItem[];
  timesheets?: TimesheetRow[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('PERFORMANCE');
  const [presentationMode, setPresentationMode] = useState<PresentationMode>('CHART');
  const [compareA, setCompareA] = useState<string>(employees[0]?.id || '');
  const [compareB, setCompareB] = useState<string>(employees[1]?.id || employees[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of ganttItems) map.set(item.projectId, item.projectName);
    for (const row of timesheets) map.set(row.projectId, row.projectName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [ganttItems, timesheets]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (!normalizedSearch) return true;
      return employee.name.toLowerCase().includes(normalizedSearch) || employee.role.toLowerCase().includes(normalizedSearch);
    });
  }, [employees, normalizedSearch]);

  const filteredGanttItems = useMemo(() => {
    return ganttItems.filter((item) => {
      const projectMatches = projectFilter === 'ALL' || item.projectId === projectFilter;
      const searchMatches = !normalizedSearch
        || item.employeeName.toLowerCase().includes(normalizedSearch)
        || item.projectName.toLowerCase().includes(normalizedSearch)
        || item.taskTitle.toLowerCase().includes(normalizedSearch);
      return projectMatches && searchMatches;
    });
  }, [ganttItems, normalizedSearch, projectFilter]);

  const filteredTimesheets = useMemo(() => {
    return timesheets.filter((row) => {
      const projectMatches = projectFilter === 'ALL' || row.projectId === projectFilter;
      const searchMatches = !normalizedSearch
        || row.employeeName.toLowerCase().includes(normalizedSearch)
        || row.projectName.toLowerCase().includes(normalizedSearch)
        || row.taskTitle.toLowerCase().includes(normalizedSearch)
        || (row.activity || '').toLowerCase().includes(normalizedSearch);
      return projectMatches && searchMatches;
    });
  }, [normalizedSearch, projectFilter, timesheets]);

  const currentTableTotal = viewMode === 'GANTT'
    ? filteredGanttItems.length
    : viewMode === 'TIMESHEET'
      ? filteredTimesheets.length
      : filteredEmployees.length;
  const totalPages = Math.max(1, Math.ceil(currentTableTotal / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIdx = (safeCurrentPage - 1) * pageSize;

  const empA = employees.find((employee) => employee.id === compareA);
  const empB = employees.find((employee) => employee.id === compareB);
  const chartEmployees = filteredEmployees.slice(0, 12).map((employee) => ({ ...employee, completionRate: completionRate(employee) }));
  const chartTimesheets = useMemo(() => aggregateTimesheets(filteredTimesheets).slice(0, 12), [filteredTimesheets]);

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    setCurrentPage(1);
    if (mode !== 'COMPARE') setPresentationMode('CHART');
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex flex-wrap gap-2 rounded-lg bg-gray-100 p-1">
          <ModeButton active={viewMode === 'PERFORMANCE'} icon={<ChartBarIcon className="h-4 w-4" />} onClick={() => changeView('PERFORMANCE')}>Performance</ModeButton>
          <ModeButton active={viewMode === 'GANTT'} icon={<CalendarDaysIcon className="h-4 w-4" />} onClick={() => changeView('GANTT')}>Gantt</ModeButton>
          <ModeButton active={viewMode === 'TIMESHEET'} icon={<ClockIcon className="h-4 w-4" />} onClick={() => changeView('TIMESHEET')}>Timesheets</ModeButton>
          <ModeButton active={viewMode === 'COMPARE'} icon={<ArrowsRightLeftIcon className="h-4 w-4" />} onClick={() => changeView('COMPARE')}>Compare</ModeButton>
        </div>

        {viewMode !== 'COMPARE' && (
          <div className="flex rounded-lg bg-gray-100 p-1">
            <ModeButton active={presentationMode === 'CHART'} icon={<ChartBarIcon className="h-4 w-4" />} onClick={() => setPresentationMode('CHART')}>Chart</ModeButton>
            <ModeButton active={presentationMode === 'TABLE'} icon={<TableCellsIcon className="h-4 w-4" />} onClick={() => setPresentationMode('TABLE')}>Table</ModeButton>
          </div>
        )}
      </div>

      {viewMode !== 'COMPARE' && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              className="block w-full rounded-md border-0 py-2 pl-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
              placeholder="Search employees, projects, tasks..."
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setCurrentPage(1); }}
            />
          </div>
          {(viewMode === 'GANTT' || viewMode === 'TIMESHEET') && projectOptions.length > 1 && (
            <select
              title="Project filter"
              value={projectFilter}
              onChange={(event) => { setProjectFilter(event.target.value); setCurrentPage(1); }}
              className="rounded-md border-0 py-2 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm"
            >
              <option value="ALL">All projects</option>
              {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          )}
        </div>
      )}

      {viewMode === 'PERFORMANCE' && presentationMode === 'CHART' && <PerformanceChart employees={chartEmployees} />}
      {viewMode === 'PERFORMANCE' && presentationMode === 'TABLE' && <PerformanceTable employees={filteredEmployees.slice(startIdx, startIdx + pageSize)} />}
      {viewMode === 'GANTT' && presentationMode === 'CHART' && <GanttChart items={filteredGanttItems} />}
      {viewMode === 'GANTT' && presentationMode === 'TABLE' && <GanttTable items={filteredGanttItems.slice(startIdx, startIdx + pageSize)} />}
      {viewMode === 'TIMESHEET' && presentationMode === 'CHART' && <TimesheetChart rows={chartTimesheets} />}
      {viewMode === 'TIMESHEET' && presentationMode === 'TABLE' && <TimesheetTable rows={filteredTimesheets.slice(startIdx, startIdx + pageSize)} />}
      {viewMode === 'COMPARE' && <CompareView employees={employees} compareA={compareA} compareB={compareB} empA={empA} empB={empB} onCompareA={setCompareA} onCompareB={setCompareB} />}

      {viewMode !== 'COMPARE' && presentationMode === 'TABLE' && currentTableTotal > pageSize && (
        <Pagination currentPage={safeCurrentPage} totalPages={totalPages} totalItems={currentTableTotal} startIdx={startIdx} pageSize={pageSize} onPageChange={setCurrentPage} />
      )}
    </div>
  );
}

function ModeButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
      {icon}
      {children}
    </button>
  );
}

function PerformanceChart({ employees }: { employees: (EmployeeStat & { completionRate: number })[] }) {
  if (employees.length === 0) return <EmptyState title="No employees found" description="Adjust your search to see employee performance charts." />;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Employee Performance Chart</h2>
        <p className="text-sm text-gray-500">Top employees by assigned work, completed tasks, daily updates, and planned hours.</p>
      </div>
      <div className="h-[440px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={employees} layout="vertical" margin={{ top: 8, right: 24, left: 72, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="tasksAssigned" name="Assigned" fill="#2563eb" radius={[0, 4, 4, 0]} />
            <Bar dataKey="tasksCompleted" name="Completed" fill="#059669" radius={[0, 4, 4, 0]} />
            <Bar dataKey="reportsSubmitted" name="Daily updates" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            <Bar dataKey="plannedHours" name="Planned hours" fill="#f97316" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PerformanceTable({ employees }: { employees: EmployeeStat[] }) {
  if (employees.length === 0) return <EmptyState title="No employees found" description="Adjust your search to see employee performance rows." />;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <TableHeader>Employee</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader align="right">Projects</TableHeader>
              <TableHeader align="right">Assigned</TableHeader>
              <TableHeader align="right">Completed</TableHeader>
              <TableHeader align="right">Completion</TableHeader>
              <TableHeader align="right">Daily updates</TableHeader>
              <TableHeader align="right">Planned hours</TableHeader>
              <TableHeader>Last activity</TableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {employees.map((employee) => {
              const rate = completionRate(employee);
              return (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 ring-2 ring-white">{employee.name.charAt(0)}</div>
                      <div className="ml-4 text-sm font-medium text-gray-900">{employee.name}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">{formatRole(employee.role)}</span>
                  </td>
                  <TableCell align="right">{employee.projectCount}</TableCell>
                  <TableCell align="right">{employee.tasksAssigned}</TableCell>
                  <TableCell align="right" strong>{employee.tasksCompleted}</TableCell>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                    <div className="flex items-center justify-end gap-2">
                      <span>{rate.toFixed(0)}%</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${rate >= 100 ? 'bg-emerald-500' : 'bg-blue-500'} ${widthBucketClass(rate)}`} />
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                    {employee.reportsSubmitted > 0 ? <span className="inline-flex items-center gap-1 font-medium text-indigo-600"><ChatBubbleLeftRightIcon className="h-4 w-4" />{employee.reportsSubmitted}</span> : '-'}
                  </td>
                  <TableCell align="right">{formatNumber(employee.plannedHours)}</TableCell>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {employee.lastActive ? <div className="flex items-center gap-1.5"><ClockIcon className="h-4 w-4 text-gray-400" /><span>{formatDate(employee.lastActive)}</span></div> : <span className="italic text-gray-300">No activity</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GanttChart({ items }: { items: GanttItem[] }) {
  const datedItems = items.filter((item) => item.plannedStart || item.plannedEnd).slice(0, 40);
  if (datedItems.length === 0) return <EmptyState title="No planned dates found" description="Add planned start and end dates on the project schedule to see the Gantt chart." />;

  const starts = datedItems.map((item) => new Date(item.plannedStart || item.plannedEnd!));
  const ends = datedItems.map((item) => new Date(item.plannedEnd || item.plannedStart!));
  const minDate = new Date(Math.min(...starts.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...ends.map((date) => date.getTime())));
  const totalDays = Math.max(1, diffDays(minDate, maxDate) + 1);
  const tickDates = buildTimelineTicks(minDate, maxDate);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Project Gantt By Employee</h2>
        <p className="text-sm text-gray-500">Tasks are grouped by employee and project. Showing the first 40 scheduled rows after filters.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[980px] space-y-2">
          <div className="grid grid-cols-[260px_1fr] gap-4 text-xs font-medium uppercase tracking-wide text-gray-500">
            <div>Employee / Task</div>
            <div className="flex h-8 items-start justify-between border-b border-gray-200">
              {tickDates.map((date) => <div key={date.toISOString()} className="text-[11px] text-gray-500">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>)}
            </div>
          </div>
          {datedItems.map((item) => {
            const start = new Date(item.plannedStart || item.plannedEnd!);
            const end = new Date(item.plannedEnd || item.plannedStart!);
            const { startClass, spanClass } = ganttGridClasses(minDate, start, end, totalDays);
            return (
              <div key={item.id} className="grid grid-cols-[260px_1fr] items-center gap-4 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{item.employeeName}</div>
                  <div className="truncate text-xs text-gray-500">{item.projectName} - {item.taskTitle}</div>
                </div>
                <div className="grid h-9 grid-cols-12 rounded-md bg-white ring-1 ring-gray-100">
                  <div className={`${startClass} ${spanClass} mt-1.5 h-6 rounded-md px-2 text-[11px] font-medium leading-6 text-white shadow-sm ${statusColor(item.status)}`} title={`${item.taskTitle}: ${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`}>
                    <span className="block truncate">{item.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GanttTable({ items }: { items: GanttItem[] }) {
  if (items.length === 0) return <EmptyState title="No scheduled work found" description="Assign employees to schedule items to populate this table." />;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr><TableHeader>Employee</TableHeader><TableHeader>Project</TableHeader><TableHeader>Task</TableHeader><TableHeader>Status</TableHeader><TableHeader>Start</TableHeader><TableHeader>End</TableHeader><TableHeader align="right">Est. hours</TableHeader><TableHeader align="right">Daily updates</TableHeader></tr></thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <TableCell strong>{item.employeeName}</TableCell>
                <TableCell>{item.projectName}</TableCell>
                <TableCell>{item.taskTitle}</TableCell>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${statusColor(item.status)}`}>{item.status}</span></td>
                <TableCell>{item.plannedStart ? formatDate(item.plannedStart) : '-'}</TableCell>
                <TableCell>{item.plannedEnd ? formatDate(item.plannedEnd) : '-'}</TableCell>
                <TableCell align="right">{item.estHours ?? '-'}</TableCell>
                <TableCell align="right">{item.reportsSubmitted}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimesheetChart({ rows }: { rows: { employeeName: string; entries: number; plannedHours: number }[] }) {
  if (rows.length === 0) return <EmptyState title="No timesheet activity found" description="Timesheets appear once daily task reports are submitted against assigned schedule work." />;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4"><h2 className="text-lg font-semibold text-gray-900">Timesheet Summary</h2><p className="text-sm text-gray-500">Daily report entries and estimated hours by employee.</p></div>
      <div className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 72, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="employeeName" width={150} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="entries" name="Entries" fill="#2563eb" radius={[0, 4, 4, 0]} />
            <Bar dataKey="plannedHours" name="Estimated hours" fill="#f97316" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TimesheetTable({ rows }: { rows: TimesheetRow[] }) {
  if (rows.length === 0) return <EmptyState title="No timesheet rows found" description="Submitted daily task reports will appear here as timesheet rows." />;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50"><tr><TableHeader>Date</TableHeader><TableHeader>Employee</TableHeader><TableHeader>Project</TableHeader><TableHeader>Task</TableHeader><TableHeader>Activity</TableHeader><TableHeader align="right">Est. hours</TableHeader><TableHeader>Progress</TableHeader><TableHeader>Reported by</TableHeader></tr></thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell strong>{row.employeeName}</TableCell>
                <TableCell>{row.projectName}</TableCell>
                <TableCell>{row.taskTitle}</TableCell>
                <TableCell>{row.activity || '-'}</TableCell>
                <TableCell align="right">{row.plannedHours ?? '-'}</TableCell>
                <TableCell>{formatProgress(row)}</TableCell>
                <TableCell>{row.reportedBy || '-'}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareView({ employees, compareA, compareB, empA, empB, onCompareA, onCompareB }: { employees: EmployeeStat[]; compareA: string; compareB: string; empA?: EmployeeStat; empB?: EmployeeStat; onCompareA: (id: string) => void; onCompareB: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
      <div className="relative mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="hidden md:flex absolute left-1/2 top-10 z-10 h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500 ring-4 ring-white">VS</div>
        <EmployeeSelector label="Detailed analysis for" value={compareA} employees={employees} selected={empA} accent="indigo" onChange={onCompareA} />
        <EmployeeSelector label="Compare against" value={compareB} employees={employees} selected={empB} accent="green" onChange={onCompareB} />
      </div>
      {empA && empB && (
        <div className="mx-auto max-w-2xl space-y-6">
          <StatRow label="Tasks Assigned" valA={empA.tasksAssigned} valB={empB.tasksAssigned} winner={winner(empA.tasksAssigned, empB.tasksAssigned)} />
          <StatRow label="Tasks Completed" valA={empA.tasksCompleted} valB={empB.tasksCompleted} winner={winner(empA.tasksCompleted, empB.tasksCompleted)} />
          <StatRow label="Completion Rate" valA={Math.round(completionRate(empA))} valB={Math.round(completionRate(empB))} unit="%" winner="High is Good" />
          <StatRow label="Daily Updates" valA={empA.reportsSubmitted} valB={empB.reportsSubmitted} winner={winner(empA.reportsSubmitted, empB.reportsSubmitted)} />
          <StatRow label="Planned Hours" valA={Math.round(empA.plannedHours)} valB={Math.round(empB.plannedHours)} winner={winner(empA.plannedHours, empB.plannedHours)} />
        </div>
      )}
    </div>
  );
}

function EmployeeSelector({ label, value, employees, selected, accent, onChange }: { label: string; value: string; employees: EmployeeStat[]; selected?: EmployeeStat; accent: 'indigo' | 'green'; onChange: (id: string) => void }) {
  const accentClass = accent === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700';
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
      <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <select title={label} value={value} onChange={(event) => onChange(event.target.value)} className="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm">
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
      </select>
      {selected && (
        <div className="mt-6 flex flex-col items-center text-center">
          <div className={`mb-3 flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold ring-4 ring-white ${accentClass}`}>{selected.name.charAt(0)}</div>
          <h3 className="text-lg font-bold text-gray-900">{selected.name}</h3>
          <div className="mt-1 inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">{formatRole(selected.role)}</div>
        </div>
      )}
    </div>
  );
}

function Pagination({ currentPage, totalPages, totalItems, startIdx, pageSize, onPageChange }: { currentPage: number; totalPages: number; totalItems: number; startIdx: number; pageSize: number; onPageChange: (page: number | ((page: number) => number)) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-3 shadow-sm">
      <p className="hidden text-sm text-gray-700 sm:block">Showing <span className="font-medium">{startIdx + 1}</span> to <span className="font-medium">{Math.min(startIdx + pageSize, totalItems)}</span> of <span className="font-medium">{totalItems}</span></p>
      <div className="flex flex-1 justify-between sm:flex-initial sm:justify-end">
        <button type="button" onClick={() => onPageChange((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" />Previous</button>
        <span className="mx-3 hidden items-center text-sm text-gray-500 sm:inline-flex">Page {currentPage} of {totalPages}</span>
        <button type="button" onClick={() => onPageChange((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Next<ChevronRightIcon className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
      <UserGroupIcon className="mx-auto h-12 w-12 text-gray-300" />
      <h3 className="mt-2 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

function TableHeader({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <th scope="col" className={`px-6 py-3 ${align === 'right' ? 'text-right' : 'text-left'} text-xs font-medium uppercase tracking-wider text-gray-500`}>{children}</th>;
}

function TableCell({ children, align = 'left', strong = false }: { children: ReactNode; align?: 'left' | 'right'; strong?: boolean }) {
  return <td className={`whitespace-nowrap px-6 py-4 ${align === 'right' ? 'text-right' : 'text-left'} text-sm ${strong ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{children}</td>;
}

function StatRow({ label, valA, valB, winner, unit = '' }: { label: string; valA: number; valB: number; winner?: 'A' | 'B' | 'Draw' | 'High is Good'; unit?: string }) {
  let colorA = 'bg-gray-200';
  let colorB = 'bg-gray-200';
  if (winner === 'A' || (winner === 'High is Good' && valA > valB)) colorA = 'bg-indigo-500';
  else if (winner === 'B' || (winner === 'High is Good' && valB > valA)) colorB = 'bg-green-500';
  else if (winner === 'Draw' || valA === valB) {
    colorA = 'bg-gray-400';
    colorB = 'bg-gray-400';
  }

  return (
    <div className="relative">
      <div className="mb-1 flex justify-between text-sm font-semibold">
        <span className={winner === 'A' || (winner === 'High is Good' && valA > valB) ? 'text-indigo-600' : 'text-gray-500'}>{valA}{unit}</span>
        <span className="text-xs font-medium uppercase text-gray-400">{label}</span>
        <span className={winner === 'B' || (winner === 'High is Good' && valB > valA) ? 'text-green-600' : 'text-gray-500'}>{valB}{unit}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${colorA} ${comparisonWidthClass(valA, valB, 'A')} transition-all duration-500`} />
        <div className="z-10 h-full w-0.5 bg-white" />
        <div className={`h-full ${colorB} ${comparisonWidthClass(valA, valB, 'B')} transition-all duration-500`} />
      </div>
    </div>
  );
}

const WIDTH_BUCKET_CLASSES = [
  'w-0',
  'w-1/12',
  'w-2/12',
  'w-3/12',
  'w-4/12',
  'w-5/12',
  'w-6/12',
  'w-7/12',
  'w-8/12',
  'w-9/12',
  'w-10/12',
  'w-11/12',
  'w-full',
] as const;

const GANTT_START_CLASSES = [
  'col-start-1',
  'col-start-2',
  'col-start-3',
  'col-start-4',
  'col-start-5',
  'col-start-6',
  'col-start-7',
  'col-start-8',
  'col-start-9',
  'col-start-10',
  'col-start-11',
  'col-start-12',
] as const;

const GANTT_SPAN_CLASSES = [
  'col-span-1',
  'col-span-2',
  'col-span-3',
  'col-span-4',
  'col-span-5',
  'col-span-6',
  'col-span-7',
  'col-span-8',
  'col-span-9',
  'col-span-10',
  'col-span-11',
  'col-span-12',
] as const;

function widthBucketClass(percent: number) {
  const bucket = Math.max(0, Math.min(12, Math.round((Math.min(percent, 100) / 100) * 12)));
  return WIDTH_BUCKET_CLASSES[bucket];
}

function comparisonWidthClass(valA: number, valB: number, side: 'A' | 'B') {
  if (valA === 0 && valB === 0) return 'w-6/12';
  const total = valA + valB;
  const value = side === 'A' ? valA : valB;
  return widthBucketClass((value / total) * 100);
}

function ganttGridClasses(minDate: Date, start: Date, end: Date, totalDays: number) {
  const startBucket = Math.max(0, Math.min(11, Math.floor((diffDays(minDate, start) / totalDays) * 12)));
  const spanBucket = Math.max(1, Math.min(12 - startBucket, Math.ceil(((diffDays(start, end) + 1) / totalDays) * 12)));
  return {
    startClass: GANTT_START_CLASSES[startBucket],
    spanClass: GANTT_SPAN_CLASSES[spanBucket - 1],
  };
}

function aggregateTimesheets(rows: TimesheetRow[]) {
  const map = new Map<string, { employeeName: string; entries: number; plannedHours: number }>();
  for (const row of rows) {
    const current = map.get(row.employeeId) || { employeeName: row.employeeName, entries: 0, plannedHours: 0 };
    current.entries += 1;
    current.plannedHours += row.plannedHours || 0;
    map.set(row.employeeId, current);
  }
  return Array.from(map.values()).map((row) => ({ ...row, plannedHours: Math.round(row.plannedHours * 100) / 100 })).sort((a, b) => b.entries - a.entries || b.plannedHours - a.plannedHours);
}

function buildTimelineTicks(start: Date, end: Date) {
  const totalDays = Math.max(1, diffDays(start, end));
  const tickCount = Math.min(6, totalDays + 1);
  return Array.from({ length: tickCount }, (_, index) => {
    const offset = Math.round((totalDays / Math.max(1, tickCount - 1)) * index);
    const tick = new Date(start);
    tick.setDate(start.getDate() + offset);
    return tick;
  });
}

function diffDays(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((endUtc - startUtc) / msPerDay));
}

function completionRate(employee: EmployeeStat) {
  return employee.tasksAssigned > 0 ? (employee.tasksCompleted / employee.tasksAssigned) * 100 : 0;
}

function winner(a: number, b: number): 'A' | 'B' | 'Draw' {
  if (a > b) return 'A';
  if (b > a) return 'B';
  return 'Draw';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatRole(role: string) {
  return role.replace(/_/g, ' ');
}

function formatProgress(row: TimesheetRow) {
  const used = row.usedQty !== null ? `${row.usedQty} ${row.usedUnit || ''}`.trim() : null;
  const remaining = row.remainingQty !== null ? `${row.remainingQty} ${row.remainingUnit || ''}`.trim() : null;
  if (used && remaining) return `${used} used, ${remaining} remaining`;
  if (used) return `${used} used`;
  if (remaining) return `${remaining} remaining`;
  return '-';
}

function statusColor(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'DONE' || normalized === 'COMPLETED') return 'bg-emerald-500';
  if (normalized === 'BLOCKED' || normalized === 'DELAYED') return 'bg-rose-500';
  if (normalized === 'IN_PROGRESS' || normalized === 'ACTIVE') return 'bg-blue-500';
  return 'bg-gray-500';
}
