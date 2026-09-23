import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, createSession, multiUserEnabled, sessionCookieName, verifyCredentials } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ detail: 'Ungültige Anmeldung.' }, { status: 400 }); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (username.length > 80 || password.length > 256) return NextResponse.json({ detail: 'Ungültige Anmeldung.' }, { status: 400 });
  if (!multiUserEnabled()) {
    try {
      const upstream = await fetch(backendUrl('/auth/login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }), cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
      const response = NextResponse.json(data.user);
      response.cookies.set(sessionCookieName(), data.token, {
        httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
        path: '/', maxAge: Number(data.max_age || 43200),
      });
      return response;
    } catch {
      return NextResponse.json({ detail: 'Backend nicht erreichbar.' }, { status: 503 });
    }
  }
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
