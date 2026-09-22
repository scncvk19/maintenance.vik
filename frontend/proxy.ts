import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/** Optional, single-user HTTP Basic access gate for the browser and /api.
 * Configure APP_AUTH_PASSWORD in the frontend container to activate it.
 * The reverse proxy must terminate HTTPS before exposing the app remotely.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_AUTH_PASSWORD;
  if (!password) return;

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
  try {
    decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
  } catch { return challenge(); }
  const separator = decoded.indexOf(':');
  if (separator < 0 || decoded.slice(0, separator) !== 'admin') return challenge();
  const provided = Buffer.from(decoded.slice(separator + 1), 'utf8');
  const expected = Buffer.from(password, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return challenge();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
