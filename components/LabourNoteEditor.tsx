'use client';

import { useTransition, useState } from 'react';
import { updateLabourNote } from '@/app/(protected)/quotes/[quoteId]/actions';

export default function LabourNoteEditor({
  quoteId,
  lineId,
  defaultNote,
}: {
  quoteId: string;
  lineId: string;
  defaultNote: string;
}) {
  const [note, setNote] = useState(defaultNote);
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);

  function handleSave() {
    if (note === defaultNote) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      await updateLabourNote(quoteId, lineId, note);
      setIsEditing(false);
    });
  }

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="mt-1 cursor-pointer text-xs italic text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        title="Click to edit"
      >
        {note || <span className="text-gray-400">Add labour note…</span>}
      </div>
    );
  }

  return (
    <div className="mt-1">
      <textarea
        autoFocus
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setNote(defaultNote);
            setIsEditing(false);
          }
        }}
        disabled={isPending}
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      />
    </div>
  );
}
