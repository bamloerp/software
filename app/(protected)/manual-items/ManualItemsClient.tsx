'use client';

import { useMemo, useState, useTransition } from 'react';
import { PlusIcon, TrashIcon, PencilSquareIcon } from '@heroicons/react/24/outline';

import type { ManualCatalogItem } from '@/lib/manualItemCatalogShared';
import { deleteManualCatalogItem, upsertManualCatalogItem } from './actions';

type Draft = Omit<ManualCatalogItem, 'id'> & { id?: string };

const emptyDraft = (section: string): Draft => ({
  description: '',
  unit: 'ea',
  quantity: 1,
  rate: 0,
  section,
  category: 'GENERAL',
  itemType: 'MATERIAL',
});

export default function ManualItemsClient({
  initialItems,
  sections,
  categories,
}: {
  initialItems: ManualCatalogItem[];
  sections: string[];
  categories: string[];
}) {
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState<Draft>(emptyDraft(sections[0] ?? 'FOUNDATIONS'));
  const [customSection, setCustomSection] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSections = useMemo(() => {
    const set = new Set([...sections, ...items.map((item) => item.section)].filter(Boolean));
    return Array.from(set).sort();
  }, [items, sections]);

  const allCategories = useMemo(() => {
    const set = new Set([...categories, ...items.map((item) => item.category), 'GENERAL'].filter(Boolean));
    return Array.from(set).sort();
  }, [categories, items]);

  const grouped = useMemo(() => {
    const map = new Map<string, ManualCatalogItem[]>();
    for (const item of items) {
      const key = `${item.category} / ${item.section}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const selectedSection = draft.section === 'OTHER' ? customSection : draft.section;
  const selectedCategory = draft.category === 'OTHER' ? customCategory : draft.category;

  function resetForm(section = draft.section) {
    setDraft(emptyDraft(section || allSections[0] || 'FOUNDATIONS'));
    setCustomSection('');
    setCustomCategory('');
  }

  function editItem(item: ManualCatalogItem) {
    setDraft(item);
    setCustomSection('');
    setCustomCategory('');
    setFeedback(null);
  }

  function saveItem() {
    const payload = {
      ...draft,
      section: (selectedSection || 'OTHER').trim().toUpperCase(),
      category: (selectedCategory || 'GENERAL').trim().toUpperCase(),
      quantity: Number(draft.quantity) || 0,
      rate: Number(draft.rate) || 0,
    };

    startTransition(async () => {
      const result = await upsertManualCatalogItem(payload);
      if (!result.ok || !result.data) {
        setFeedback(result.ok ? 'Failed to save item' : result.error);
        return;
      }
      setItems((current) => {
        const exists = current.some((item) => item.id === result.data!.id);
        return exists
          ? current.map((item) => (item.id === result.data!.id ? result.data! : item))
          : [...current, result.data!];
      });
      setFeedback('Manual item saved and added to rates');
      resetForm(payload.section);
      setTimeout(() => setFeedback(null), 2500);
    });
  }

  function removeItem(id: string) {
    if (!confirm('Delete this manual catalog item? Existing quotes will not be changed.')) return;
    startTransition(async () => {
      const result = await deleteManualCatalogItem(id);
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
      setFeedback('Manual item deleted');
      setTimeout(() => setFeedback(null), 2500);
    });
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${feedback.includes('saved') || feedback.includes('deleted') ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
          {feedback}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Manual Item Catalog</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Saved items become pickable on new quotation manual items and appear under Rates.</p>
          </div>
          {draft.id && (
            <button type="button" onClick={() => resetForm()} className="rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              New Item
            </button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_0.6fr_0.6fr_0.6fr_1fr_1fr_0.8fr_auto] lg:items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Description</label>
            <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white" placeholder="e.g. Cement" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Unit</label>
            <input value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white" placeholder="bags" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Qty</label>
            <input type="number" min="0" step="0.01" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: Number(e.target.value) }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Rate</label>
            <input type="number" min="0" step="0.01" value={draft.rate} onChange={(e) => setDraft((d) => ({ ...d, rate: Number(e.target.value) }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Section</label>
            <select title="Section" value={draft.section} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white">
              {allSections.map((section) => <option key={section} value={section}>{section}</option>)}
              <option value="OTHER">OTHER</option>
            </select>
            {draft.section === 'OTHER' && <input value={customSection} onChange={(e) => setCustomSection(e.target.value)} className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white" placeholder="New section" />}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Category</label>
            <select title="Category" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white">
              {allCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              <option value="OTHER">OTHER</option>
            </select>
            {draft.category === 'OTHER' && <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-white" placeholder="New category" />}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Type</label>
            <select title="Item type" value={draft.itemType} onChange={(e) => setDraft((d) => ({ ...d, itemType: e.target.value as Draft['itemType'] }))} className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white">
              <option value="MATERIAL">MATERIAL</option>
              <option value="LABOUR">LABOUR</option>
            </select>
          </div>
          <button type="button" onClick={saveItem} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            <PlusIcon className="h-4 w-4" />
            {draft.id ? 'Save' : 'Add'}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No manual catalog items yet.</div>
        ) : grouped.map(([label, groupItems]) => (
          <div key={label} className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <h3 className="text-sm font-bold uppercase text-gray-900 dark:text-white">{label}</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {groupItems.map((item) => (
                <div key={item.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_80px_80px_100px_100px_auto] md:items-center">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.description}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Code: manual:{item.id}</div>
                  </div>
                  <div className="text-gray-600 dark:text-gray-300">{item.unit || '-'}</div>
                  <div className="text-gray-600 dark:text-gray-300">Qty {item.quantity}</div>
                  <div className="font-medium text-gray-900 dark:text-white">${item.rate.toFixed(2)}</div>
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{item.itemType}</div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => editItem(item)} className="rounded p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20" title="Edit item"><PencilSquareIcon className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeItem(item.id)} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Delete item"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
