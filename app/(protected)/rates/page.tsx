import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getRatesData } from './actions';
import RatesClient from './RatesClient';

export default async function RatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = user.role ?? '';
  if (role !== 'SENIOR_QS' && role !== 'ADMIN') redirect('/dashboard');

  const data = await getRatesData();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Rate Management
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Edit unit rates used when generating new quotes. Changes apply to all future quotes.
      </p>
      <RatesClient sections={data.sections} settings={data.settings} />
    </div>
  );
}
