import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { fixture } from './helper.js';

// This independent API audit uses a local RSA signer in place of Google's key
// endpoint. The production verifier still validates every signed test assertion.
const clientId = '12345-independent.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...publicKey.export({ format: 'jwk' }), kid: 'independent-key', alg: 'RS256', use: 'sig' };
const googleFetcher = async () => new Response(JSON.stringify({ keys: [key] }), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
});
const settings = { GOOGLE_CLIENT_ID: clientId, GOOGLE_SIGNIN_ENABLED: '1', GOOGLE_REGISTRATION_ENABLED: '1' };
const caseInput = { subject: 'Fictional suspicious request', category: 'account',
  details: 'A fictional message requested an account change. No personal credentials were included.', consent: true };

function credential(flow, subject, email, extra = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: key.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: clientId,
    sub: subject, email, email_verified: true, name: 'Independent Citizen', nonce: flow.nonce,
    iat: seconds - 5, exp: seconds + 300, ...extra })).toString('base64url');
  return head + '.' + payload + '.' + sign('RSA-SHA256', Buffer.from(head + '.' + payload), privateKey).toString('base64url');
}
async function begin(api) {
  const response = await api.request('/auth/google/challenge', { method: 'POST', data: { locale: 'en' } });
  assert.equal(response.status, 200);
  return response.json.data.challenge;
}
function exchange(api, flow, token, extra = {}) {
  return api.request('/auth/google', { method: 'POST', data: { challengeId: flow.id, flowToken: flow.token,
    nonce: flow.nonce, credential: token, consent: true, ...extra } });
}
async function citizen(api, subject = '111111111111111111111', email = 'citizen-a@example.test') {
  const flow = await begin(api), assertion = credential(flow, subject, email);
  const response = await exchange(api, flow, assertion);
  assert.equal(response.status, 200);
  assert.equal(response.json.data.user.role, 'citizen');
  return { ...response.json.data, flow, assertion };
}

test('Google citizens retain direct-API case isolation across reads, replies and unsupported writes', async t => {
  const api = await fixture(t, settings, { googleFetcher }); if (!api) return;
  const first = await citizen(api);
  const second = await citizen(api, '222222222222222222222', 'citizen-b@example.test');
  const created = await api.request('/cases', { method: 'POST', token: first.token, data: caseInput });
  assert.equal(created.status, 201);
  const id = created.json.data.case.id;
  assert.equal((await api.request('/cases/' + id)).status, 401);
  assert.equal((await api.request('/cases/' + id, { token: first.assertion })).status, 401);
  const denied = await api.request('/cases/' + id, { token: second.token });
  assert.equal(denied.status, 404);
  assert.ok(!JSON.stringify(denied.json).includes(caseInput.details));
  assert.equal((await api.request('/cases/' + id + '/replies', { method: 'POST', token: second.token,
    data: { message: 'A fictional unauthorized reply attempt.' } })).status, 404);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await api.request('/cases/' + id, {
    method, token: second.token, data: { status: 'closed' } })).status, 404);
  assert.equal((await api.request('/cases', { token: second.token })).json.data.cases.length, 0);
  const unchanged = (await api.request('/cases/' + id, { token: first.token })).json.data;
  assert.equal(unchanged.case.version, 1);
  assert.equal(unchanged.events.length, 1);
});

test('Google citizen sessions cannot reach any privileged read, content write or MFA operation', async t => {
  const api = await fixture(t, settings, { googleFetcher }); if (!api) return;
  const user = await citizen(api);
  for (const path of ['/admin/summary', '/admin/users', '/admin/cases', '/admin/content']) {
    assert.equal((await api.request(path, { token: user.token })).status, 403);
  }
  for (const [path, data] of [['/admin/mfa/start', {}], ['/admin/mfa/confirm', { code: '123456' }],
    ['/admin/mfa/verify', { code: '123456' }], ['/admin/notifications/send-one', {}]]) {
    assert.equal((await api.request(path, { method: 'POST', token: user.token, data })).status, 403);
  }
  const content = { active: false, priority: 'normal', text: { en: '', hi: '', te: '' } };
  assert.equal((await api.request('/admin/content/advisory', { method: 'PUT', token: user.token,
    data: { content, version: 1 } })).status, 403);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_audit_events')).rows[0].n, 0);
});

test('an existing Google binding never authenticates an owner or a configured-owner mailbox', async t => {
  const api = await fixture(t, settings, { googleFetcher }); if (!api) return;
  const user = await citizen(api);
  await api.pool.query("UPDATE portal_users SET role='owner' WHERE id=$1", [user.user.id]);
  const flow = await begin(api);
  assert.equal((await exchange(api, flow, credential(flow, '111111111111111111111', 'citizen-a@example.test'))).status, 401);
  await api.pool.query("UPDATE portal_users SET role='citizen',email='owner@example.test' WHERE id=$1", [user.user.id]);
  const next = await begin(api);
  assert.equal((await exchange(api, next, credential(next, '111111111111111111111', 'different-google-address@example.test'))).status, 401);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_sessions WHERE user_id IS NOT NULL')).rows[0].n, 1);
});

test('Google logout revokes the current short-lived app session without accepting an expired or removed session', async t => {
  const api = await fixture(t, settings, { googleFetcher }); if (!api) return;
  const first = await citizen(api);
  const second = await citizen(api);
  const remaining = first.expiresAt - Math.floor(Date.now() / 1000);
  assert.ok(remaining > 1700 && remaining <= 1800);
  assert.notEqual(first.token, first.flow.token);
  assert.notEqual(first.token, second.token);
  assert.equal((await api.request('/auth/logout', { method: 'POST', token: first.token, data: {} })).status, 200);
  assert.equal((await api.request('/auth/me', { token: first.token })).status, 401);
  assert.equal((await api.request('/auth/me', { token: second.token })).status, 200);
  await api.pool.query('UPDATE portal_sessions SET expires_at=1 WHERE user_id=$1', [first.user.id]);
  assert.equal((await api.request('/cases', { token: second.token })).status, 401);
  const fresh = await citizen(api);
  await api.pool.query('DELETE FROM portal_sessions WHERE user_id=$1', [fresh.user.id]);
  assert.equal((await api.request('/cases', { token: fresh.token })).status, 401);
});

test('Google flow tokens cannot be swapped between parallel browser challenges', async t => {
  const api = await fixture(t, settings, { googleFetcher }); if (!api) return;
  const first = await begin(api), second = await begin(api);
  const assertion = credential(first, '111111111111111111111', 'citizen-a@example.test');
  assert.equal((await exchange(api, { ...first, token: second.token }, assertion)).status, 401);
  assert.equal((await exchange(api, { ...first, nonce: second.nonce }, assertion)).status, 401);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_users')).rows[0].n, 0);
  assert.equal((await exchange(api, first, assertion)).status, 200);
  assert.equal((await exchange(api, first, assertion)).status, 401);
  assert.equal((await api.request('/cases', { token: first.token })).status, 401);
});

test('a failed Google login transaction rolls back identity, user, replay and session writes together', async t => {
  const api = await fixture(t, settings, { googleFetcher }); if (!api) return;
  const flow = await begin(api), assertion = credential(flow, '111111111111111111111', 'citizen-a@example.test');
  await api.pool.query("ALTER TABLE portal_login_events ADD CONSTRAINT independent_reject_google CHECK (reason <> 'google_verified_oidc') NOT VALID");
  const rejected = await exchange(api, flow, assertion);
  assert.equal(rejected.status, 503);
  assert.equal(rejected.json.error.code, 'msg_request_failed');
  assert.ok(!JSON.stringify(rejected.json).includes('independent_reject_google'));
  for (const table of ['portal_users', 'portal_google_identities', 'portal_google_credential_uses']) {
    assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM ' + table)).rows[0].n, 0);
  }
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_sessions WHERE user_id IS NOT NULL')).rows[0].n, 0);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_challenges WHERE consumed_at IS NOT NULL')).rows[0].n, 0);
  await api.pool.query('ALTER TABLE portal_login_events DROP CONSTRAINT independent_reject_google');
  assert.equal((await exchange(api, flow, assertion)).status, 200);
});
