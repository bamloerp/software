'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { acceptNegotiationItem, rejectNegotiationItem } from '@/app/(protected)/quotes/[quoteId]/actions';

function SubmitButton({
  children,
  className,
  loadingText,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  loadingText?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={clsx(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {pending && (
        <span className="mr-1 h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
      )}
      <span>{pending ? loadingText ?? 'Working...' : children}</span>
    </button>
  );
}

export function NegotiationActionPair({
  itemId,
  initialRate,
  mode = 'rate',
}: {
  itemId: string;
  initialRate?: number;
  mode?: 'rate' | 'delete';
}) {
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [counterRate, setCounterRate] = useState(initialRate !== undefined ? initialRate.toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const disableAll = busy !== null;

  useEffect(() => {
    if (initialRate !== undefined && busy === null) {
      setCounterRate(initialRate.toFixed(2));
    }
  }, [initialRate, busy]);

  const handleError = (message: string) => {
    setError(message);
    setSuccess(null);
  };

  const handleSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {mode === 'rate' && (
          <input
            type="number"
            name="counterRate"
            value={counterRate}
            onChange={(e) => {
              setCounterRate(e.target.value);
              setError(null);
            }}
            step="0.01"
            min="0"
            placeholder="New rate"
            className="w-24 rounded border px-2 py-1 text-right"
          />
        )}

        <form
          action={async () => {
            setBusy('accept');
            setError(null);
            try {
              const result = await acceptNegotiationItem(itemId);
              if (!result?.ok) {
                handleError(result?.error ?? 'Failed to accept item');
              } else {
                handleSuccess('Line accepted');
              }
            } catch (err) {
              handleError(err instanceof Error ? err.message : 'Failed to accept item');
            } finally {
              setBusy(null);
            }
          }}
        >
          <SubmitButton
            className={clsx(
              'shadow-sm transition',
              mode === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700',
            )}
            loadingText={mode === 'delete' ? 'Deleting...' : 'Accepting...'}
            disabled={disableAll}
          >
            {mode === 'delete' ? 'Delete' : 'Accept'}
          </SubmitButton>
        </form>

        <form
          action={async () => {
            setBusy('reject');
            setError(null);
            try {
              const rateValue = Number(counterRate);
              if (mode === 'rate' && (!Number.isFinite(rateValue) || rateValue < 0)) {
                handleError('Enter a valid counter rate');
                return;
              }
              const result = await rejectNegotiationItem(itemId, mode === 'delete' ? undefined : rateValue);
              if (!result?.ok) {
                handleError(result?.error ?? (mode === 'delete' ? 'Failed to keep line' : 'Failed to finalize line'));
              } else {
                handleSuccess(mode === 'delete' ? 'Line kept' : 'Final rate applied');
                if (mode === 'rate') {
                  setCounterRate(rateValue.toFixed(2));
                }
              }
            } catch (err) {
              handleError(err instanceof Error ? err.message : mode === 'delete' ? 'Failed to keep line' : 'Failed to finalize line');
            } finally {
              setBusy(null);
            }
          }}
        >
          <SubmitButton
            className={clsx(
              'shadow-sm transition',
              mode === 'delete' ? 'bg-slate-600 hover:bg-slate-700' : 'bg-red-600 hover:bg-red-700',
            )}
            loadingText={mode === 'delete' ? 'Keeping...' : 'Finalizing...'}
            disabled={disableAll || (mode === 'rate' && counterRate.trim() === '')}
          >
            {mode === 'delete' ? 'Keep' : 'Finalize'}
          </SubmitButton>
        </form>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && !error && <p className="text-xs text-emerald-600">{success}</p>}
    </div>
  );
}
