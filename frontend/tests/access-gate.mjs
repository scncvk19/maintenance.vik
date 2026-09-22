import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3000';
const header = { Authorization: `Basic ${Buffer.from('admin:ci-test-password', 'utf8').toString('base64')}` };
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(base, { headers: header });
    if (response.status === 200) { ready = true; break; }
  } catch { /* server has not started */ }
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal(ready, true, 'Protected frontend did not become ready');
for (const path of ['/', '/api/health', '/api/backup/export']) {
  const anonymous = await fetch(`${base}${path}`);
  assert.equal(anonymous.status, 401, `Anonymous access to ${path} was not blocked`);
  assert.match(anonymous.headers.get('www-authenticate') ?? '', /^Basic /);
}
assert.equal((await fetch(base, { headers: header })).status, 200);
assert.equal((await fetch(base, { headers: { Authorization: 'Basic ' + Buffer.from('admin:wrong').toString('base64') } })).status, 401);
// The backend is deliberately absent from this frontend-only smoke test.
// A correctly authenticated /api request must get past the gate (503 upstream), not 401.
const authorizedApi = await fetch(`${base}/api/health`, { headers: header });
assert.notEqual(authorizedApi.status, 401, 'Authorized API request was blocked');
console.log('Access gate smoke test passed (page, API, backup export, wrong password).');
