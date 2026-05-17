'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { useState, useTransition } from 'react';
import { deleteQuoteLine } from '@/app/(protected)/quotes/[quoteId]/actions';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function DeleteLineButton({ quoteId, lineId }: { quoteId: string; lineId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteQuoteLine(quoteId, lineId);
      setOpen(false);
      if (!result.ok) alert(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title="Delete line item"
        className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors p-1"
        onClick={() => setOpen(true)}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={open}
        title="Delete Line Item"
        message="Are you sure you want to delete this line item?"
        onCancel={() => setOpen(false)}
        onConfirm={confirmDelete}
        busy={pending}
      />
    </>
  );
}
