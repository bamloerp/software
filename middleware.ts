import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

// Only initialise NextAuth middleware when a secret is available;
// otherwise every request would crash with MIDDLEWARE_INVOCATION_FAILED.
const authMiddleware = secret
  ? NextAuth({ ...authConfig, secret }).auth
  : null;

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

async function handler(req: NextRequest) {
  // No auth secret → just pass through (login page will render, auth won't work)
  if (!authMiddleware) return noStore(NextResponse.next());

  // Run the NextAuth middleware
  return (authMiddleware as any)(async (authReq: any) => {
    if (authReq.auth?.user?.id) {
      const { pathname, search } = authReq.nextUrl;

      // Force change-password redirect when admin reset the password
      const mustChange = (authReq.auth.user as any).mustChangePassword;
      const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');
      const isAuthApi = pathname.startsWith('/api/auth');
      const isLogout = pathname.startsWith('/api/logout') || pathname.startsWith('/logout');
      if (mustChange && !isSettings && !isAuthApi && !isLogout) {
        const url = authReq.nextUrl.clone();
        url.pathname = '/settings';
        url.search = '?force=1';
        return noStore(NextResponse.redirect(url));
      }

      const method = authReq.method;
      const ip = authReq.headers.get('x-forwarded-for') || 'unknown';
      const userAgent = authReq.headers.get('user-agent') || 'unknown';

      fetch(`${authReq.nextUrl.origin}/api/log-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authReq.auth.user.id,
          action: `${method} ${pathname}`,
          method,
          path: pathname + search,
          ip,
          userAgent,
        }),
      }).catch(() => { });
    }

    return noStore(NextResponse.next());
  })(req);
}

export default handler;

export const config = {
  // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
