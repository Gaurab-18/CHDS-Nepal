import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/login/2fa', '/login/backup-code', '/blocked', '/session-expired', '/access-denied', '/hacking-detected', '/_next'];
const ROLE_ROUTES: Record<string, string> = {
  patient: '/dashboard',
  doctor: '/doctor/search',
  admin: '/admin/users',
};

function decodeJWT(token: string): { role?: string; email?: string } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === '/') {
    const token = request.cookies.get('access_token')?.value;
    if (token) {
      const payload = decodeJWT(token);
      if (payload?.role) {
        return NextResponse.redirect(new URL(ROLE_ROUTES[payload.role] || '/login', request.url));
      }
    }
    return NextResponse.next();
  }

  for (const route of PUBLIC_ROUTES) {
    if (pathname.startsWith(route)) return NextResponse.next();
  }

  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJWT(accessToken);
  if (!payload || !payload.role) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const role = payload.role;

  if (pathname.startsWith('/dashboard') && role !== 'patient') {
    const redirectUrl = new URL(ROLE_ROUTES[role] || '/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith('/doctor') && role !== 'doctor') {
    const redirectUrl = new URL(ROLE_ROUTES[role] || '/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith('/admin') && role !== 'admin') {
    const redirectUrl = new URL(ROLE_ROUTES[role] || '/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === '/change-password') return NextResponse.next();

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/v1).*)',
  ],
};
