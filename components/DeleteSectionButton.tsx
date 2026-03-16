'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { TrashIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { deleteQuoteSection } from '@/app/(protected)/quotes/[quoteId]/actions';

interface Props {
  quoteId: string;
  section: string;
  itemType: 'MATERIAL' | 'LABOUR';
  label: string;
}

export default function DeleteSectionButton({ quoteId, section, itemType, label }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteQuoteSection(quoteId, section, itemType);
      if (result && !result.ok) alert(result.error);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
        title={`Delete section: ${label}`}
      >
        <TrashIcon className="h-5 w-5" />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-800 max-w-md w-full"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Section</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Are you sure you want to delete the entire{' '}
            <span className="font-bold text-gray-900 dark:text-white">{label}</span> section? All
            line items in this section will be permanently removed. This action cannot be undone.
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Deleting…' : 'Delete Section'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
