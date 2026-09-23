import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, multiUserEnabled, sessionCookieName } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (multiUserEnabled() || process.env.APP_AUTH_PASSWORD) {
    return NextResponse.json({ detail: 'Browser-Ersteinrichtung ist bei externer Auth-Konfiguration deaktiviert.' }, { status: 409 });
  }
  let body: { username?: string; password?: string; password_repeat?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ detail: 'Ungültige Eingabe.' }, { status: 400 }); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const repeat = String(body.password_repeat || '');
  if (password !== repeat) return NextResponse.json({ detail: 'Die Passwörter stimmen nicht überein.' }, { status: 422 });
  try {
    const upstream = await fetch(backendUrl('/auth/setup'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }), cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
    const response = NextResponse.json(data.user, { status: 201 });
    response.cookies.set(sessionCookieName(), data.token, {
      httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
      path: '/', maxAge: Number(data.max_age || 43200),
    });
    return response;
  } catch {
    return NextResponse.json({ detail: 'Backend nicht erreichbar.' }, { status: 503 });
  }
}
