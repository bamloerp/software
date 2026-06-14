'use client';

import { useState } from 'react';
import { acceptNegotiationStageDeletion } from '@/app/(protected)/quotes/[quoteId]/actions';

export default function NegotiationStageDeleteButton({
  negotiationId,
  section,
  count,
}: {
  negotiationId: string;
  section: string;
  count: number;
}) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async () => {
        setPending(true);
        try {
          const result = await acceptNegotiationStageDeletion(negotiationId, section);
          if (!result.ok) {
            alert(result.error ?? 'Failed to delete stage');
          }
        } finally {
          setPending(false);
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Deleting...' : `Delete ${section} (${count})`}
      </button>
    </form>
  );
}