import assert from 'node:assert/strict';

// Run only against the local preview. Creates and removes one disposable record.
const base = 'http://localhost:5173';
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(20000) });
assert.equal((await request('/api/conversations')).status, 401);
const config = await request('/api/config');
assert.equal(config.status, 200);
assert.equal((await config.json()).sessionReady, true);
const cookie = config.headers.get('set-cookie').split(';')[0];
const otherConfig = await request('/api/config');
const otherCookie = otherConfig.headers.get('set-cookie').split(';')[0];
assert.notEqual(cookie, otherCookie);
const headers = { cookie, origin: base, 'Content-Type': 'application/json' };
const id = crypto.randomUUID();
const at = new Date().toISOString();
const snapshot = { id, title: 'Disposable integration check', messages: [{ id: 'u1', role: 'user', text: 'Hello Mira', at, status: 'final', source: 'voice' }], duration: 5, revision: 2, createdAt: at };
try {
  assert.equal((await request('/api/conversations', { method: 'PUT', headers, body: JSON.stringify(snapshot) })).status, 200);
  let stored = await (await request('/api/conversations?id=' + id, { headers })).json();
  assert.equal(stored.messages[0].text, 'Hello Mira');
  assert.equal(stored.revision, 2);
  assert.equal((await request('/api/conversations', { method: 'PUT', headers, body: JSON.stringify({ ...snapshot, revision: 1, messages: [] }) })).status, 200);
  stored = await (await request('/api/conversations?id=' + id, { headers })).json();
  assert.equal(stored.revision, 2);
  assert.equal(stored.messages.length, 1);
  const listing = await (await request('/api/conversations', { headers })).json();
  assert.ok(listing.conversations.some(row => row.id === id));
  const otherHeaders = { ...headers, cookie: otherCookie };
  assert.equal((await request('/api/conversations?id=' + id, { headers: otherHeaders })).status, 404);
  assert.equal((await request('/api/conversations', { method: 'PUT', headers: otherHeaders, body: JSON.stringify({ ...snapshot, revision: 3 }) })).status, 404);
  await request('/api/conversations?id=' + id, { method: 'DELETE', headers: otherHeaders });
  assert.equal((await request('/api/conversations?id=' + id, { headers })).status, 200);
  assert.equal((await (await request('/api/config', { headers })).json()).sessionReady, true);
  assert.equal((await request('/api/conversations', { method: 'PUT', headers: { ...headers, origin: 'https://unrelated.example' }, body: JSON.stringify(snapshot) })).status, 403);
  assert.equal((await request('/api/realtime', { method: 'POST', headers, body: JSON.stringify({ sdp: 'placeholder-sdp' }) })).status, 503);
  console.log('Passed: automatic guest sessions, browser isolation for read/write/delete, persistence, stale-save protection, and cross-origin rejection.');
} finally {
  const deletion = await request('/api/conversations?id=' + id, { method: 'DELETE', headers });
  assert.equal(deletion.status, 200);
  assert.equal((await request('/api/conversations?id=' + id, { headers })).status, 404);
}
