'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type ActionResult = { ok: true } | { ok: false; error: string };

const ProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name too long'),
});

export async function updateProfile(data: { name: string }): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me?.id) return { ok: false, error: 'Not signed in' };
  const parsed = ProfileSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(', ') };
  }
  await prisma.user.update({
    where: { id: me.id },
    data: { name: parsed.data.name },
  });
  revalidatePath('/settings');
  return { ok: true };
}

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export async function changeOwnPassword(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me?.id) return { ok: false, error: 'Not signed in' };

  const parsed = PasswordSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join(', ') };
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) return { ok: false, error: 'Account has no password set' };

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) return { ok: false, error: 'Current password is incorrect' };

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return { ok: false, error: 'New password must be different from current password' };
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  revalidatePath('/settings');
  return { ok: true };
}
