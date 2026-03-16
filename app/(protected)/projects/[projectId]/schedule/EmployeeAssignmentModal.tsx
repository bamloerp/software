import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { checkEmployeeAvailability, getEmployeeBookings } from './actions';
import { calculateDuration, addWorkingTime, ProductivitySettings } from '@/lib/schedule-engine';

type Employee = {
  id: string;
  givenName: string;
  surname?: string | null;
  role: string;
  status?: string;
};

export default function EmployeeAssignmentModal({
  isOpen,
  onClose,
  employees,
  selectedIds,
  onSave,
  startDate,
  endDate,
  scheduleItemId,
  assignedIds,
  projectId,
  productivity,
  itemQuantity,
  itemUnit,
  itemTitle,
  itemDescription,
}: {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  startDate: string | null;
  endDate: string | null;
  scheduleItemId?: string | null;
  assignedIds: string[];
  projectId: string;
  productivity: ProductivitySettings;
  itemQuantity: number | null;
  itemUnit?: string | null;
  itemTitle: string;
  itemDescription?: string | null;
}) {
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds);
  const [busyEmployees, setBusyEmployees] = useState<string[]>([]);
  const [busyDetails, setBusyDetails] = useState<Record<string, any>>({});
  const [checking, setChecking] = useState(!!startDate); // Block selection until first check completes
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [projectedEnd, setProjectedEnd] = useState<string | null>(endDate);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [calendarEmpId, setCalendarEmpId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<
    Record<string, { project: string; task: string; start: string; end: string }[]>
  >({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Assistants: false,
    Builders: false,
    Carpenters: false,
    Electricians: false,
    Plumbers: false,
    Painters: false,
    'Aluminium Fiters': false,
  });

  const categories = [
    'Assistants',
    'Builders',
    'Carpenters',
    'Electricians',
    'Plumbers',
    'Painters',
    'Aluminium Fiters',
  ];

  const normalize = (s: string) => s.trim().toLowerCase();
  const roleToCategory = (r: string) => {
    const n = normalize(r);
    if (n.includes('assistant')) return 'Assistants';
    if (n.includes('builder')) return 'Builders';
    if (n.includes('carpenter')) return 'Carpenters';
    if (n.includes('electric')) return 'Electricians';
    if (n.includes('plumb')) return 'Plumbers';
    if (n.includes('paint')) return 'Painters';
    if (
      n.includes('aluminium') ||
      n.includes('aluminum') ||
      n.includes('fitter') ||
      n.includes('fiters')
    )
      return 'Aluminium Fiters';
    return 'Assistants';
  };

  const checkAvailability = useCallback(
    async (currentStart: string, currentEnd: string) => {
      setChecking(true);
      try {
        const allIds = employees.map((e) => e.id);
        const result = await checkEmployeeAvailability(
          allIds,
          currentStart,
          currentEnd,
          projectId,
          scheduleItemId ?? undefined
        );
        setBusyEmployees(result.busy);
        setBusyDetails(result.details || {});

        // Auto-expand sections that have conflicts
        if (result.busy.length > 0) {
          const conflictSections: Record<string, boolean> = {};
          for (const emp of employees) {
            if (result.busy.includes(emp.id)) {
              const cat = roleToCategory(emp.role);
              conflictSections[cat] = true;
            }
          }
          setOpenSections((prev) => ({ ...prev, ...conflictSections }));
        }
      } catch (err) {
        console.error('Failed to check availability', err);
      } finally {
        setChecking(false);
        setInitialCheckDone(true);
      }
    },
    [employees, scheduleItemId, projectId]
  );

  // --- One-time availability load when modal opens ---
  useEffect(() => {
    if (!isOpen || !startDate) {
      setChecking(false);
      setInitialCheckDone(true);
      return;
    }
    setChecking(true);
    setInitialCheckDone(false);

    // Use the parent-supplied endDate (or a generous window) for the initial check
    const checkEnd =
      endDate ||
      new Date(new Date(startDate).getTime() + 90 * 24 * 3600_000).toISOString().slice(0, 10);
    checkAvailability(startDate, checkEnd);
  }, [isOpen, startDate, endDate, checkAvailability]);

  // --- Client-side projected end (no server call) ---
  useEffect(() => {
    if (!isOpen || !startDate) return;
    const duration = calculateDuration(
      {
        title: itemTitle,
        description: itemDescription,
        unit: itemUnit,
        quantity: itemQuantity,
        employeeIds: localSelected,
      },
      productivity
    );
    const end = addWorkingTime(new Date(startDate), duration);
    setProjectedEnd(end.toISOString().slice(0, 10));
  }, [
    isOpen,
    localSelected,
    startDate,
    itemTitle,
    itemDescription,
    itemUnit,
    itemQuantity,
    productivity,
  ]);

  // Reset local state when modal opens
  useEffect(() => {
    if (isOpen) {
      const sortedSelected = [...selectedIds].sort().join(',');
      const sortedLocal = [...localSelected].sort().join(',');
      if (sortedSelected !== sortedLocal) {
        setLocalSelected(selectedIds);
      }
    }
  }, [isOpen, selectedIds]);

  const grouped = React.useMemo(() => {
    const g: Record<string, Employee[]> = {};
    categories.forEach((c) => (g[c] = []));
    employees.forEach((e) => {
      if (e.status && e.status !== 'ACTIVE' && !selectedIds.includes(e.id)) return;
      const c = roleToCategory(e.role);
      (g[c] ||= []).push(e);
    });

    // Sort within categories:
    // 1. Selected + conflict (on top — needs attention)
    // 2. Selected / assigned (no conflict)
    // 3. Available (not selected, not busy)
    // 4. Conflict + not selected (at bottom — can't pick)
    Object.keys(g).forEach((cat) => {
      g[cat].sort((a, b) => {
        const isSelectedA = localSelected.includes(a.id);
        const isBusyA = busyEmployees.includes(a.id);
        const isSelectedB = localSelected.includes(b.id);
        const isBusyB = busyEmployees.includes(b.id);
        const isAssignedA = assignedIds.includes(a.id);
        const isAssignedB = assignedIds.includes(b.id);

        const getScore = (selected: boolean, assigned: boolean, busy: boolean) => {
          if (selected && busy) return 0; // Selected + conflict → top
          if (selected || assigned) return 1; // Selected or assigned → next
          if (!busy) return 2; // Available → middle
          return 3; // Conflict + not selected → bottom
        };

        const scoreA = getScore(isSelectedA, isAssignedA, isBusyA);
        const scoreB = getScore(isSelectedB, isAssignedB, isBusyB);

        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.givenName.localeCompare(b.givenName);
      });
    });
    return g;
  }, [employees, selectedIds, localSelected, assignedIds, busyEmployees]);

  const toggleEmployee = (id: string) => {
    if (checking) return; // Prevent changes while checking

    if (localSelected.includes(id)) {
      setLocalSelected(localSelected.filter((sid) => sid !== id));
    } else {
      // Must not be able to select if busy
      if (busyEmployees.includes(id)) return;
      setLocalSelected([...localSelected, id]);
    }
  };

  // Fetch bookings for calendar view when an employee is expanded
  const toggleCalendar = useCallback(
    async (empId: string) => {
      if (calendarEmpId === empId) {
        setCalendarEmpId(null);
        return;
      }
      setCalendarEmpId(empId);
      if (bookings[empId]) return; // Already fetched

      setLoadingBookings(true);
      try {
        const windowStart = startDate || new Date().toISOString().slice(0, 10);
        const ws = new Date(windowStart);
        const we = new Date(ws);
        we.setDate(we.getDate() + 28); // 4-week window
        const result = await getEmployeeBookings(
          [empId],
          ws.toISOString().slice(0, 10),
          we.toISOString().slice(0, 10),
          projectId
        );
        setBookings((prev) => ({ ...prev, ...result }));
      } catch (err) {
        console.error('Failed to load bookings', err);
      } finally {
        setLoadingBookings(false);
      }
    },
    [calendarEmpId, bookings, startDate, projectId]
  );

  // Mini calendar: generate 4 weeks of dates starting from the task start date
  const renderMiniCalendar = (empId: string) => {
    const empBookings = bookings[empId] ?? [];
    const base = startDate ? new Date(startDate) : new Date();
    // Start from Monday of that week
    const weekStart = new Date(base);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const weeks: Date[][] = [];
    for (let w = 0; w < 4; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(weekStart);
        dt.setDate(dt.getDate() + w * 7 + d);
        week.push(dt);
      }
      weeks.push(week);
    }

    const isBooked = (dt: Date) => {
      const ds = dt.toISOString().slice(0, 10);
      return empBookings.some((b) => ds >= b.start && ds <= b.end);
    };

    const getBookingInfo = (dt: Date) => {
      const ds = dt.toISOString().slice(0, 10);
      return empBookings.find((b) => ds >= b.start && ds <= b.end);
    };

    const isTaskRange = (dt: Date) => {
      if (!startDate) return false;
      const ds = dt.toISOString().slice(0, 10);
      const pe = projectedEnd || endDate;
      return ds >= startDate && pe && ds <= pe;
    };

    const isWeekend = (dt: Date) => dt.getDay() === 0 || dt.getDay() === 6;
    const today = new Date().toISOString().slice(0, 10);

    return (
      <div className="mt-1 mb-2 mx-2 p-2 bg-gray-50 rounded border border-gray-200">
        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          4-Week Availability
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <th key={d} className="text-[8px] font-medium text-gray-400 py-0.5 w-[14.28%]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((dt, di) => {
                  const ds = dt.toISOString().slice(0, 10);
                  const booked = isBooked(dt);
                  const inRange = isTaskRange(dt);
                  const weekend = isWeekend(dt);
                  const isToday = ds === today;
                  const info = booked ? getBookingInfo(dt) : null;
                  return (
                    <td
                      key={di}
                      title={
                        booked && info
                          ? `${info.project}: ${info.task}`
                          : inRange
                            ? 'This task'
                            : ''
                      }
                      className={cn(
                        'text-center text-[9px] py-1 relative',
                        weekend && 'text-gray-300',
                        !weekend && !booked && !inRange && 'text-gray-600',
                        booked && 'bg-red-200 text-red-800 font-bold',
                        !booked && inRange && 'bg-emerald-100 text-emerald-700 font-semibold',
                        isToday && 'ring-1 ring-inset ring-blue-400 rounded'
                      )}
                    >
                      {dt.getDate()}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-3 mt-1.5 text-[8px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 bg-red-200 rounded-sm" /> Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 bg-emerald-100 rounded-sm" /> This task
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 ring-1 ring-blue-400 rounded-sm" /> Today
          </span>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign Employees</h2>
          <button onClick={onClose} title="Close" className="text-gray-500 hover:text-gray-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="flex flex-col gap-1">
            {!startDate && (
              <div className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
                ⚠ Set a start date first to check employee availability and detect conflicts.
              </div>
            )}
            <div className="text-sm text-gray-600">
              {checking ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-gray-500"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Checking availability...
                </span>
              ) : (
                'Select employees by category'
              )}
            </div>
            {projectedEnd && projectedEnd !== endDate && (
              <div className="text-xs font-semibold text-orange-600 animate-pulse">
                Warning: Reducing workers extends task until {projectedEnd}
              </div>
            )}
            {initialCheckDone && busyEmployees.length > 0 && (
              <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
                {busyEmployees.length} employee{busyEmployees.length > 1 ? 's' : ''} unavailable due
                to scheduling conflicts (marked in red below).
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md">
            <div className="divide-y divide-gray-100">
              {categories.map((cat) => {
                const list = grouped[cat] || [];
                const open = openSections[cat];
                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, [cat]: !open })}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm font-semibold text-gray-900">{cat}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {open && (
                      <div className="divide-y divide-gray-100">
                        {list.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">No employees</div>
                        ) : (
                          list.map((emp) => {
                            const isSelected = localSelected.includes(emp.id);
                            const isBusy = busyEmployees.includes(emp.id);
                            const alreadyAssigned = assignedIds.includes(emp.id);
                            const showCalendar = calendarEmpId === emp.id;
                            return (
                              <div key={emp.id}>
                                <label
                                  className={cn(
                                    'flex items-center justify-between px-4 py-3 cursor-pointer transition-colors',
                                    isBusy ? 'bg-gray-100 text-gray-400' : 'hover:bg-gray-50'
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleEmployee(emp.id)}
                                      disabled={checking || (isBusy && !isSelected)}
                                      className={cn(
                                        'h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500',
                                        isBusy && !isSelected && 'opacity-50 cursor-not-allowed'
                                      )}
                                    />
                                    <div>
                                      <p
                                        className={cn(
                                          'text-sm font-medium',
                                          isBusy ? 'text-gray-500' : 'text-gray-900'
                                        )}
                                      >
                                        {emp.givenName} {emp.surname}
                                      </p>
                                      <p className="text-xs text-gray-500">{emp.role}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleCalendar(emp.id);
                                      }}
                                      className={cn(
                                        'p-1 rounded transition-colors',
                                        showCalendar
                                          ? 'bg-blue-100 text-blue-600'
                                          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                                      )}
                                      title="View 4-week availability"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                        />
                                      </svg>
                                    </button>
                                    {alreadyAssigned && (
                                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                        Assigned
                                      </span>
                                    )}
                                    {isBusy && (
                                      <div className="flex flex-col items-end">
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight bg-red-100 text-red-700">
                                          Conflict
                                        </span>
                                        {busyDetails[emp.id] && (
                                          <div className="flex flex-col items-end mt-0.5">
                                            <span className="text-[9px] font-medium text-red-600 whitespace-nowrap leading-none">
                                              {busyDetails[emp.id].conflictProject}
                                            </span>
                                            <span className="text-[8px] text-gray-500 whitespace-nowrap leading-tight">
                                              {busyDetails[emp.id].conflictStart &&
                                                new Date(
                                                  busyDetails[emp.id].conflictStart
                                                ).toLocaleDateString([], {
                                                  month: 'short',
                                                  day: 'numeric',
                                                })}
                                              {' - '}
                                              {busyDetails[emp.id].conflictEnd &&
                                                new Date(
                                                  busyDetails[emp.id].conflictEnd
                                                ).toLocaleDateString([], {
                                                  month: 'short',
                                                  day: 'numeric',
                                                })}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </label>
                                {showCalendar &&
                                  (loadingBookings ? (
                                    <div className="px-4 py-2 text-xs text-gray-500">
                                      Loading schedule...
                                    </div>
                                  ) : (
                                    renderMiniCalendar(emp.id)
                                  ))}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-3 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!startDate || !projectedEnd) {
                onSave(localSelected);
                onClose();
                return;
              }

              // Final server-side check to catch concurrent assignments
              setChecking(true);
              try {
                const result = await checkEmployeeAvailability(
                  localSelected,
                  startDate,
                  projectedEnd,
                  projectId,
                  scheduleItemId ?? undefined
                );

                if (result.busy.length > 0) {
                  // Update UI to show which users have conflicts — block save
                  setBusyEmployees(result.busy);
                  setBusyDetails(result.details || {});

                  // Auto-expand sections with conflicted employees
                  const conflictSections: Record<string, boolean> = {};
                  for (const emp of employees) {
                    if (result.busy.includes(emp.id)) {
                      const cat = roleToCategory(emp.role);
                      conflictSections[cat] = true;
                    }
                  }
                  setOpenSections((prev) => ({ ...prev, ...conflictSections }));
                  setChecking(false);
                  return; // Don't save — user must deselect conflicted employees first
                }

                onSave(localSelected);
                onClose();
              } catch (err) {
                console.error('Save-time conflict check failed', err);
                onSave(localSelected);
                onClose();
              } finally {
                setChecking(false);
              }
            }}
            disabled={checking}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors',
              checking ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
            )}
          >
            Save Assignments
          </button>
        </div>
      </div>
    </div>
  );
}
