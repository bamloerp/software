'use server';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function addEmployee(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'HUMAN_RESOURCE' && user.role !== 'ADMIN') {
    return { ok: false, error: 'Unauthorized' };
  }

  const givenName = formData.get('givenName') as string;
  const surname = formData.get('surname') as string;
  const ecNumber = formData.get('ecNumber') as string;
  const role = formData.get('role') as string;
  const email = formData.get('email') as string;
  const phone = formData.get('phone') as string;
  const office = formData.get('office') as string;
  const nextOfKin = formData.get('nextOfKin') as string;
  const nextOfKinContact = formData.get('nextOfKinContact') as string;

  if (!givenName || !role) {
    return { ok: false, error: 'Name and Role are required' };
  }

  try {
    const existing = await prisma.employee.findFirst({
      where: { OR: [{ ecNumber: ecNumber || undefined }, { email: email || undefined }] },
    });
    if (existing && (existing.ecNumber === ecNumber || (email && existing.email === email))) {
      return { ok: false, error: 'Employee with this EC Number or Email already exists' };
    }

    await prisma.employee.create({
      data: {
        givenName,
        surname,
        ecNumber,
        role,
        email,
        phone,
        office,
        nextOfKin,
        nextOfKinContact,
        createdBy: user.id,
        status: 'ACTIVE',
      },
    });

    revalidatePath('/employees');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to add an employee' };
  }
}

export async function updateEmployeeStatus(employeeId: string, status: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'HUMAN_RESOURCE' && user.role !== 'ADMIN') {
    return { ok: false, error: 'Unauthorized' };
  }

  if (!['ACTIVE', 'LEAVE', 'SUSPENDED', 'DISABLED'].includes(status)) {
    return { ok: false, error: 'Invalid status' };
  }

  try {
    await prisma.employee.update({
      where: { id: employeeId },
      data: { status },
    });
    revalidatePath('/employees');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Failed to update status' };
  }
}

export async function getEmployees({
  query,
  status,
  page = 1,
  pageSize = 20,
}: {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const where: any = {
    ...(status ? { status } : {}),
    ...(query ? {
      OR: [
        { givenName: { contains: query, mode: 'insensitive' } },
        { surname: { contains: query, mode: 'insensitive' } },
        { role: { contains: query, mode: 'insensitive' } },
        { ecNumber: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ]
    } : {})
  };

  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where })
  ]);

  return { items, total };
}
