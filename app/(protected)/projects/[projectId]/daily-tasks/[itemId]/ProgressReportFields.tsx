'use client';

export default function ProgressReportFields({
  remainingBefore,
  unit,
  currentStatus,
}: {
  remainingBefore: number;
  unit?: string | null;
  currentStatus: string;
}) {
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
              required
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
              defaultValue={remainingBefore}
              className="block w-full rounded-lg border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 focus:border-indigo-500 focus:bg-white focus:ring-indigo-500"
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
          defaultValue={currentStatus === 'DONE' ? 'ACTIVE' : currentStatus}
          className="block w-full rounded-lg border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-indigo-500 focus:bg-white focus:ring-indigo-500"
        >
          <option value="ACTIVE">Active - Work continuing</option>
          <option value="ON_HOLD">On Hold - Temporarily stopped</option>
          <option value="DONE">Done - Task completed</option>
        </select>
        <p className="mt-2 text-xs text-gray-500">
          Completed work may be lower or higher than the planned quantity. Select Done when the task is finished.
        </p>
      </div>
    </>
  );
}
