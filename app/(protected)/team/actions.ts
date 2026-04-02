'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { setFlashMessage } from '@/lib/flash.server';
import { getErrorMessage } from '@/lib/errors';

const TEAM_PAGE = '/team';
const DEFAULT_TEAM_PASSWORD = process.env.PROJECT_TEAM_DEFAULT_PASSWORD || 'ChangeMe123!';

async function requireManager() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error('Authentication required');
  }
  if (user.role !== 'PROJECT_OPERATIONS_OFFICER' && user.role !== 'ADMIN') {
    throw new Error('Only Project Managers or Admins can manage teams');
  }
  return user;
}

export async function createTeamMember(formData: FormData) {
  try {
    const currentUser = await requireManager();
    const name = String(formData.get('name') ?? '').trim();
    const emailRaw = String(formData.get('email') ?? '').trim().toLowerCase();
    if (!name) throw new Error('Name is required');
    if (!emailRaw) throw new Error('Email is required');

    const existing = await prisma.user.findUnique({ where: { email: emailRaw } });
    let member = existing;
    if (!existing) {
      const passwordHash = await bcrypt.hash(DEFAULT_TEAM_PASSWORD, 10);
      member = await prisma.user.create({
        data: {
          email: emailRaw,
          name,
          role: 'PROJECT_TEAM',
          office: currentUser.office ?? null,
          passwordHash,
        },
      });
    } else if (existing.role !== 'PROJECT_TEAM') {
      member = await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'PROJECT_TEAM', office: existing.office ?? currentUser.office ?? null },
      });
    }

    if (!member) throw new Error('Unable to prepare team member');

    await prisma.projectTeamMember.upsert({
      where: { managerId_memberId: { managerId: currentUser.id!, memberId: member.id } },
      update: {},
      create: { managerId: currentUser.id!, memberId: member.id },
    });

    await setFlashMessage({ type: 'success', message: 'Team member saved.' });
  } catch (error) {
    await setFlashMessage({ type: 'error', message: getErrorMessage(error) });
  }

  revalidatePath(TEAM_PAGE);
  redirect(TEAM_PAGE);
}

export async function removeTeamMember(formData: FormData) {
  try {
    const currentUser = await requireManager();
    const teamMemberId = String(formData.get('teamMemberId') ?? '');
    if (!teamMemberId) throw new Error('Missing team member');

    await prisma.$transaction(async (tx) => {
      const member = await tx.projectTeamMember.findUnique({ where: { id: teamMemberId } });
      if (!member || member.managerId !== currentUser.id) {
        throw new Error('Team member not found');
      }
      await tx.projectTeamAssignment.deleteMany({ where: { teamMemberId } });
      await tx.projectTeamMember.delete({ where: { id: teamMemberId } });
    }, TX_OPTS);

    await setFlashMessage({ type: 'success', message: 'Team member removed.' });
  } catch (error) {
    await setFlashMessage({ type: 'error', message: getErrorMessage(error) });
  }

  revalidatePath(TEAM_PAGE);
  redirect(TEAM_PAGE);
}

export async function assignTeamMember(formData: FormData) {
  try {
    const currentUser = await requireManager();
    const teamMemberId = String(formData.get('teamMemberId') ?? '');
    const quoteId = String(formData.get('quoteId') ?? '');
    if (!teamMemberId || !quoteId) throw new Error('Select team member and project');

    const [member, quote] = await Promise.all([
      prisma.projectTeamMember.findUnique({ where: { id: teamMemberId }, include: { member: true } }),
      prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true, projectManagerId: true } }),
    ]);

    if (!member || member.managerId !== currentUser.id) throw new Error('Team member not found');
    if (!quote || quote.projectManagerId !== currentUser.id) throw new Error('You do not manage this project');

    await prisma.projectTeamAssignment.upsert({
      where: { teamMemberId_quoteId: { teamMemberId, quoteId } },
      update: {},
      create: { teamMemberId, quoteId },
    });

    await setFlashMessage({ type: 'success', message: 'Assignment saved.' });
  } catch (error) {
    await setFlashMessage({ type: 'error', message: getErrorMessage(error) });
  }

  revalidatePath(TEAM_PAGE);
  redirect(TEAM_PAGE);
}

export async function removeTeamAssignment(formData: FormData) {
  try {
    const currentUser = await requireManager();
    const assignmentId = String(formData.get('assignmentId') ?? '');
    if (!assignmentId) throw new Error('Missing assignment id');

    await prisma.$transaction(async (tx) => {
      const assignment = await tx.projectTeamAssignment.findUnique({
        where: { id: assignmentId },
        include: { teamMember: true },
      });
      if (!assignment || assignment.teamMember.managerId !== currentUser.id) {
        throw new Error('Assignment not found');
      }
      await tx.projectTeamAssignment.delete({ where: { id: assignmentId } });
    }, TX_OPTS);

    await setFlashMessage({ type: 'success', message: 'Assignment removed.' });
  } catch (error) {
    await setFlashMessage({ type: 'error', message: getErrorMessage(error) });
  }

  revalidatePath(TEAM_PAGE);
  redirect(TEAM_PAGE);
}

