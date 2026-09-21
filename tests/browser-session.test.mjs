import test from 'node:test';
import assert from 'node:assert/strict';
import { browserToken, newBrowserToken, sessionCookie, browserOwner } from '../lib/browser-session.ts';

test('separate browsers receive distinct, unguessable owner identities without an account', async () => {
  const first = newBrowserToken(); const second = newBrowserToken();
  assert.match(first, /^[a-f0-9]{64}$/); assert.notEqual(first, second);
  assert.notEqual(await browserOwner(first), await browserOwner(second));
  assert.equal(await browserOwner(first), await browserOwner(first));
  assert.ok((await browserOwner(first)).startsWith('browser:'));
});
test('production cookies are host-bound, HttpOnly and secure', () => {
  const token = newBrowserToken(); const request = new Request('https://mira.example/api/config');
  const cookie = sessionCookie(request, token);
  assert.match(cookie, /^__Host-mira_browser=/); assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/); assert.match(cookie, /; SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/);
  assert.equal(browserToken(new Request(request, { headers: { cookie: cookie.split(';')[0] } })), token);
});
test('malformed or duplicated session cookies cannot select a conversation owner', () => {
  const token = newBrowserToken();
  for (const cookie of ['__Host-mira_browser=known-user-id', '__Host-mira_browser=../../user', `__Host-mira_browser=${token}; __Host-mira_browser=${token}`]) {
    assert.equal(browserToken(new Request('https://mira.example/api/config', { headers: { cookie } })), null);
  }
});
