'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return null;
  return user;
}

/** List all users (admin only) */
export async function getUsers() {
  const admin = await requireAdmin();
  if (!admin) return [];
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      office: true,
      disabled: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  role: z.string().min(1, 'Role is required'),
  office: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/** Create a new user (admin only) */
export async function createUser(data: {
  name: string;
  email: string;
  role: string;
  office?: string;
  password: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required' };

  const parsed = CreateUserSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map(e => e.message).join(', ') };
  }

  const { name, email, role, office, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: 'A user with this email already exists' };

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { name, email, role, office: office || null, passwordHash },
  });

  revalidatePath('/users');
  return { ok: true };
}

/** Toggle user disabled status (admin only) */
export async function toggleUserDisabled(userId: string, disabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required' };
  if (userId === admin.id) return { ok: false, error: 'Cannot disable your own account' };

  await prisma.user.update({
    where: { id: userId },
    data: { disabled },
  });

  revalidatePath('/users');
  return { ok: true };
}

/** Reset a user's password (admin only) */
export async function resetUserPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required' };

  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
  });

  revalidatePath('/users');
  return { ok: true };
}

/** Unlock a locked user account (admin only) */
export async function unlockUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required' };

  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  revalidatePath('/users');
  return { ok: true };
}

/** Change user role (admin only) */
export async function changeUserRole(userId: string, role: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required' };
  if (userId === admin.id) return { ok: false, error: 'Cannot change your own role' };

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath('/users');
  return { ok: true };
}

const UpdateUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  office: z.string().optional(),
});

/** Update user name / email / office (admin only) */
export async function updateUser(
  userId: string,
  data: { name: string; email: string; office?: string },
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required' };

  const parsed = UpdateUserSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map(e => e.message).join(', ') };
  }

  const { name, email, office } = parsed.data;

  // Check email uniqueness (exclude current user)
  const existing = await prisma.user.findFirst({
    where: { email, id: { not: userId } },
  });
  if (existing) return { ok: false, error: 'Another user already has this email' };

  await prisma.user.update({
    where: { id: userId },
    data: { name, email, office: office || null },
  });

  revalidatePath('/users');
  return { ok: true };
}
