import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, multiUserEnabled, sessionCookieName } from '../../lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName())?.value;
  if (token && !multiUserEnabled()) {
    try {
      await fetch(backendUrl('/auth/logout'), {
        method: 'POST',
        headers: { 'X-App-Session': token },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Browser logout must still complete when the backend is temporarily unavailable.
    }
  }
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(sessionCookieName(), '', { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 0 });
  return response;
}
