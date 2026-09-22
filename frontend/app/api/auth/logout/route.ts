import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieName } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ logged_out: true });
  response.cookies.set(sessionCookieName(), '', { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 0 });
  return response;
}
