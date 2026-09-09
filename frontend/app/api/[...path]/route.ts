import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY = 251 * 1024 * 1024;
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) return Response.json({ detail: 'Unzulässiger Ursprung' }, { status: 403 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return Response.json({ detail: 'Datei ist zu groß' }, { status: 413 });
  let body: Uint8Array | undefined;
  if (!['GET', 'HEAD'].includes(request.method) && request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY) { await reader.cancel(); return Response.json({ detail: 'Datei ist zu groß' }, { status: 413 }); }
      chunks.push(value);
    }
    body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  }
  try {
    const url = `${process.env.API_URL || 'http://127.0.0.1:8000'}/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
    // The tax vault uses a short-lived, per-browser session token. Forward only
    // that explicit application header instead of passing arbitrary browser headers.
    const upstreamHeaders: Record<string, string> = { 'Content-Type': request.headers.get('content-type') || 'application/json' };
    const taxSession = request.headers.get('x-tax-session');
    if (taxSession) upstreamHeaders['X-Tax-Session'] = taxSession;
    const result = await fetch(url, { method: request.method, headers: upstreamHeaders, body: body as BodyInit | undefined, cache: 'no-store', signal: AbortSignal.timeout(120000) });
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'content-disposition']) { const value = result.headers.get(name); if (value) headers.set(name, value); }
    return new Response(result.body, { status: result.status, headers });
  } catch { return Response.json({ detail: 'Backend nicht erreichbar. Bitte den Anwendungsstart prüfen.' }, { status: 503 }); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
