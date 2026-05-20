import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// Utility to get current authenticated user
export type AuthenticatedUser = {
  id: string | undefined;
  email: string | null;
  name: string | null;
  role: string | undefined;
  office: string | null | undefined;
};

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const sessionUser = session.user as any;
  const sessionId = sessionUser.id as string | undefined;
  if (sessionId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionId },
      select: { id: true, email: true, name: true, role: true, office: true },
    });
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        office: dbUser.office,
      };
    }
  }
  return {
    id: sessionId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    role: sessionUser.role as string | undefined,
    office: sessionUser.office as string | null | undefined,
  };
}
