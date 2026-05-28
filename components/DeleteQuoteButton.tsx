'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TrashIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from './ConfirmDialog';
import { deleteQuote } from '@/app/(protected)/quotes/[quoteId]/actions';

interface Props {
  quoteId: string;
  quoteNumber?: string | null;
  /** If true, redirect to /quotes after deletion (use on detail page). */
  redirectAfter?: boolean;
  /** Visual style: icon-only (default) or full button with label. */
  variant?: 'icon' | 'button';
  className?: string;
}

export default function DeleteQuoteButton({
  quoteId,
  quoteNumber,
  redirectAfter = false,
  variant = 'icon',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await deleteQuote(quoteId);
      if (!result.ok) {
        alert(`Failed to delete quotation: ${result.error}`);
        return;
      }
      setOpen(false);
      if (redirectAfter) {
        router.push('/quotes');
      } else {
        router.refresh();
      }
    });
  };

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          className={
            className ??
            'inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50'
          }
        >
          <TrashIcon className="h-4 w-4" />
          Move to Recycle Bin
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          title="Move quotation to recycle bin (admin only)"
          aria-label="Move quotation to recycle bin"
          className={className ?? 'text-red-600 hover:text-red-800 disabled:opacity-50 p-1'}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}

      <ConfirmDialog
        open={open}
        title="Move Quotation to Recycle Bin"
        variant="danger"
        busy={pending}
        onCancel={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={handleConfirm}
        message={
          <>
            Are you sure you want to move quotation{' '}
            <b>{quoteNumber ?? quoteId}</b>?
            <br />
            <br />
            Only quotations without projects can be deleted. This moves the quotation to the
            recycle bin where it can be restored or permanently deleted.
          </>
        }
      />
    </>
  );
}
