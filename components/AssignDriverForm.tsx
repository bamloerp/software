'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { assignDriverToDispatch } from '@/app/(protected)/dispatches/driver-actions';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { UserIcon, ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

export default function AssignDriverForm({ 
  dispatchId, 
  drivers,
  currentDriverId
}: { 
  dispatchId: string; 
  drivers: { id: string; name: string | null; email: string | null }[];
  currentDriverId?: string | null;
}) {
  const [selectedDriver, setSelectedDriver] = useState(currentDriverId ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleAssign = () => {
    if (!selectedDriver) return;
    startTransition(async () => {
      const res = await assignDriverToDispatch(dispatchId, selectedDriver);
      if (res.redirected && res.nextDispatchId) {
        // Find projectId in params or URL to construct path? 
        // Actually the server action could return the full redirect path or we can find it.
        // Let's assume the router can just handle the dispatch Id redirect if we have a global route /dispatches/[id]
        // But the current page is /projects/[projectId]/dispatches/[dispatchId]
        const currentPath = window.location.pathname;
        const projectPath = currentPath.substring(0, currentPath.lastIndexOf('/dispatches/'));
        router.push(`${projectPath}/dispatches/${res.nextDispatchId}`);
      } else {
        router.push('/dashboard');
      }
    });
  };

  const isReassign = !!currentDriverId;
  const selectedDriverObj = drivers.find(d => d.id === selectedDriver);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
        <div className="relative w-full sm:flex-1" ref={containerRef}>
            <button
                type="button"
                onClick={() => !isPending && setIsOpen(!isOpen)}
                className={clsx(
                    "relative w-full cursor-default rounded-xl bg-white py-3 pl-4 pr-10 text-left shadow-sm ring-1 ring-inset focus:outline-none focus:ring-2 sm:text-sm sm:leading-6 transition-all",
                    isOpen ? "ring-emerald-600" : "ring-gray-300 hover:ring-gray-400",
                    isPending && "opacity-60 cursor-not-allowed bg-gray-50"
                )}
            >
                <span className="flex items-center gap-3 truncate">
                    <div className={clsx("flex h-8 w-8 items-center justify-center rounded-full", selectedDriver ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400")}>
                        <UserIcon className="h-5 w-5" />
                    </div>
                    <span className={clsx("block truncate font-medium", !selectedDriver && "text-gray-500")}>
                        {selectedDriverObj ? (selectedDriverObj.name || selectedDriverObj.email) : 'Select a Driver...'}
                    </span>
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.ul
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.155 }}
                        className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    >
                        {drivers.map((driver) => (
                            <li
                                key={driver.id}
                                className={clsx(
                                    "relative cursor-default select-none py-3 pl-3 pr-9 transition-colors",
                                    driver.id === selectedDriver ? "bg-emerald-50 text-emerald-900" : "text-gray-900 hover:bg-gray-50"
                                )}
                                onClick={() => {
                                    setSelectedDriver(driver.id);
                                    setIsOpen(false);
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={clsx("flex h-8 w-8 items-center justify-center rounded-full", driver.id === selectedDriver ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400")}>
                                        <UserIcon className="h-4 w-4" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={clsx("truncate font-medium", driver.id === selectedDriver && "font-semibold")}>
                                            {driver.name || 'Unknown Name'}
                                        </span>
                                        {driver.email && (
                                            <span className="truncate text-xs text-gray-500">
                                                {driver.email}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {driver.id === selectedDriver && (
                                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-emerald-600">
                                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                )}
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>

        <button
           onClick={handleAssign}
           disabled={!selectedDriver || isPending || (isReassign && selectedDriver === currentDriverId)}
           className={clsx(
             "inline-flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
           )}
        >
          {isPending ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Assigning...
              </>
          ) : isReassign ? 'Reassign & Hand Over' : 'Assign & Hand Over'}
        </button>
    </div>
  );
}
