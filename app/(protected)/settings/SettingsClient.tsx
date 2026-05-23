'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { updateProfile, changeOwnPassword } from './actions';

type Tab = 'profile' | 'security';

export default function SettingsClient({
  user,
  forced,
  initialTab,
}: {
  user: { id: string; name: string; email: string; role?: string; office?: string };
  forced: boolean;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const router = useRouter();

  // Profile state
  const [name, setName] = useState(user.name);
  const [pending, startTransition] = useTransition();

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwPending, startPwTransition] = useTransition();

  function onProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfile({ name });
      if (res.ok) {
        toast.success('Profile updated');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    startPwTransition(async () => {
      const res = await changeOwnPassword({ currentPassword, newPassword, confirmPassword });
      if (res.ok) {
        toast.success('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        if (forced) {
          // Force a fresh sign-in so JWT mustChangePassword clears cleanly
          setTimeout(() => {
            void signOut({ redirect: false }).then(() => {
              window.location.replace(`/login?reason=password-changed&t=${Date.now()}`);
            });
          }, 600);
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Account Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your profile information and security.</p>

      {forced && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
          <strong>Password change required.</strong> Your administrator reset your password. You must
          set a new password before continuing.
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            disabled={forced}
            onClick={() => setTab('profile')}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              tab === 'profile'
                ? 'border-barmlo-blue text-barmlo-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            } ${forced ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            Profile
          </button>
          <button
            type="button"
            onClick={() => setTab('security')}
            className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              tab === 'security'
                ? 'border-barmlo-blue text-barmlo-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            Security
          </button>
        </nav>
      </div>

      {/* Profile tab */}
      {tab === 'profile' && !forced && (
        <form onSubmit={onProfileSubmit} className="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-barmlo-blue focus:ring-1 focus:ring-barmlo-blue dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-900/50"
            />
            <p className="mt-1 text-xs text-gray-500">Contact an administrator to change your email.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
              <input
                type="text"
                value={user.role ?? ''}
                disabled
                className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-900/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Office</label>
              <input
                type="text"
                value={user.office ?? ''}
                disabled
                className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-900/50"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending || name === user.name}
              className="rounded-md bg-barmlo-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-barmlo-blue/90 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {/* Security tab */}
      {tab === 'security' && (
        <form onSubmit={onPasswordSubmit} className="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current password</label>
            <input
              type="password"
              name="profile-current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-barmlo-blue focus:ring-1 focus:ring-barmlo-blue dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New password</label>
            <input
              type="password"
              name="profile-new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-barmlo-blue focus:ring-1 focus:ring-barmlo-blue dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">At least 8 characters. Use a mix of letters, numbers and symbols.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm new password</label>
            <input
              type="password"
              name="profile-confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-barmlo-blue focus:ring-1 focus:ring-barmlo-blue dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwPending || !currentPassword || !newPassword || newPassword !== confirmPassword}
              className="rounded-md bg-barmlo-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-barmlo-blue/90 disabled:opacity-50"
            >
              {pwPending ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
