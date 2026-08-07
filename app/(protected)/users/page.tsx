import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUsers } from './actions';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me || !['ADMIN', 'HUMAN_RESOURCE'].includes(me.role || '')) redirect('/dashboard');

  const users = await getUsers();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <UsersClient users={users} roleOnly={me.role === 'HUMAN_RESOURCE'} />
    </div>
  );
}
