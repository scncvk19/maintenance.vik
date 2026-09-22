import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieName } from '../../lib/auth';

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(sessionCookieName(), '', { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 0 });
  return response;
}
