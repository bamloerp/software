'use client';

import { useEffect, useRef } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type Variant = 'danger' | 'warning' | 'info';

interface Props {
  open: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  variant?: Variant;
  yesLabel?: string;
  noLabel?: string;
}

/**
 * Reusable confirmation modal with explicit Yes / No buttons.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  busy = false,
  variant = 'danger',
  yesLabel = 'Yes',
  noLabel = 'No',
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  const yesBtn =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : variant === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700'
        : 'bg-emerald-600 hover:bg-emerald-700';

  return (
    <dialog
      ref={ref}
      onClose={() => onCancel()}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:border-gray-700 dark:bg-gray-800 max-w-md w-full"
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300 mb-6">{message}</div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            {noLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg ${yesBtn} px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors`}
          >
            {busy ? 'Working…' : yesLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
