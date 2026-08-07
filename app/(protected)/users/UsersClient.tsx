'use client';

import { useState, useTransition, useMemo, useEffect, useRef } from 'react';
import {
  createUser,
  toggleUserDisabled,
  resetUserPassword,
  unlockUser,
  changeUserRole,
  updateUser,
} from './actions';
import { USER_ROLES } from '@/lib/workflow';
import { DEFAULT_OFFICE, OFFICE_OPTIONS, isOfficeOption } from '@/lib/office';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  office: string | null;
  disabled: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/* ── helpers ──────────────────────────────────────────────── */

function timeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600',
  'bg-amber-600', 'bg-cyan-600', 'bg-fuchsia-600', 'bg-teal-600',
  'bg-indigo-600', 'bg-orange-600', 'bg-sky-600', 'bg-pink-600',
];
function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ── icons (inline SVG) ──────────────────────────────────── */

function IconSearch() {
  return (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}
function IconBan() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
function IconX() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function IconDots() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconKey() {
  return (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}
function IconUnlock() {
  return (
    <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

/* ── component ───────────────────────────────────────────── */

export default function UsersClient({ users: initialUsers, roleOnly = false }: { users: UserRow[]; roleOnly?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'disabled' | 'locked'>('');
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editRoleFor, setEditRoleFor] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [editUserFor, setEditUserFor] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; office: string }>({ name: '', email: '', office: DEFAULT_OFFICE });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Add form state
  const [form, setForm] = useState({ name: '', email: '', role: 'QS', office: DEFAULT_OFFICE, password: '' });

  // Stats
  const stats = useMemo(() => {
    const active = initialUsers.filter(u => !u.disabled).length;
    const disabled = initialUsers.filter(u => u.disabled).length;
    const locked = initialUsers.filter(u => u.lockedUntil && new Date(u.lockedUntil) > new Date()).length;
    return { total: initialUsers.length, active, disabled, locked };
  }, [initialUsers]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  // Keyboard shortcut: Ctrl+K focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function flash(type: 'success' | 'error', message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createUser(form);
      if (!res.ok) {
        flash('error', res.error);
      } else {
        flash('success', 'User created successfully');
        setForm({ name: '', email: '', role: 'QS', office: DEFAULT_OFFICE, password: '' });
        setShowAddModal(false);
      }
    });
  }

  function handleToggleDisabled(userId: string, disabled: boolean) {
    startTransition(async () => {
      const res = await toggleUserDisabled(userId, disabled);
      if (!res.ok) flash('error', res.error);
      else flash('success', disabled ? 'User account disabled' : 'User account enabled');
    });
  }

  function handleResetPassword(userId: string) {
    if (newPassword.length < 6) {
      flash('error', 'Password must be at least 6 characters');
      return;
    }
    startTransition(async () => {
      const res = await resetUserPassword(userId, newPassword);
      if (!res.ok) flash('error', res.error);
      else {
        flash('success', 'Password reset successfully');
        setResetPasswordFor(null);
        setNewPassword('');
      }
    });
  }

  function handleUnlock(userId: string) {
    startTransition(async () => {
      const res = await unlockUser(userId);
      if (!res.ok) flash('error', res.error);
      else flash('success', 'User unlocked');
    });
  }

  function handleChangeRole(userId: string) {
    startTransition(async () => {
      const res = await changeUserRole(userId, selectedRole);
      if (!res.ok) flash('error', res.error);
      else {
        flash('success', 'Role updated');
        setEditRoleFor(null);
      }
    });
  }

  function handleUpdateUser(userId: string) {
    startTransition(async () => {
      const res = await updateUser(userId, {
        name: editForm.name,
        email: editForm.email,
        office: editForm.office || undefined,
      });
      if (!res.ok) flash('error', res.error);
      else {
        flash('success', 'User updated');
        setEditUserFor(null);
      }
    });
  }

  const filtered = initialUsers.filter(u => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (u.name ?? '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.office ?? '').toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
    let matchesStatus = true;
    if (!statusFilter) matchesStatus = !u.disabled;
    else if (statusFilter === 'active') matchesStatus = !u.disabled && !isLocked;
    else if (statusFilter === 'disabled') matchesStatus = u.disabled;
    else if (statusFilter === 'locked') matchesStatus = !u.disabled && !!isLocked;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* ── Toast ──────────────────────────────────────── */}
      {feedback && (
        <div className="fixed right-6 top-6 z-[100]">
          <div
            className={`flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
              feedback.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/80 dark:text-green-300'
                : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/80 dark:text-red-300'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${feedback.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
            {feedback.message}
          </div>
        </div>
      )}

      {/* ── Page Header ───────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Users</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {roleOnly ? 'Manage user roles' : 'Manage accounts, roles, and access control'}
          </p>
        </div>
        {!roleOnly && <button
          onClick={() => { setForm({ name: '', email: '', role: 'QS', office: DEFAULT_OFFICE, password: '' }); setShowAddModal(true); }}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.98]"
        >
          <IconPlus /> Add User
        </button>}
      </div>

      {/* ── Stats Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {([
          { key: '' as const, label: 'Total Users', value: stats.total, icon: <IconUsers />, color: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/40' },
          { key: 'active' as const, label: 'Active', value: stats.active, icon: <IconShield />, color: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
          { key: 'disabled' as const, label: 'Disabled', value: stats.disabled, icon: <IconBan />, color: 'text-red-600 dark:text-red-400', ring: 'ring-red-500', bg: 'bg-red-50 dark:bg-red-950/40' },
          { key: 'locked' as const, label: 'Locked', value: stats.locked, icon: <IconLock />, color: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/40' },
        ] as const).map(card => {
          const active = (card.key === '' && !statusFilter) || statusFilter === card.key;
          return (
            <button
              key={card.key}
              onClick={() => setStatusFilter(statusFilter === card.key ? '' : card.key)}
              className={`group relative overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all hover:shadow-md dark:bg-gray-900 ${
                active ? `border-transparent ring-2 ${card.ring}` : 'border-gray-200 dark:border-gray-700/60'
              }`}
            >
              <div className={`absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-10 ${card.bg}`} />
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-3xl font-bold tracking-tight ${card.color}`}>{card.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                </div>
                <div className={`rounded-xl p-2 ${card.bg} ${card.color}`}>{card.icon}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Search & Filters ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <IconSearch />
          </div>
          <input
            ref={searchRef}
            name="users-search"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…  (Ctrl+K)"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
          />
        </div>
        <select
          title="Filter by role"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="">All Roles</option>
          {USER_ROLES.map(r => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {(search || roleFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <IconX /> Clear
          </button>
        )}
      </div>

      {/* ── Users Table ───────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700/60 dark:bg-gray-900">
        <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/40">
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">User</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Role</th>
              <th className="hidden px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 md:table-cell">Office</th>
              <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              <th className="hidden px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 lg:table-cell">Last Login</th>
              {!roleOnly && <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginated.map((user, rowIndex) => {
              const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
              const isEditing = editUserFor === user.id;
              const isExpanded = expandedUser === user.id;
              const openUp = paginated.length > 3 && rowIndex >= paginated.length - 2;
              return (
                <tr
                  key={user.id}
                  className={`group border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50/50 dark:border-gray-800/50 dark:hover:bg-gray-800/30 ${isExpanded ? 'relative z-40' : ''} ${user.disabled ? 'opacity-50' : ''}`}
                >
                  {/* User (avatar + name + email) */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(user.id)}`}>
                        {initials(user.name, user.email)}
                      </div>
                      <div className="min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm font-medium dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        ) : (
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                            {user.name || '—'}
                          </p>
                        )}
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        ) : (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-4">
                    {editRoleFor === user.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          title="Change role"
                          value={selectedRole}
                          onChange={e => setSelectedRole(e.target.value)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        >
                          {USER_ROLES.map(r => (
                            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleChangeRole(user.id)}
                          disabled={isPending}
                          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditRoleFor(null)} title="Cancel" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          <IconX />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditRoleFor(user.id); setSelectedRole(user.role); }}
                        className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        title="Click to change role"
                      >
                        {user.role.replace(/_/g, ' ')}
                      </button>
                    )}
                  </td>

                  {/* Office */}
                  <td className="hidden px-5 py-4 md:table-cell">
                    {isEditing ? (
                      <select
                        title="Change office"
                        value={editForm.office}
                        onChange={e => setEditForm(f => ({ ...f, office: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      >
                        {OFFICE_OPTIONS.map(office => (
                          <option key={office} value={office}>{office}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-600 dark:text-gray-400">{user.office || '—'}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {user.disabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                        </span>
                      )}
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Locked
                        </span>
                      )}
                      {user.failedLoginAttempts > 0 && !isLocked && (
                        <span className="text-[11px] text-gray-400" title="Failed login attempts">
                          {user.failedLoginAttempts} fail{user.failedLoginAttempts !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Last Login */}
                  <td
                    className="hidden px-5 py-4 lg:table-cell"
                    title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never logged in'}
                  >
                    <span className="text-xs text-gray-500 dark:text-gray-400">{timeAgo(user.lastLoginAt)}</span>
                  </td>

                  {/* Actions */}
                  {!roleOnly && <td className={`relative px-5 py-4 text-right ${isExpanded ? 'z-50' : ''}`}>
                    <div className="flex items-center justify-end gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleUpdateUser(user.id)}
                            disabled={isPending}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditUserFor(null)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <div className="relative">
                          <button
                            onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                            title="More actions"
                          >
                            <IconDots />
                          </button>
                          {isExpanded && (
                            <div className={`absolute right-0 z-[80] w-56 rounded-xl border border-gray-200 bg-white py-1.5 shadow-2xl dark:border-gray-700 dark:bg-gray-900 ${openUp ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'}`}>
                              <button
                                onClick={() => {
                                  setEditUserFor(user.id);
                                  setEditForm({ name: user.name || '', email: user.email, office: isOfficeOption(user.office) ? user.office : DEFAULT_OFFICE });
                                  setExpandedUser(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                <IconEdit /> Edit Details
                              </button>
                              <button
                                onClick={() => {
                                  setEditRoleFor(user.id);
                                  setSelectedRole(user.role);
                                  setExpandedUser(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                <IconShield /> Change Role
                              </button>
                              <button
                                onClick={() => {
                                  setResetPasswordFor(user.id);
                                  setNewPassword('');
                                  setExpandedUser(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                              >
                                <IconKey /> Reset Password
                              </button>
                              {isLocked && (
                                <button
                                  onClick={() => { handleUnlock(user.id); setExpandedUser(null); }}
                                  disabled={isPending}
                                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                  <IconUnlock /> Unlock Account
                                </button>
                              )}
                              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                              <button
                                onClick={() => { handleToggleDisabled(user.id, !user.disabled); setExpandedUser(null); }}
                                disabled={isPending}
                                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm disabled:opacity-50 ${
                                  user.disabled
                                    ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                                    : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
                                }`}
                              >
                                {user.disabled ? <><IconCheck /> Enable Account</> : <><IconBan /> Disable Account</>}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline reset password input */}
                    {resetPasswordFor === user.id && !isEditing && (
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <input
                          name={`admin-reset-username-${user.id}`}
                          type="text"
                          autoComplete="username"
                          value={user.email}
                          readOnly
                          tabIndex={-1}
                          aria-hidden="true"
                          className="sr-only"
                        />
                        <input
                          name={`admin-reset-password-${user.id}`}
                          type="password"
                          autoComplete="new-password"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="New password"
                          className="w-32 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleResetPassword(user.id);
                            if (e.key === 'Escape') { setResetPasswordFor(null); setNewPassword(''); }
                          }}
                        />
                        <button
                          onClick={() => handleResetPassword(user.id)}
                          disabled={isPending}
                          className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Set
                        </button>
                        <button
                          onClick={() => { setResetPasswordFor(null); setNewPassword(''); }}
                          title="Cancel"
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <IconX />
                        </button>
                      </div>
                    )}
                  </td>}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={roleOnly ? 5 : 6} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="rounded-full bg-gray-100 p-3 dark:bg-gray-800">
                      <IconUsers />
                    </div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No users found</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Try adjusting your search or filters</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* ── Pagination ─────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | 'dots')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('dots');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'dots' ? (
                    <span key={`dots-${idx}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`min-w-[28px] rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                        page === item
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Showing {filtered.length} of {initialUsers.length} user{initialUsers.length !== 1 ? 's' : ''}
      </p>

      {/* ── Add User Modal ────────────────────────────── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="dark:bg-gray-900 dark:border dark:border-gray-700 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Create New User</DialogTitle>
            <DialogDescription>
              Fill in the details below to add a new user to the system.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Full Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. John Doe"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Email Address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@company.com"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400" htmlFor="modal-add-role">
                Role
              </label>
              <select
                id="modal-add-role"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value, office: DEFAULT_OFFICE }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              >
                {USER_ROLES.map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Password
              </label>
              <input
                type="password"
                name="new-user-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <button
              onClick={() => setShowAddModal(false)}
              className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create User'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Click-away handler for dropdown ────────────── */}
      {expandedUser && (
        <div className="fixed inset-0 z-20" onClick={() => setExpandedUser(null)} />
      )}
    </div>
  );
}
