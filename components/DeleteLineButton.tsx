'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { useTransition } from 'react';
import { deleteQuoteLine } from '@/app/(protected)/quotes/[quoteId]/actions';

export default function DeleteLineButton({ quoteId, lineId }: { quoteId: string; lineId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Delete line item"
      className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors p-1"
      onClick={() => {
        if (!confirm('Are you sure you want to delete this line item?')) return;
        startTransition(async () => {
          const result = await deleteQuoteLine(quoteId, lineId);
          if (!result.ok) {
            alert(result.error);
          }
        });
      }}
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}
