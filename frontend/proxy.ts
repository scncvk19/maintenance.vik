import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { databaseAuthStatus, databaseSession, multiUserEnabled, sessionCookieName, verifySession } from './lib/auth';

/** Access gate for browser and /api.
 * Preferred mode: APP_AUTH_USERS_B64 + APP_SESSION_SECRET (multi-user session login).
 * Legacy fallback: APP_AUTH_PASSWORD (single shared HTTP Basic password).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (multiUserEnabled()) {
    if (path === '/login' || path === '/api/auth/login' || path === '/api/auth/logout' || path === '/logout') return;
    let user = null;
    try { user = verifySession(request.cookies.get(sessionCookieName())?.value); } catch { user = null; }
    if (!user) {
      if (path.startsWith('/api/')) return NextResponse.json({ detail: 'Anmeldung erforderlich.' }, { status: 401 });
      const login = new URL('/login', request.url);
      login.searchParams.set('next', path);
      return NextResponse.redirect(login);
    }
    if (user.role === 'viewer') {
      const sensitive = path.startsWith('/api/tax-') || path.startsWith('/api/tax-cases') || path.startsWith('/api/backup');
      const write = path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method);
      if (sensitive || write) return NextResponse.json({ detail: 'Nur Administratoren dürfen diese Aktion ausführen.' }, { status: 403 });
    }
    return;
  }

  const password = process.env.APP_AUTH_PASSWORD;
  if (!password) {
    const setupPublic = path === '/setup' || path === '/api/auth/setup';
    const loginPublic = path === '/login' || path === '/api/auth/login';
    const logoutPublic = path === '/api/auth/logout' || path === '/logout';
    let status;
    try { status = await databaseAuthStatus(); }
    catch {
      if (path === '/api/health') return;
      if (path.startsWith('/api/')) return NextResponse.json({ detail: 'Backend nicht erreichbar.' }, { status: 503 });
      return;
    }
    if (status.setup_required) {
      if (setupPublic || path === '/api/health') return;
      if (path.startsWith('/api/')) return NextResponse.json({ detail: 'Ersteinrichtung erforderlich.' }, { status: 428 });
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    if (setupPublic) {
      if (path.startsWith('/api/')) return NextResponse.json({ detail: 'Ersteinrichtung ist bereits abgeschlossen.' }, { status: 409 });
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (loginPublic || logoutPublic) return;
    const user = await databaseSession(request.cookies.get(sessionCookieName())?.value);
    if (!user) {
      if (path.startsWith('/api/')) return NextResponse.json({ detail: 'Anmeldung erforderlich.' }, { status: 401 });
      const login = new URL('/login', request.url);
      login.searchParams.set('next', path);
      return NextResponse.redirect(login);
    }
    if (user.role === 'viewer') {
      const sensitive = path.startsWith('/api/tax-') || path.startsWith('/api/tax-cases') || path.startsWith('/api/backup') || path.startsWith('/api/auth/users');
      const write = path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method);
      if (sensitive || write) return NextResponse.json({ detail: 'Nur Administratoren dürfen diese Aktion ausführen.' }, { status: 403 });
    }
    return;
  }

  const challenge = () => new Response('Anmeldung erforderlich.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="maintenance.vik", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Basic ')) return challenge();
  let decoded: string;
  try { decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8'); }
  catch { return challenge(); }
  const separator = decoded.indexOf(':');
  if (separator < 0 || decoded.slice(0, separator) !== 'admin') return challenge();
  const provided = Buffer.from(decoded.slice(separator + 1), 'utf8');
  const expected = Buffer.from(password, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return challenge();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
