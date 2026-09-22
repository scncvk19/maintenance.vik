import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3000';
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(base + '/login');
    if (response.status === 200) { ready = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal(ready, true, 'Login page did not become ready');

const anonymous = await fetch(base + '/', { redirect: 'manual' });
assert.ok([307, 308, 302].includes(anonymous.status), 'Anonymous page was not redirected');
assert.match(anonymous.headers.get('location') || '', /\/login/);

const wrong = await fetch(base + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
});
assert.equal(wrong.status, 401);

async function login(username, password) {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200, await response.text());
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes('mvik_session=') && cookie.toLowerCase().includes('httponly'));
  return cookie.split(';')[0];
}

const admin = await login('admin', 'ci-admin-password-123');
assert.equal((await fetch(base + '/', { headers: { Cookie: admin } })).status, 200);
const adminApi = await fetch(base + '/api/health', { headers: { Cookie: admin } });
assert.notEqual(adminApi.status, 401);
assert.notEqual(adminApi.status, 403);

const viewer = await login('viewer', 'ci-viewer-password-123');
const viewerRead = await fetch(base + '/api/health', { headers: { Cookie: viewer } });
assert.notEqual(viewerRead.status, 401);
assert.notEqual(viewerRead.status, 403);
assert.equal((await fetch(base + '/api/seed', { method: 'POST', headers: { Cookie: viewer } })).status, 403);
assert.equal((await fetch(base + '/api/backup/export', { headers: { Cookie: viewer } })).status, 403);
assert.equal((await fetch(base + '/api/tax-vault/status', { headers: { Cookie: viewer } })).status, 403);

const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: admin } });
assert.equal(logout.status, 200);
assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/i);

console.log('Multi-user auth smoke test passed (login, HttpOnly cookie, admin, viewer, logout).');
