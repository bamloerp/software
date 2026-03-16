'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const STATUSES = ['ALL', 'DRAFT', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED', 'PURCHASED', 'PARTIAL', 'RECEIVED', 'COMPLETED'];

export default function MyPOsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'ALL');
  const [pageSize, setPageSize] = useState(searchParams.get('pageSize') ?? '20');

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '');
    setStatus(searchParams.get('status') ?? 'ALL');
    setPageSize(searchParams.get('pageSize') ?? '20');
  }, [searchParams]);

  const applyFilters = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    const values = { q: search, status, pageSize, ...overrides };

    if (values.q) params.set('q', values.q);
    else params.delete('q');

    if (values.status && values.status !== 'ALL') params.set('status', values.status);
    else params.delete('status');

    if (values.pageSize) params.set('pageSize', values.pageSize);
    else params.delete('pageSize');

    params.set('page', '1');

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleReset = () => {
    setSearch('');
    setStatus('ALL');
    setPageSize('20');
    startTransition(() => {
      router.push(pathname);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 p-2 dark:bg-gray-800 border border-blue-100 dark:border-gray-700 mb-4">
      <div className="flex items-center gap-2">
        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm dark:bg-blue-500">Show</span>
        <select
          value={pageSize}
          title="Page size"
          onChange={(e) => {
            setPageSize(e.target.value);
            applyFilters({ pageSize: e.target.value });
          }}
          className="rounded border-gray-300 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 shadow-sm"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm dark:bg-blue-500">Status</span>
        <select
          value={status}
          title="Filter by status"
          onChange={(e) => {
            setStatus(e.target.value);
            applyFilters({ status: e.target.value });
          }}
          className="rounded border-gray-300 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 shadow-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 items-center gap-2 min-w-[200px]">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            placeholder="Search PO, vendor, project..."
            className="block w-full rounded border-gray-300 py-1.5 pl-10 pr-3 text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white shadow-sm"
          />
        </div>
        <button
          onClick={() => applyFilters()}
          disabled={isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors dark:bg-blue-500 dark:hover:bg-blue-600 shadow-sm"
        >
          {isPending ? 'Loading...' : 'Search'}
        </button>
        <button
          onClick={handleReset}
          disabled={isPending}
          title="Reset filters"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 shadow-sm"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
