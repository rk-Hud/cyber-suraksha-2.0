'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, validatedBase, validChallenge } = require('../source/static/js/account.js');
const API = 'https://api.example';
const token = 'a'.repeat(43);
const session = () => ({ token, expiresAt: Date.now() + 60000 });
const response = (data, status = 200) => new Response(JSON.stringify({ data, requestId: 'testreference01' }), { status, headers: { 'Content-Type': 'application/json' } });

test('account API rejects unsafe URL configuration and cross-host paths before transport', async () => {
  for (const url of ['', 'http://api.example', 'https://user:password@api.example', 'https://api.example/?key=secret', 'https://api.example/#secret', 'https://api.example/ path']) assert.throws(() => validatedBase(url));
  const client = createClient(API, () => { throw new Error('must not fetch'); });
  for (const route of ['https://evil.example', '//evil.example', '/api/v1/../secret', '/en/login', '/api/v1/cases#x']) await assert.rejects(client.request(route));
});

test('requests omit cookies, referrers and caching and send bearer only when explicitly authenticated', async () => {
  const calls = [];
  const client = createClient(API, async (url, options) => { calls.push({ url, options }); return response({ accepted: true }); });
  await client.request('/api/v1/health');
  client.setSession(session());
  await client.request('/api/v1/cases', 'POST', { subject: 'private' }, { authenticated: true });
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ' + token);
  assert.equal(calls[1].options.body, JSON.stringify({ subject: 'private' }));
  for (const { url, options } of calls) {
    assert.ok(url.startsWith(API + '/api/v1/'));
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.cache, 'no-store');
  }
});

test('expired or malformed session data never causes authenticated network traffic', async () => {
  let count = 0;
  const client = createClient(API, async () => { count++; return response({}); });
  for (const value of [{ token: 'weak', expiresAt: Date.now() + 1000 }, { token, expiresAt: Date.now() - 1 }, { token, expiresAt: 'invalid' }]) assert.throws(() => client.setSession(value));
  await assert.rejects(client.request('/api/v1/cases', 'GET', undefined, { authenticated: true }), { code: 'account_session_expired' });
  assert.equal(count, 0);
});

test('invalid error codes and server content are reduced to a translated generic message', async () => {
  const client = createClient(API, async () => new Response(JSON.stringify({ error: { code: '<script>secret</script>' }, requestId: '<b>unsafe</b>' }), { status: 503 }));
  await assert.rejects(client.request('/api/v1/health'), error => error.code === 'msg_request_failed' && error.requestId === '');
});

test('malformed and oversized responses fail closed', async () => {
  const inputs = [new Response('not json'), new Response(JSON.stringify({ unexpected: true })), new Response('x', { headers: { 'Content-Length': '524289' } }), new Response('x'.repeat(524289))];
  for (const input of inputs) await assert.rejects(createClient(API, async () => input).request('/api/v1/health'));
});

test('unauthorized response revokes bearer before a further request', async () => {
  let count = 0;
  const client = createClient(API, async () => { count++; return new Response(JSON.stringify({ error: { code: 'msg_login_required' } }), { status: 401 }); });
  client.setSession(session());
  await assert.rejects(client.request('/api/v1/cases', 'GET', undefined, { authenticated: true }), { status: 401 });
  await assert.rejects(client.request('/api/v1/cases', 'GET', undefined, { authenticated: true }), { code: 'account_session_expired' });
  assert.equal(count, 1);
});

test('sign-out aborts pending authenticated work and discards its late response', async () => {
  let resolve, signal;
  const client = createClient(API, (_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  client.setSession(session());
  const pending = client.request('/api/v1/cases', 'GET', undefined, { authenticated: true });
  client.clearSession();
  assert.equal(signal.aborted, true);
  resolve(response({ private: 'late record' }));
  await assert.rejects(pending, { code: 'account_request_cancelled' });
});

test('challenge data is bounded and retained only for a current API flow', () => {
  const input = { id: '12345678-1234-1234-1234-123456789abc', token, expiresAt: Date.now() + 10000, purpose: 'login' };
  assert.equal(validChallenge(input).token, token);
  for (const change of [{ token: 'short' }, { id: '<script>' }, { expiresAt: Date.now() - 1 }]) assert.throws(() => validChallenge({ ...input, ...change }));
});
