import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL   = process.env.BACKEND_URL    || 'http://backend:3001';
const AUTH_LOGIN_BASE = process.env.AUTH_PUBLIC_URL || 'https://auth.octopustechnology.net';

/**
 * Where this app lives on the internet, stated rather than inferred.
 *
 * The return URL used to come from req.nextUrl, which is built from what the
 * CONTAINER received — and that resolved to `https://<container-id>:3000/`, the
 * container's own id and internal port. So signing in from a cold browser sent
 * you to auth, then bounced you to an address that exists nowhere.
 *
 * The hardcoded default is load-bearing, not laziness. Middleware runs in the
 * edge runtime, where process.env is inlined at BUILD time — a value set only in
 * the compose environment may never arrive. Being correct with no env var at all
 * is the property we want; the override is for a second deployment, if there
 * ever is one.
 */
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://media.octopustechnology.net';
const PUBLIC_ORIGIN = new URL(PUBLIC_URL).origin;

/**
 * Where to send the browser back to after signing in.
 *
 * Path and query come from the request; the ORIGIN comes from configuration.
 * Then the result is checked, because supplying a base to `new URL()` does not
 * guarantee you stay on it: a PROTOCOL-RELATIVE path escapes outright —
 * `new URL('//evil.com', 'https://media.…')` is `https://evil.com/`. This value
 * is handed to auth as `?redirect=`, so an unchecked one is an open redirect
 * through the login flow, wearing our own domain on the way in.
 */
function returnUrlFor(req: NextRequest): string {
  try {
    const target = new URL(req.nextUrl.pathname + req.nextUrl.search, PUBLIC_URL);
    if (target.origin === PUBLIC_ORIGIN) return target.toString();
  } catch {
    // fall through — an unparseable path is not worth a 500 on the login path
  }
  return `${PUBLIC_ORIGIN}/`;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const cookie = req.headers.get('cookie') || '';

  let status: number;
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { cookie },
      cache: 'no-store',
    });
    status = res.status;
  } catch {
    return new NextResponse('Service unavailable.', { status: 503 });
  }

  // The backend no longer has an IP allowlist, so 403 is not an access-denied
  // signal any more — only 401 (not signed in) is.
  if (status === 401) {
    const returnUrl = encodeURIComponent(returnUrlFor(req));
    return NextResponse.redirect(`${AUTH_LOGIN_BASE}/login?redirect=${returnUrl}`);
  }

  // Logged in — don't let the /login page redirect to auth again
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
