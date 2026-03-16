'use client';

import { PlusIcon } from '@heroicons/react/24/outline';
import { useState, useTransition } from 'react';
import { addQuoteLineItem } from '@/app/(protected)/quotes/[quoteId]/actions';

export default function AddLineForm({ quoteId, section }: { quoteId: string; section: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [itemType, setItemType] = useState('MATERIAL');

  function reset() {
    setDescription('');
    setUnit('');
    setQty('');
    setRate('');
    setItemType('MATERIAL');
    setOpen(false);
  }

  function handleSubmit() {
    const q = parseFloat(qty);
    const r = parseFloat(rate);
    if (!description.trim()) return alert('Description is required');
    if (!Number.isFinite(q) || q <= 0) return alert('Quantity must be a positive number');
    if (!Number.isFinite(r) || r < 0) return alert('Rate must be a non-negative number');

    startTransition(async () => {
      const result = await addQuoteLineItem(quoteId, {
        description: description.trim(),
        quantity: q,
        unitRate: r,
        unit: unit.trim() || 'ea',
        section,
        itemType,
      });
      if (!result.ok) {
        alert(result.error);
      } else {
        reset();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Add Item
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-4">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-0.5">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder="Item description"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-0.5">
            Unit
          </label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder="ea"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-0.5">
            Qty
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-0.5">
            Rate
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-0.5">
            Type
          </label>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            aria-label="Item type"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="MATERIAL">Material</option>
            <option value="LABOUR">Labour</option>
          </select>
        </div>
        <div className="col-span-2 flex gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pending ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
