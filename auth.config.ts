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
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any)?.id as string | undefined;
        token.role = (user as any)?.role as string | undefined;
        token.office = (user as any)?.office ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string | undefined;
        (session.user as any).role = token.role as string | undefined;
        (session.user as any).office = (token.office as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
