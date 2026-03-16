'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import EmployeeAssignmentModal from './EmployeeAssignmentModal';
import {
  PlusIcon,
  CalendarIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  XMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

import {
  recalculateRipple,
  ScheduleItemMinimal,
  ProductivitySettings,
} from '@/lib/schedule-engine';
import { batchCheckConflicts } from './actions';
import { rescheduleOverdueTasks } from '../../actions';
import { ProductivitySettingsDialog } from './ProductivitySettingsDialog';
import { useRouter } from 'next/navigation';

type Item = {
  id?: string | null;
  title: string;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  employees?: number | null;
  estHours?: number | null;
  note?: string | null;
  employeeIds?: string[];
  hasConflict?: boolean; // New field for conflict highlight
  conflictNote?: string | null;
};
export default function ScheduleEditor({
  projectId,
  schedule,
  user,
  employees,
  productivity,
}: {
  projectId: string;
  schedule: any | null;
  user: any | null;
  employees: Array<{ id: string; givenName: string; surname?: string | null; role: string }>;
  productivity: ProductivitySettings;
}) {
  /* ... */
  const isDraft = !schedule || schedule.status === 'DRAFT';

  const initItems: Item[] = (schedule?.items ?? []).map((i: any) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    unit: i.unit,
    quantity: i.quantity ?? null,
    plannedStart: i.plannedStart ? new Date(i.plannedStart).toISOString().slice(0, 10) : null,
    plannedEnd: i.plannedEnd ? new Date(i.plannedEnd).toISOString().slice(0, 10) : null,
    employees: i.employees ?? null,
    estHours: i.estHours ?? null,
    note: i.note ?? null,
    employeeIds: Array.isArray(i.assignees) ? i.assignees.map((a: any) => a.id) : [],
    hasConflict: i.hasConflict ?? false,
    conflictNote: i.conflictNote ?? null,
  }));

  const [items, setItems] = useState<Item[]>(initItems);
  const [note, setNote] = useState<string>(schedule?.note ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Auto-scheduling state
  const [projectStartDate, setProjectStartDate] = useState<string>(
    initItems[0]?.plannedStart || new Date().toISOString().slice(0, 10)
  );

  const normalizeUnit = (u: string) => {
    const v = (u ?? '').trim().toLowerCase();
    if (v === 'm2' || v === 'sqm' || v === 'm^2') return 'm²';
    if (v === 'm3' || v === 'cum' || v === 'm^3') return 'm³';
    if (v === 'ft2' || v === 'ft^2') return 'ft²';
    if (v === 'ft3' || v === 'ft^3') return 'ft³';
    return u;
  };
  const [gapMinutes, setGapMinutes] = useState<number>(30);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

  // Bulk assignment state
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const toggleBulkSelect = (idx: number) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };
  const toggleBulkAll = () => {
    if (bulkSelected.size === items.length) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(items.map((_, i) => i)));
    }
  };
  const handleBulkSave = (ids: string[]) => {
    const copy = [...items];
    bulkSelected.forEach((idx) => {
      copy[idx] = { ...copy[idx], employeeIds: ids };
    });
    updateItemsWithSchedule(copy);
    setBulkSelected(new Set());
  };
  // For the bulk modal, union all currently assigned ids across non-selected rows
  const bulkAssignedIds = Array.from(
    new Set(items.filter((_, idx) => !bulkSelected.has(idx)).flatMap((it) => it.employeeIds ?? []))
  );
  // Use the first selected item for context (start dates etc)
  const firstBulkIdx = bulkSelected.size > 0 ? Math.min(...bulkSelected) : 0;

  // Helper: count conflicts per row from batchCheckConflicts result
  const getRowConflictCount = (it: Item) => {
    if (!it.hasConflict) return 0;
    // Count from conflictNote text if available
    return 1;
  };

  // --- Auto-Scheduling Logic ---

  const calculateSchedule = useCallback(
    (currentItems: Item[], startDate = projectStartDate) => {
      if (!startDate) return currentItems;

      // items in Item[] format are compatible with ScheduleItemMinimal
      const result = recalculateRipple(
        currentItems as ScheduleItemMinimal[],
        0, // Start from the beginning
        new Date(startDate),
        gapMinutes,
        productivity
      );

      // Explicitly reset conflict status when re-scheduling
      return (result as Item[]).map((it) => ({
        ...it,
        hasConflict: false,
        conflictNote: null,
      }));
    },
    [projectStartDate, gapMinutes, productivity]
  );

  const checkAllConflicts = useCallback(
    async (currentItems: Item[]) => {
      // Ensure we are checking against the current calculated dates
      const scheduled = calculateSchedule(currentItems);

      setCheckingConflicts(true);
      try {
        const payload = scheduled
          .map((it) => ({
            id: it.id,
            employeeIds: it.employeeIds ?? [],
            plannedStart: it.plannedStart!,
            plannedEnd: it.plannedEnd!,
          }))
          .filter((it) => it.plannedStart && it.plannedEnd);

        const result = await batchCheckConflicts(projectId, payload);
        setItems((prev) =>
          prev.map((it, idx) => {
            const rowId = it.id || `temp-${idx}`;
            const hasConflict = result.conflictIds.includes(rowId);
            return {
              ...it,
              hasConflict,
              conflictNote: hasConflict ? result.details[rowId] : null,
            };
          })
        );
      } catch (err) {
        console.error('Failed to check conflicts', err);
      } finally {
        setCheckingConflicts(false);
      }
    },
    [calculateSchedule]
  );

  // Perform initial ripple if any items are missing dates (e.g. newly extracted)
  useEffect(() => {
    const missingDates = items.some((it) => !it.plannedStart);
    if (missingDates && items.length > 0) {
      console.log('[SCHEDULE_EDITOR] Initializing missing dates via ripple');
      const updated = calculateSchedule(items);
      setItems(updated);
    }
  }, [calculateSchedule, items.length]); // We check items.length to know if items were loaded

  // Automated health check on load
  useEffect(() => {
    const hasDates = items.length > 0 && items.every((it) => it.plannedStart);
    if (hasDates && !checkingConflicts) {
      console.log('[SCHEDULE_EDITOR] Running automated health check');
      checkAllConflicts(items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]); // Run once when items are loaded/ready

  // When project start or gap changes, trigger a full re-ripple
  const handleProjectStartChange = (newDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(newDate);
    selected.setHours(0, 0, 0, 0);
    if (selected < today) {
      setError('Project start date must be today or in the future');
      return;
    }
    setError(null);
    setProjectStartDate(newDate);
    const updated = calculateSchedule(items, newDate);
    setItems(updated);
  };

  const handleGapChange = (newGap: number) => {
    setGapMinutes(newGap);
    // calculateSchedule uses gapMinutes from state, so we pass current items
    // but calculateSchedule itself has a dependency on gapMinutes.
    // To be safe, we use the functional update or force dependencies.
    const updated = recalculateRipple(
      items as ScheduleItemMinimal[],
      0,
      new Date(projectStartDate),
      newGap,
      productivity
    );
    setItems(updated as Item[]);
  };

  const updateItemsWithSchedule = (newItems: Item[]) => {
    const scheduled = calculateSchedule(newItems);
    setItems(scheduled);
  };

  // --- Handlers ---

  function addRow() {
    const newItem: Item = {
      title: '',
      description: '',
      unit: '',
      quantity: null,
      employees: null,
      estHours: null,
      employeeIds: [],
    };
    updateItemsWithSchedule([...items, newItem]);
  }

  function removeRow(idx: number) {
    const copy = [...items];
    copy.splice(idx, 1);
    updateItemsWithSchedule(copy);
  }

  function updateField(idx: number, key: keyof Item, value: any) {
    const copy = [...items];
    (copy[idx] as any)[key] = value;
    updateItemsWithSchedule(copy);
  }

  async function handleSave(activate: boolean = false) {
    setLoading(true);
    setError(null);
    try {
      const status = activate ? 'ACTIVE' : 'DRAFT';
      const res = await fetch(`/api/projects/${projectId}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note, items, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Save failed');

      // Re-run conflict check after save to ensure db state is updated in background
      // though the API already does it, triggering client-side check keeps UI in sync
      await checkAllConflicts(items);

      if (activate && (schedule?.status === 'DRAFT' || !schedule)) {
        window.location.href = '/dashboard';
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  }

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/from-quote`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to extract from quote');

      if (Array.isArray(json.items)) {
        const newItems = json.items.map((i: any) => ({
          id: i.id,
          title: i.title,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          plannedStart: i.plannedStart ? new Date(i.plannedStart).toISOString().slice(0, 10) : null,
          plannedEnd: i.plannedEnd ? new Date(i.plannedEnd).toISOString().slice(0, 10) : null,
          employees: i.employees,
          estHours: i.estHours,
          note: i.note,
          employeeIds: Array.isArray(i.assignees) ? i.assignees.map((a: any) => a.id) : [],
        }));
        // Apply auto-schedule logic to new items
        // We need to call calculateSchedule but it depends on state.
        // Fortunately calculateSchedule is memoized with useCallback.
        // However, calling it here might use stale state references if not careful.
        // But calculateSchedule depends on projectStartDate etc which are in state.
        // We can just setItems(newItems) and let the EXISTING useEffect for auto-scheduling kick in?
        // The existing useEffect runs when 'items' changes.
        // useEffect(() => { const newItems = calculateSchedule(items); ... }, [items])

        setItems(newItems);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to extract schedule');
    } finally {
      setExtracting(false);
    }
  }, [projectId]);

  async function handleReschedule() {
    if (
      !confirm(
        'This will move all overdue tasks (that are not done) to start Tomorrow at 7:00 AM and shift all subsequent tasks accordingly. Continue?'
      )
    )
      return;

    setLoading(true);
    try {
      const result = await rescheduleOverdueTasks(projectId);
      if (result.success) {
        alert(result.message);
        window.location.reload();
      } else {
        alert(result.message || 'Failed');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border mb-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">Project Start Date</label>
            <input
              type="date"
              value={projectStartDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => handleProjectStartChange(e.target.value)}
              className="h-9 rounded-md border border-gray-300 px-3 text-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">Gap (Minutes)</label>
            <input
              type="number"
              value={gapMinutes}
              onChange={(e) => handleGapChange(Number(e.target.value))}
              className="h-9 w-24 rounded-md border border-gray-300 px-3 text-sm focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ProductivitySettingsDialog projectId={projectId} initialSettings={productivity} />

          <button
            onClick={handleReschedule}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-50 transition-colors"
          >
            <ClockIcon className="h-4 w-4" />
            Reschedule Overdue
          </button>

          <button
            onClick={() => checkAllConflicts(items)}
            disabled={checkingConflicts}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors',
              'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200',
              checkingConflicts && 'opacity-50 cursor-not-allowed'
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            {checkingConflicts ? 'Checking Conflicts...' : 'Check Availability'}
          </button>

          {bulkSelected.size > 0 && (
            <button
              onClick={() => {
                // Ensure at least one selected item has a start date
                const hasDate = [...bulkSelected].some((idx) => items[idx]?.plannedStart);
                if (!hasDate) {
                  setError('Set a start date on at least one selected task before bulk assigning.');
                  return;
                }
                setBulkModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Bulk Assign ({bulkSelected.size})
            </button>
          )}

          <button
            onClick={() => setItems([...items, { title: '', quantity: 0, employeeIds: [] }])}
            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            <PlusIcon className="h-4 w-4 text-gray-500" />
            Add Task
          </button>
        </div>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No tasks yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by extracting tasks from a quote or adding them manually.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-green-600 text-white shadow hover:bg-green-700 h-9 px-4 py-2"
            >
              {extracting ? 'Extracting...' : 'Extract from Quote'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm flex flex-col min-h-0">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
            <table className="w-full text-xs border-collapse min-w-[1200px]">
              <thead className="bg-gray-50/50 border-b sticky top-0 z-20">
                <tr>
                  <th className="px-2 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={bulkSelected.size === items.length && items.length > 0}
                      onChange={toggleBulkAll}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      title="Select all for bulk assignment"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-700 w-[25%] min-w-[300px]">
                    Task
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold text-gray-700 w-24 min-w-[96px]">
                    Unit
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold text-gray-700 w-24 min-w-[96px]">
                    Qty
                  </th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-700 w-32 min-w-[128px]">
                    Start (auto)
                  </th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-700 w-32 min-w-[128px]">
                    End (auto)
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold text-gray-700 w-20 min-w-[80px]">
                    Hours
                  </th>
                  <th className="px-3 py-2.5 text-center font-bold text-gray-700 w-40 min-w-[160px]">
                    Workers
                  </th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-700 min-w-[300px]">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it, i) => (
                  <tr
                    key={it.id ?? i}
                    className={cn(
                      'group transition-colors',
                      it.hasConflict ? 'bg-red-50/50 hover:bg-red-100/70' : 'hover:bg-gray-50/50'
                    )}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(i)}
                        onChange={() => toggleBulkSelect(i)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1.5">
                        <input
                          value={it.title}
                          onChange={(e) => updateField(i, 'title', e.target.value)}
                          className={cn(
                            'flex h-8.5 w-full rounded-md border border-gray-200 bg-white shadow-none px-2.5 py-1.5 text-xs transition-shadow focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500',
                            it.hasConflict && 'border-red-300 bg-red-50/30'
                          )}
                          placeholder="Task name"
                        />
                        {it.hasConflict && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-600/20 shadow-sm animate-pulse uppercase tracking-wider">
                              Conflict
                            </span>
                            <span className="text-[10px] text-red-500 font-medium truncate max-w-[140px]">
                              {it.conflictNote}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!it.plannedStart) return;
                                const d = new Date(it.plannedStart);
                                d.setDate(d.getDate() + 1);
                                // Skip weekends
                                while (d.getDay() === 0 || d.getDay() === 6)
                                  d.setDate(d.getDate() + 1);
                                const copy = [...items];
                                copy[i] = {
                                  ...copy[i],
                                  plannedStart: d.toISOString().slice(0, 10),
                                  hasConflict: false,
                                  conflictNote: null,
                                };
                                updateItemsWithSchedule(copy);
                              }}
                              className="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700 hover:bg-orange-200 transition-colors whitespace-nowrap"
                              title="Shift this task start date forward by 1 working day and re-calculate schedule"
                            >
                              Shift +1 day
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const copy = [...items];
                                copy[i] = {
                                  ...copy[i],
                                  employeeIds: [],
                                  hasConflict: false,
                                  conflictNote: null,
                                };
                                updateItemsWithSchedule(copy);
                              }}
                              className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-600 hover:bg-gray-200 transition-colors whitespace-nowrap"
                              title="Remove all assigned employees from this task"
                            >
                              Unassign
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={it.unit || ''}
                        onChange={(e) => updateField(i, 'unit', e.target.value)}
                        onBlur={(e) => updateField(i, 'unit', normalizeUnit(e.target.value))}
                        placeholder="Unit"
                        className="flex h-8.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-center font-bold tracking-tight shadow-none transition-shadow focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={it.quantity ?? ''}
                        onChange={(e) => updateField(i, 'quantity', Number(e.target.value))}
                        className="flex h-8.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-center font-bold shadow-none transition-shadow focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex h-8.5 w-full items-center justify-center rounded-md border border-gray-100 bg-gray-50/50 px-2 text-xs text-gray-600 font-medium">
                        {it.plannedStart || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex h-8.5 w-full items-center justify-center rounded-md border border-gray-100 bg-gray-50/50 px-2 text-xs text-gray-600 font-medium">
                        {it.plannedEnd || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-semibold text-gray-900">
                        {it.estHours || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {it.plannedStart ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRowIndex(i);
                            setModalOpen(true);
                          }}
                          className={cn(
                            'inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all shadow-sm relative',
                            it.hasConflict
                              ? 'bg-red-600 text-white hover:bg-red-700 ring-2 ring-red-300'
                              : it.employeeIds && it.employeeIds.length > 0
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                          )}
                        >
                          {it.employeeIds && it.employeeIds.length > 0 ? (
                            <>
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              {it.employeeIds.length} Assigned
                            </>
                          ) : (
                            'Select Team'
                          )}
                          {it.hasConflict && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-2 ring-white">
                              !
                            </span>
                          )}
                        </button>
                      ) : (
                        <span
                          className="inline-flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[10px] text-gray-400 bg-gray-50 border border-dashed border-gray-200 cursor-not-allowed"
                          title="Set a start date first"
                        >
                          Set date first
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative group/note">
                        <PencilSquareIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-hover/note:text-gray-500" />
                        <input
                          value={it.note ?? ''}
                          onChange={(e) => updateField(i, 'note', e.target.value)}
                          placeholder="Add task note..."
                          className={cn(
                            'flex h-8.5 w-full rounded-md border bg-white pl-9 pr-8 text-xs transition-all',
                            it.note && it.note.trim().length > 0
                              ? 'border-emerald-200 bg-emerald-50/30 ring-1 ring-emerald-100/50'
                              : 'border-gray-200 hover:border-gray-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                          )}
                        />
                        {it.note && it.note.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={() => updateField(i, 'note', '')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Controls */}
          <div className="border-t bg-gray-50 p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Schedule Note</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Schedule note (optional)"
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
              >
                <DocumentTextIcon className="h-4 w-4" />
                {loading ? 'Saving...' : 'Save Draft'}
              </button>

              {(schedule?.status === 'DRAFT' || !schedule) && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-green-600 text-white shadow hover:bg-green-700 h-9 px-4 py-2"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {loading ? 'Activating...' : 'Create Schedule'}
                </button>
              )}

              {schedule?.status === 'ACTIVE' && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-barmlo-blue text-white shadow hover:bg-barmlo-blue/90 h-9 px-4 py-2"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div className="text-sm font-medium text-destructive">{error}</div>}

      {/* Employee Assignment Modal */}
      {modalOpen && activeRowIndex !== null && (
        <EmployeeAssignmentModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setActiveRowIndex(null);
          }}
          employees={employees}
          selectedIds={items[activeRowIndex!]?.employeeIds ?? []}
          onSave={(ids) => updateField(activeRowIndex!, 'employeeIds', ids)}
          startDate={items[activeRowIndex!]?.plannedStart ?? null}
          endDate={items[activeRowIndex!]?.plannedEnd ?? null}
          scheduleItemId={items[activeRowIndex!]?.id ?? null}
          projectId={projectId}
          assignedIds={Array.from(
            new Set(
              items.filter((_, idx) => idx !== activeRowIndex).flatMap((it) => it.employeeIds ?? [])
            )
          )}
          productivity={productivity}
          itemQuantity={items[activeRowIndex!]?.quantity ?? 0}
          itemUnit={items[activeRowIndex!]?.unit ?? null}
          itemTitle={items[activeRowIndex!]?.title ?? ''}
          itemDescription={items[activeRowIndex!]?.description ?? null}
        />
      )}

      {/* Bulk Assignment Modal */}
      {bulkModalOpen && bulkSelected.size > 0 && (
        <EmployeeAssignmentModal
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          employees={employees}
          selectedIds={items[firstBulkIdx]?.employeeIds ?? []}
          onSave={(ids) => {
            handleBulkSave(ids);
            setBulkModalOpen(false);
          }}
          startDate={items[firstBulkIdx]?.plannedStart ?? null}
          endDate={items[firstBulkIdx]?.plannedEnd ?? null}
          scheduleItemId={items[firstBulkIdx]?.id ?? null}
          projectId={projectId}
          assignedIds={bulkAssignedIds}
          productivity={productivity}
          itemQuantity={items[firstBulkIdx]?.quantity ?? 0}
          itemUnit={items[firstBulkIdx]?.unit ?? null}
          itemTitle={`Bulk: ${bulkSelected.size} tasks`}
          itemDescription={null}
        />
      )}
    </div>
  );
}
