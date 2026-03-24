import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUsers } from './actions';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'ADMIN') redirect('/dashboard');

  const users = await getUsers();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <UsersClient users={users} />
    </div>
  );
}
