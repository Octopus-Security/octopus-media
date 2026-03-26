import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip     = req.headers.get('x-forwarded-for') || '';
  const cookie = req.headers.get('cookie') || '';

  let status: number;
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { 'x-forwarded-for': ip, cookie },
      cache: 'no-store',
    });
    status = res.status;
  } catch {
    return new NextResponse('Service unavailable.', { status: 503 });
  }

  if (status === 403) {
    if (pathname === '/denied') return NextResponse.next();
    return NextResponse.redirect(new URL('/denied', req.url));
  }

  if (status === 401) {
    if (pathname === '/login') return NextResponse.next();
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
