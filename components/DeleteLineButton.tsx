'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteQuoteLine } from '@/app/(protected)/quotes/[quoteId]/actions';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function DeleteLineButton({ quoteId, lineId }: { quoteId: string; lineId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function confirmDelete() {
    setOpen(false);
    setPendingDelete(true);
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await deleteQuoteLine(quoteId, lineId);
        setPendingDelete(false);
        timerRef.current = null;
        if (!result.ok) alert(result.error);
      });
    }, 6000);
  }

  function undoDelete() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPendingDelete(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={pending || pendingDelete}
        title="Delete line item"
        className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors p-1"
        onClick={() => setOpen(true)}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      {pendingDelete && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-red-800 dark:bg-gray-900">
          <span className="text-gray-700 dark:text-gray-200">Line item will be deleted in a few seconds.</span>
          <button type="button" onClick={undoDelete} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Undo
          </button>
        </div>
      )}
      <ConfirmDialog
        open={open}
        title="Delete Line Item"
        message="Are you sure you want to delete this line item? You will have a few seconds to undo before it is removed."
        onCancel={() => setOpen(false)}
        onConfirm={confirmDelete}
        busy={pending}
      />
    </>
  );
}
