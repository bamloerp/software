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
          Delete Quotation
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
          title="Delete quotation (admin only)"
          aria-label="Delete quotation"
          className={className ?? 'text-red-600 hover:text-red-800 disabled:opacity-50 p-1'}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}

      <ConfirmDialog
        open={open}
        title="Delete Quotation"
        variant="danger"
        busy={pending}
        onCancel={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={handleConfirm}
        message={
          <>
            Are you sure you want to permanently delete quotation{' '}
            <b>{quoteNumber ?? quoteId}</b>?
            <br />
            <br />
            This will remove <b>everything</b> related to this quote — all line items,
            versions, negotiations, project tasks, schedules, dispatches, purchase orders,
            requisitions, payments, and the linked project (if any). This action{' '}
            <b>cannot be undone</b>.
          </>
        }
      />
    </>
  );
}
