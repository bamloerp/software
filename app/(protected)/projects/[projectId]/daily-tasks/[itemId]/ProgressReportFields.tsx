'use client';

import { useState } from 'react';

export default function ProgressReportFields({
  remainingBefore,
  unit,
  currentStatus,
}: {
  remainingBefore: number;
  unit?: string | null;
  currentStatus: string;
}) {
  const [completedToday, setCompletedToday] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus === 'ON_HOLD' ? 'ON_HOLD' : 'ACTIVE');
  const remainingAfter = Math.max(0, remainingBefore - completedToday);
  const isComplete = remainingAfter <= 0.000001;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="usedQty" className="mb-2 block text-sm font-medium text-gray-700">
            Quantity Completed Today <span className="text-red-500">*</span>
          </label>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              id="usedQty"
              name="usedQty"
              step="0.01"
              min="0"
              max={remainingBefore}
              required
              value={completedToday || ''}
              onChange={(event) => {
                const value = Number(event.target.value || 0);
                setCompletedToday(Math.min(remainingBefore, Math.max(0, value)));
              }}
              className="block w-full rounded-lg border-gray-200 bg-gray-50 px-4 py-3 text-sm transition-colors focus:border-indigo-500 focus:bg-white focus:ring-indigo-500"
              placeholder="0.00"
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <span className="text-gray-500 sm:text-sm">{unit}</span>
            </div>
          </div>
          <input type="hidden" name="usedUnit" value={unit || ''} />
        </div>

        <div>
          <label htmlFor="remainingQty" className="mb-2 block text-sm font-medium text-gray-700">
            Remaining After This Report
          </label>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              id="remainingQty"
              name="remainingQty"
              step="0.01"
              min="0"
              value={Number(remainingAfter.toFixed(2))}
              readOnly
              className="block w-full rounded-lg border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700"
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <span className="text-gray-500 sm:text-sm">{unit}</span>
            </div>
          </div>
          <input type="hidden" name="remainingUnit" value={unit || ''} />
        </div>
      </div>

      <div>
        <label htmlFor="status" className="mb-2 block text-sm font-medium text-gray-700">
          Update Task Status
        </label>
        <select
          id="status"
          name="status"
          value={isComplete ? 'DONE' : selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
          className="block w-full rounded-lg border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-indigo-500 focus:bg-white focus:ring-indigo-500"
        >
          {isComplete ? (
            <option value="DONE">Done - Task completed</option>
          ) : (
            <>
              <option value="ACTIVE">Active - Work continuing</option>
              <option value="ON_HOLD">On Hold - Temporarily stopped</option>
            </>
          )}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          {isComplete
            ? 'Remaining work is zero, so Done is the only available status.'
            : 'Done becomes available only when completed equals planned and remaining is zero.'}
        </p>
      </div>
    </>
  );
}
