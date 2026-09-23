import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, multiUserEnabled, sessionCookieName } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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
      // Always clear the browser session even if the backend is temporarily unavailable.
    }
  }
  const response = NextResponse.json({ logged_out: true });
  response.cookies.set(sessionCookieName(), '', { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 0 });
  return response;
}
