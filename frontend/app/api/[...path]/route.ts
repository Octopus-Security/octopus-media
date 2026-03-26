import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://backend:3001';

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = (await params).path.join('/');
  const url = `${BACKEND}/api/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (key !== 'host') headers[key] = value;
  });

  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? await req.arrayBuffer()
      : undefined;

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  });

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => resHeaders.set(key, value));

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
