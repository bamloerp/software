import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }

  const userId = session.user.id;
  const role = (session.user as any).role as string;

  // POO sees only their own projects' conflicts
  // Coordinators, Admin, MD see all conflicts
  const where: any = {
    hasConflict: true,
  };

  if (role === 'PROJECT_OPERATIONS_OFFICER') {
    where.project = { assignedToId: userId };
  }

  const count = await prisma.schedule.count({ where });
  return NextResponse.json({ count });
}
