import { NextRequest, NextResponse } from 'next/server';
import { createSession, multiUserEnabled, sessionCookieName, verifyCredentials } from '../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!multiUserEnabled()) return NextResponse.json({ detail: 'Mehrbenutzer-Anmeldung ist nicht aktiviert.' }, { status: 503 });
  let body: { username?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ detail: 'Ungültige Anmeldung.' }, { status: 400 }); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username.length > 80 || password.length > 256) return NextResponse.json({ detail: 'Ungültige Anmeldung.' }, { status: 400 });
  try {
    const user = verifyCredentials(username, password);
    if (!user) return NextResponse.json({ detail: 'Benutzername oder Passwort ist falsch.' }, { status: 401 });
    const session = createSession(user);
    const response = NextResponse.json({ username: user.username, role: user.role });
    response.cookies.set(sessionCookieName(), session.token, {
      httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
      path: '/', maxAge: session.maxAge,
    });
    return response;
  } catch {
    return NextResponse.json({ detail: 'Anmeldung ist nicht vollständig konfiguriert.' }, { status: 503 });
  }
}
