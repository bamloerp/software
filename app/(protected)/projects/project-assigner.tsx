'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignProjectToManager } from './actions';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface ProjectAssignerProps {
  projectId: string;
  initialAssigneeId?: string | null;
  projectManagers: { id: string; name: string | null; email: string }[];
  variant?: 'card' | 'table';
}

export function ProjectAssigner({ projectId, initialAssigneeId, projectManagers, variant = 'card' }: ProjectAssignerProps) {
  const [selectedId, setSelectedId] = useState(initialAssigneeId || '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAssign = () => {
    if (!selectedId) return;
    
    startTransition(async () => {
      try {
        await assignProjectToManager(projectId, selectedId);
        router.refresh();
      } catch (e: any) {
        alert('Failed to save project assignment: ' + e.message);
      }
    });
  };

  const hasAssignee = !!initialAssigneeId;
  const isChanged = selectedId !== initialAssigneeId;

  if (variant === 'table') {
    return (
      <div className="flex items-center gap-2">
        <select
          title="Project operations officer"
          className="block w-48 rounded-md border-gray-300 py-1.5 text-xs focus:border-green-500 focus:ring-green-500 sm:text-sm"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={isPending}
        >
          <option value="">-- Select Officer --</option>
          {projectManagers.map((pm) => (
            <option key={pm.id} value={pm.id}>
              {pm.name || pm.email}
            </option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={isPending || !selectedId || !isChanged}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
        >
          {isPending ? '...' : hasAssignee ? 'Reassign' : 'Assign'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 bg-white p-4 rounded-xl border border-gray-100 shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 dark:text-gray-400">
        {hasAssignee ? 'Reassign Project Operations Officer' : 'Assign Project Operations Officer'}
      </label>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <select
            title="Project operations officer"
            className="block w-full appearance-none rounded-lg border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-green-400 dark:focus:ring-green-400"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={isPending}
          >
            <option value="" className="text-gray-500">-- Select Officer --</option>
            {projectManagers.map((pm) => (
              <option key={pm.id} value={pm.id}>
                {pm.name || pm.email}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
            <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
        <button
          onClick={handleAssign}
          disabled={isPending || !selectedId || !isChanged}
          className="inline-flex w-full justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:ring-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isPending ? 'Saving...' : hasAssignee ? 'Reassign' : 'Assign'}
        </button>
      </div>
    </div>
  );
}
