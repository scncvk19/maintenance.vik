import { createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';

export type AppRole = 'admin' | 'viewer';
type StoredUser = { username: string; role: AppRole; salt: string; hash: string };
export type SessionUser = { id?: string; username: string; role: AppRole; active?: boolean };

const COOKIE_NAME = 'mvik_session';
const SESSION_SECONDS = 12 * 60 * 60;

export function sessionCookieName() { return COOKIE_NAME; }

export function backendUrl(path: string) {
  return `${process.env.API_URL || 'http://127.0.0.1:8000'}${path}`;
}

export async function databaseAuthStatus(): Promise<{setup_required: boolean; user_count: number}> {
  const response = await fetch(backendUrl('/auth/status'), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Authentifizierungsstatus nicht erreichbar.');
  return response.json();
}

export async function databaseSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const response = await fetch(backendUrl('/auth/session'), {
      headers: { 'X-App-Session': token }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function configuredUsers(): StoredUser[] {
  const encoded = process.env.APP_AUTH_USERS_B64 || '';
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is StoredUser =>
      u && typeof u.username === 'string' &&
      (u.role === 'admin' || u.role === 'viewer') &&
      typeof u.salt === 'string' && /^[0-9a-f]{32}$/i.test(u.salt) &&
      typeof u.hash === 'string' && /^[0-9a-f]{64}$/i.test(u.hash)
    );
  } catch {
    return [];
  }
}

export function multiUserEnabled() {
  return Boolean(process.env.APP_AUTH_USERS_B64);
}

function secret(): string {
  const value = process.env.APP_SESSION_SECRET || '';
  if (value.length < 32) throw new Error('APP_SESSION_SECRET fehlt oder ist zu kurz.');
  return value;
}

export function verifyCredentials(username: string, password: string): SessionUser | null {
  const user = configuredUsers().find(item => item.username === username);
  if (!user) return null;
  const actual = pbkdf2Sync(password, Buffer.from(user.salt, 'hex'), 310000, 32, 'sha256');
  const expected = Buffer.from(user.hash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { username: user.username, role: user.role };
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSession(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({
    u: user.username,
    r: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })).toString('base64url');
  return { token: payload + '.' + sign(payload), maxAge: SESSION_SECONDS };
}

export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.u !== 'string' || !['admin', 'viewer'].includes(data.r) ||
        !Number.isInteger(data.exp) || data.exp <= Math.floor(Date.now() / 1000)) return null;
    const stillConfigured = configuredUsers().find(item => item.username === data.u && item.role === data.r);
    return stillConfigured ? { username: data.u, role: data.r } : null;
  } catch {
    return null;
  }
}
