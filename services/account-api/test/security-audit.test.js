import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { fixture, signup, login, PASSWORD } from './helper.js';

const caseInput = { subject: 'Suspicious payment request', category: 'financial', details: 'A suspicious payment request was received. No money was sent.', consent: true };
const registerInput = email => ({ name: 'Citizen Example', email, password: PASSWORD, confirmPassword: PASSWORD, consent: true });

function currentTotp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0; const bytes = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function ownerWithMfa(api) {
  const owner = await signup(api, 'owner@example.test', 'Owner Example');
  const started = await api.request('/admin/mfa/start', { method: 'POST', data: {}, token: owner.token });
  assert.equal(started.status, 200);
  const confirmed = await api.request('/admin/mfa/confirm', { method: 'POST', data: { code: currentTotp(started.json.data.secret) }, token: owner.token });
  assert.equal(confirmed.status, 200);
  return { ...owner, secret: started.json.data.secret };
}

test('a citizen cannot read or reply to another citizen private case', async t => {
  const api = await fixture(t); if (!api) return;
  const first = await signup(api, 'first@example.test');
  const second = await signup(api, 'second@example.test');
  const created = await api.request('/cases', { method: 'POST', data: caseInput, token: first.token });
  assert.equal(created.status, 201);
  const id = created.json.data.case.id;
  const denied = await api.request('/cases/' + id, { token: second.token });
  assert.equal(denied.status, 404);
  assert.ok(!JSON.stringify(denied.json).includes(caseInput.details));
  assert.equal((await api.request('/cases/' + id + '/replies', { method: 'POST', data: { message: 'An unauthorized reply attempt.' }, token: second.token })).status, 404);
  assert.equal((await api.request('/cases', { token: second.token })).json.data.cases.length, 0);
  assert.equal((await api.request('/cases/' + id, { token: first.token })).json.data.events.length, 1);
});

test('owner role and a recent authenticator challenge are enforced on every administration surface', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api), owner = await signup(api, 'owner@example.test', 'Owner Example');
  for (const path of ['/admin/summary', '/admin/users', '/admin/cases', '/admin/content']) {
    assert.equal((await api.request(path, { token: citizen.token })).status, 403);
    const pending = await api.request(path, { token: owner.token });
    assert.equal(pending.status, 403); assert.equal(pending.json.error.code, 'msg_mfa_required');
  }
  assert.equal((await api.request('/admin/mfa/start', { method: 'POST', data: {}, token: citizen.token })).status, 403);
  assert.equal((await api.request('/admin/notifications/send-one', { method: 'POST', data: {}, token: owner.token })).status, 403);
});

test('MFA enrollment is durable, one-time and expires for privileged operations', async t => {
  const api = await fixture(t); if (!api) return;
  const owner = await ownerWithMfa(api);
  assert.equal((await api.request('/admin/summary', { token: owner.token })).status, 200);
  assert.equal((await api.request('/admin/mfa/start', { method: 'POST', data: {}, token: owner.token })).status, 403);
  const replay = await api.request('/admin/mfa/verify', { method: 'POST', data: { code: currentTotp(owner.secret) }, token: owner.token });
  assert.equal(replay.status, 422); assert.equal(replay.json.error.code, 'msg_mfa_invalid');
  const listed = await api.request('/admin/users', { token: owner.token });
  assert.equal(listed.status, 200); assert.equal(listed.json.data.users[0].totpEnabled, true);
  assert.ok(!JSON.stringify(listed.json).includes(owner.secret));
  await api.pool.query('UPDATE portal_sessions SET mfa_at=1 WHERE user_id=$1', [owner.user.id]);
  assert.equal((await api.request('/admin/summary', { token: owner.token })).status, 403);
});

test('a concurrently replayed correct OTP creates only one authenticated session', async t => {
  const api = await fixture(t); if (!api) return;
  const email = 'parallel@example.test';
  const issued = await api.request('/auth/register', { method: 'POST', data: registerInput(email) });
  const challenge = issued.json.data.challenge;
  const data = { challengeId: challenge.id, flowToken: challenge.token, code: api.code(email) };
  const responses = await Promise.all(Array.from({ length: 5 }, () => api.request('/auth/verify', { method: 'POST', data })));
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.ok(responses.filter(response => response.status !== 200).every(response => response.status === 422));
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_users')).rows[0].n, 1);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_sessions WHERE user_id IS NOT NULL')).rows[0].n, 1);
});

test('OTP challenges are bound to their own flow token and cannot be swapped', async t => {
  const api = await fixture(t); if (!api) return;
  const first = (await api.request('/auth/register', { method: 'POST', data: registerInput('flow-one@example.test') })).json.data.challenge;
  const second = (await api.request('/auth/register', { method: 'POST', data: registerInput('flow-two@example.test') })).json.data.challenge;
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: first.id, flowToken: second.token, code: api.code('flow-one@example.test') } })).status, 422);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_users')).rows[0].n, 0);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: first.id, flowToken: first.token, code: api.code('flow-one@example.test') } })).status, 200);
});

test('password reset revokes active sessions and previously password-validated login challenges', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  const pending = await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: PASSWORD } });
  const loginChallenge = pending.json.data.challenge, loginCode = api.code(citizen.user.email);
  const reset = await api.request('/auth/forgot', { method: 'POST', data: { email: citizen.user.email } });
  const resetChallenge = reset.json.data.challenge, newPassword = 'Replacement site password 8391!';
  assert.equal((await api.request('/auth/reset', { method: 'POST', data: { challengeId: resetChallenge.id, flowToken: resetChallenge.token, code: api.code(citizen.user.email), password: newPassword, confirmPassword: newPassword } })).status, 200);
  assert.equal((await api.request('/auth/me', { token: citizen.token })).status, 401);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: loginChallenge.id, flowToken: loginChallenge.token, code: loginCode } })).status, 422);
  assert.equal((await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: PASSWORD } })).status, 401);
  assert.ok((await login(api, citizen.user.email, newPassword)).token);
});

test('client-supplied forwarding headers cannot evade the per-account login quota', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: 'Wrong separate password' },
      headers: { 'X-Forwarded-For': '203.0.113.' + attempt, 'X-Real-IP': '198.51.100.' + attempt } });
    assert.equal(response.status, 401);
  }
  const limited = await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: PASSWORD }, headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' } });
  assert.equal(limited.status, 429); assert.equal(limited.json.error.code, 'msg_rate_limited');
});

test('optimistic case versions prevent two administrators from overwriting the same update', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api), owner = await ownerWithMfa(api);
  const created = await api.request('/cases', { method: 'POST', data: caseInput, token: citizen.token });
  const id = created.json.data.case.id;
  const responses = await Promise.all(['Investigating the request.', 'Reviewing the supplied evidence.'].map(message => api.request('/admin/cases/' + id, { method: 'PATCH', token: owner.token, data: { status: 'in_review', message, version: 1 } })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const current = await api.request('/cases/' + id, { token: citizen.token });
  assert.equal(current.json.data.case.status, 'in_review'); assert.equal(current.json.data.case.version, 2); assert.equal(current.json.data.events.length, 2);
  assert.equal((await api.request('/admin/cases/' + id, { method: 'PATCH', token: citizen.token, data: { status: 'closed', message: 'Attempting to change case status.', version: 2 } })).status, 403);
});

test('disabled citizens lose their sessions and pending login challenges immediately', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api), owner = await ownerWithMfa(api);
  const pending = (await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: PASSWORD } })).json.data.challenge;
  const code = api.code(citizen.user.email);
  assert.equal((await api.request('/admin/users/' + citizen.user.id, { method: 'PATCH', token: owner.token, data: { active: false, version: citizen.user.version } })).status, 200);
  assert.equal((await api.request('/auth/me', { token: citizen.token })).status, 401);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: pending.id, flowToken: pending.token, code } })).status, 422);
  assert.equal((await api.request('/admin/users/' + owner.user.id, { method: 'PATCH', token: owner.token, data: { active: false, version: owner.user.version } })).status, 403);
});

test('a login challenge cannot survive a password-version change even if issued across the reset boundary', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  const pending = (await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: PASSWORD } })).json.data.challenge;
  const code = api.code(citizen.user.email);
  // Model a password reset winning the user-row lock before an already password-validated
  // request has inserted its challenge. Revocation alone cannot catch that insertion.
  await api.pool.query('UPDATE portal_users SET version=version+1 WHERE id=$1', [citizen.user.id]);
  const rejected = await api.request('/auth/verify', { method: 'POST', data: { challengeId: pending.id, flowToken: pending.token, code } });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.json.error.code, 'msg_code_invalid');
});
