//@ts-nocheck
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isPublicRoute = nextUrl.pathname === '/' || nextUrl.pathname === '/login';

      if (isLoggedIn) {
        if (isPublicRoute) {
          return Response.redirect(new URL('/dashboard', nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        if (!isPublicRoute) {
          return false; // Redirect to login
        }
        return true;
      }

      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = (user as any)?.id as string | undefined;
        token.role = (user as any)?.role as string | undefined;
        token.office = (user as any)?.office ?? null;
        token.mustChangePassword = Boolean((user as any)?.mustChangePassword);
      }
      // Allow client-side updates via update() to refresh mustChangePassword
      if (trigger === 'update' && token.id) {
        try {
          const { prisma } = await import('@/lib/db');
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { mustChangePassword: true, name: true, role: true },
          });
          if (fresh) {
            token.mustChangePassword = Boolean(fresh.mustChangePassword);
            token.role = fresh.role;
          }
        } catch (e) { /* noop */ }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string | undefined;
        (session.user as any).role = token.role as string | undefined;
        (session.user as any).office = (token.office as string | null | undefined) ?? null;
        (session.user as any).mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
