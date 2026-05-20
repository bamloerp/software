'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function QuoteTableToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [pageSize, setPageSize] = useState(searchParams.get('limit') ?? '20');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  // Sync state with URL params if they change externally (e.g. back button)
  useEffect(() => {
    setPageSize(searchParams.get('limit') ?? '20');
    setStatus(searchParams.get('status') ?? '');
    setSearch(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set('q', search);
    else params.delete('q');
    
    if (status) params.set('status', status);
    else params.delete('status');

    if (pageSize) params.set('limit', pageSize);
    else params.delete('limit');

    params.set('page', '1'); // Reset to page 1

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleReset = () => {
    setSearch('');
    setStatus('');
    setPageSize('20');
    const params = new URLSearchParams();
    const view = searchParams.get('view');
    const review = searchParams.get('review');
    if (view) params.set('view', view);
    if (review) params.set('review', review);
    startTransition(() => {
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-blue-50 p-2 dark:bg-gray-800 border border-blue-100 dark:border-gray-700 mb-4">
      <div className="flex items-center gap-2">
         <span className="bg-barmlo-blue text-white px-2 py-1 rounded text-xs font-bold shadow-sm">Show</span>
         <select
          title="Rows per page"
            value={pageSize}
            onChange={(e) => {
                setPageSize(e.target.value);
                // Trigger search immediately on page size change? Usually yes.
                const params = new URLSearchParams(searchParams.toString());
                params.set('limit', e.target.value);
                params.set('page', '1');
                startTransition(() => {
                    router.push(`${pathname}?${params.toString()}`);
                });
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
         <span className="bg-barmlo-blue text-white px-2 py-1 rounded text-xs font-bold shadow-sm">Status</span>
         <select
          title="Filter by status"
            value={status}
            onChange={(e) => {
                setStatus(e.target.value);
                // Trigger immediately? Impazamon screenshot has a "Search" button, but immediate is better UX. 
                // I'll stick to the "Search" button for consistency with the screenshot if desired, but standard web UX prefers immediate filters.
                // Screenshot shows "Search" button at the end. I'll make the select just update state, but maybe user expects immediate update. 
                // I'll stick to the manual "Search" button as implied by the screenshot layout (inputs then search button).
            }}
            className="rounded border-gray-300 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 min-w-[150px] shadow-sm"
         >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED_REVIEW">Submitted Review</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="NEGOTIATION">Negotiation</option>
            <option value="NEGOTIATION_REVIEW">Negotiation Review</option>
            <option value="FINALIZED">Finalized</option>
            <option value="ARCHIVED">Archived</option>
         </select>
      </div>

      <div className="flex items-center gap-2">
         <span className="bg-barmlo-blue text-white px-2 py-1 rounded text-xs font-bold shadow-sm">Age</span>
         <select
          title="Filter by age"
            disabled
            className="rounded border-gray-300 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 shadow-sm bg-gray-100 text-gray-400 cursor-not-allowed"
         >
            <option value="">All</option>
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
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search all records"
                className="block w-full rounded border-gray-300 pl-10 py-1 text-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 shadow-sm"
            />
        </div>
        <button
            onClick={handleSearch}
            disabled={isPending}
            className="flex items-center gap-1 rounded bg-barmlo-blue/10 px-3 py-1 text-sm font-bold text-barmlo-blue hover:bg-barmlo-blue/20 dark:bg-blue-900/50 dark:text-blue-300 shadow-sm border border-barmlo-blue/20 dark:border-blue-800"
        >
            <MagnifyingGlassIcon className="h-4 w-4" />
            Search
        </button>
        <button
            onClick={handleReset}
            disabled={isPending}
            className="flex items-center gap-1 rounded bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-barmlo-orange/10 dark:bg-gray-700 dark:text-gray-300 shadow-sm border border-barmlo-orange dark:border-gray-600 hover:text-barmlo-orange transition-colors"
        >
            <ArrowPathIcon className="h-4 w-4 text-barmlo-orange" />
            Reset
        </button>
      </div>
    </div>
  );
}
