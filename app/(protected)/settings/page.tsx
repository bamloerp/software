import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ force?: string; tab?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me?.id) redirect('/login');

  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: { id: true, name: true, email: true, role: true, office: true, mustChangePassword: true },
  });
  if (!dbUser) redirect('/login');

  const sp = (await searchParams) ?? {};
  const forced = sp.force === '1' || !!dbUser.mustChangePassword;
  const initialTab = sp.tab === 'profile' ? 'profile' : forced ? 'security' : sp.tab === 'security' ? 'security' : 'profile';

  return (
    <SettingsClient
      user={{
        id: dbUser.id,
        name: dbUser.name ?? '',
        email: dbUser.email,
        role: dbUser.role,
        office: dbUser.office ?? '',
      }}
      forced={forced}
      initialTab={initialTab}
    />
  );
}
