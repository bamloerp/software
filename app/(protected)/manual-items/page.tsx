import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { getManualCatalog } from '@/lib/manualItemCatalog';
import { QUOTE_LINE_MAP } from '@/lib/quoteMap';
import ManualItemsClient from './ManualItemsClient';

export default async function ManualItemsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'SENIOR_QS' && user.role !== 'ADMIN') redirect('/dashboard');

  const catalog = await getManualCatalog();
  const sections = Array.from(new Set([
    ...QUOTE_LINE_MAP.map((item) => item.section || 'OTHER'),
    ...catalog.map((item) => item.section),
    'FOUNDATIONS',
    'PRELIMINARIES',
    'LABOUR',
  ].filter(Boolean))).sort();
  const categories = Array.from(new Set([
    ...catalog.map((item) => item.category),
    'GENERAL',
    'MATERIALS',
    'LABOUR',
  ].filter(Boolean))).sort();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manual Items</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add reusable manual quotation items. Saved items appear on new quote manual rows and in Rates for future price changes.
        </p>
      </div>
      <ManualItemsClient initialItems={catalog} sections={sections} categories={categories} />
    </div>
  );
}
