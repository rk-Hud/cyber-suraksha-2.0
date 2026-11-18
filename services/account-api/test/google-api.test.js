import test from 'node:test';
import assert from 'node:assert/strict';
import { googleApi, credential, finishGoogle, CLIENT_ID } from './google-fixture.js';
import { configuration } from '../src/config.js';
import { createApi } from '../src/app.js';
import { signup, PASSWORD } from './helper.js';

const count = async (api, table) => Number((await api.pool.query('SELECT count(*)::int AS n FROM ' + table)).rows[0].n);

test('Google registration verifies signed identity and rotates its flow into a 30-minute citizen session', async t => {
  const api = await googleApi(t); if (!api) return;
  const health = await api.request('/health');
  assert.equal(health.json.data.googleClientId, CLIENT_ID);
  assert.equal(health.json.data.features.emailOtp, false);
  const flow = await api.startGoogle('te');
  assert.match(flow.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(flow.nonce, flow.token);
  const response = await finishGoogle(api, flow);
  assert.equal(response.status, 200);
  const { user, token, expiresAt } = response.json.data;
  assert.equal(user.role, 'citizen'); assert.equal(user.language, 'te');
  assert.equal(user.totpEnabled, false); assert.notEqual(token, flow.token);
  assert.ok(expiresAt <= Math.floor(Date.now()/1000)+1800);
  assert.ok(expiresAt > Math.floor(Date.now()/1000)+1780);
  assert.equal((await api.request('/auth/me', { token })).status, 200);
  assert.equal((await api.request('/auth/me', { token: flow.token })).status, 401);
  assert.equal((await api.request('/auth/me', { token: credential(flow) })).status, 401);
  assert.equal(await count(api, 'portal_google_identities'), 1);
  assert.equal(await count(api, 'portal_google_credential_uses'), 1);
  assert.equal(await count(api, 'portal_challenges'), 0);
});

test('Google registration closed and missing consent do not create users or accept a credential', async t => {
  const closed = await googleApi(t, { GOOGLE_REGISTRATION_ENABLED: '0' }); if (!closed) return;
  const flow = await closed.startGoogle();
  assert.equal((await finishGoogle(closed, flow)).status, 403);
  assert.equal(await count(closed, 'portal_users'), 0);
  assert.equal(await count(closed, 'portal_google_credential_uses'), 0);
  const api = await googleApi(t); if (!api) return;
  const consentFlow = await api.startGoogle();
  assert.equal((await finishGoogle(api, consentFlow, {}, { consent: false })).status, 422);
  assert.equal(await count(api, 'portal_users'), 0);
  assert.equal(await count(api, 'portal_google_credential_uses'), 0);
  assert.equal((await finishGoogle(api, consentFlow)).status, 200);
});

test('a matching existing password email is never linked or replaced by Google registration', async t => {
  const api = await googleApi(t, { NO_MAIL: false, REGISTRATION_ENABLED: '1' }); if (!api) return;
  const existing = await signup(api, 'google-citizen@example.test');
  const before = (await api.pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [existing.user.id])).rows[0].password_hash;
  const flow = await api.startGoogle();
  assert.equal((await finishGoogle(api, flow)).status, 409);
  assert.equal(await count(api, 'portal_users'), 1);
  assert.equal(await count(api, 'portal_google_identities'), 0);
  assert.equal(await count(api, 'portal_google_credential_uses'), 0);
  assert.equal((await api.pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [existing.user.id])).rows[0].password_hash, before);
});

test('stable Google subject authenticates only its bound user after profile email changes', async t => {
  const api = await googleApi(t); if (!api) return;
  const first = await finishGoogle(api, await api.startGoogle());
  const second = await finishGoogle(api, await api.startGoogle(), { email: 'new-google-email@example.test', name: 'Changed Profile' });
  assert.equal(second.status, 200);
  assert.equal(second.json.data.user.id, first.json.data.user.id);
  assert.equal(second.json.data.user.email, 'google-citizen@example.test');
  assert.notEqual(second.json.data.token, first.json.data.token);
  assert.equal(await count(api, 'portal_users'), 1);
});

test('a used Google credential remains rejected even if a different pending flow is rebound to its nonce', async t => {
  const api = await googleApi(t); if (!api) return;
  const original = await api.startGoogle(), token = credential(original);
  assert.equal((await finishGoogle(api, original)).status, 200);
  const later = await api.startGoogle();
  // Recreate the same nonce only inside a disposable test schema to independently
  // exercise fingerprint uniqueness, beyond the normal flow-consumption guard.
  const { digest } = await import('../src/crypto.js');
  const row = (await api.pool.query('SELECT browser_id FROM portal_challenges WHERE id=$1', [later.id])).rows[0];
  await api.pool.query('UPDATE portal_challenges SET code_hash=$1 WHERE id=$2', [
    digest(api.config.otpKey, 'api-v1:otp', later.id+'\0'+row.browser_id+'\0google\0'+original.nonce), later.id,
  ]);
  const rejected = await api.request('/auth/google', { method: 'POST', data: {
    credential: token, nonce: original.nonce, challengeId: later.id, flowToken: later.token, consent: true,
  } });
  assert.equal(rejected.status, 401);
  assert.equal(await count(api, 'portal_google_credential_uses'), 1);
});

test('invalid credentials exhaust only their own bounded Google flow and expired flows fail', async t => {
  const api = await googleApi(t); if (!api) return;
  const flow = await api.startGoogle();
  for (let i=0;i<5;i++) assert.equal((await finishGoogle(api, flow, { aud: 'wrong-client' })).status, 401);
  assert.equal((await finishGoogle(api, flow)).status, 401);
  const expired = await api.startGoogle();
  await api.pool.query('UPDATE portal_challenges SET expires_at=1 WHERE id=$1', [expired.id]);
  assert.equal((await finishGoogle(api, expired)).status, 401);
  assert.equal(await count(api, 'portal_users'), 0);
});

test('concurrent same-flow Google callbacks create exactly one user, identity and application session', async t => {
  const api = await googleApi(t); if (!api) return;
  const flow = await api.startGoogle();
  const responses = await Promise.all([finishGoogle(api, flow), finishGoogle(api, flow)]);
  assert.deepEqual(responses.map(r=>r.status).sort(), [200,401]);
  assert.equal(await count(api, 'portal_users'), 1);
  assert.equal(await count(api, 'portal_google_identities'), 1);
  assert.equal(await count(api, 'portal_google_credential_uses'), 1);
  assert.equal(await count(api, 'portal_sessions'), 1);
});

test('concurrent fresh Google flows bind the same stable subject once and retain independent sessions', async t => {
  const api = await googleApi(t); if (!api) return;
  const flows = await Promise.all([api.startGoogle(), api.startGoogle()]);
  const responses = await Promise.all(flows.map(flow=>finishGoogle(api, flow)));
  assert.deepEqual(responses.map(r=>r.status), [200,200]);
  assert.equal(responses[0].json.data.user.id, responses[1].json.data.user.id);
  assert.notEqual(responses[0].json.data.token, responses[1].json.data.token);
  assert.equal(await count(api, 'portal_users'), 1);
  assert.equal(await count(api, 'portal_sessions'), 2);
});

test('Google-only accounts cannot gain a password through email recovery even when Google sign-in is disabled', async t => {
  const api = await googleApi(t, { NO_MAIL: false, REGISTRATION_ENABLED: '1' }); if (!api) return;
  const google = await finishGoogle(api, await api.startGoogle());
  const user = google.json.data.user;
  api.config.googleSignIn = false;
  const original = (await api.pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [user.id])).rows[0].password_hash;
  const recovery = await api.request('/auth/forgot', { method: 'POST', data: { email: user.email } });
  assert.equal(recovery.status, 200);
  const flow = recovery.json.data.challenge;
  assert.equal((await api.pool.query('SELECT user_id FROM portal_challenges WHERE id=$1', [flow.id])).rows[0].user_id, null);
  const reset = await api.request('/auth/reset', { method: 'POST', data: {
    challengeId: flow.id, flowToken: flow.token, code: api.code(user.email), password: PASSWORD, confirmPassword: PASSWORD,
  } });
  assert.equal(reset.status, 200);
  assert.equal((await api.pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [user.id])).rows[0].password_hash, original);
  // Even an operator-prepared password hash cannot convert this linked account
  // into a password login through the public API.
  const { hashPassword } = await import('../src/crypto.js');
  await api.pool.query('UPDATE portal_users SET password_hash=$1 WHERE id=$2', [await hashPassword(PASSWORD), user.id]);
  assert.equal((await api.request('/auth/login', { method: 'POST', data: { email: user.email, password: PASSWORD } })).status, 401);
  api.config.googleSignIn = true;
  assert.equal((await finishGoogle(api, await api.startGoogle())).status, 200);
});

test('Google readiness requires migrated tables and rejects a production test verifier transport', async t => {
  const api = await googleApi(t); if (!api) return;
  await api.pool.query('DROP TABLE portal_google_credential_uses');
  const health = await api.request('/health');
  assert.equal(health.json.data.features.googleSignIn, false);
  assert.equal(health.json.data.googleClientId, '');
  assert.throws(()=>createApi({ config: configuration({ ADMIN_EMAIL: 'owner@example.test' }), pool: {}, googleFetcher: async()=>{} }), /forbidden/);
});

test('valid optional Google profile names cannot block a verified citizen registration', async t => {
  const api = await googleApi(t); if (!api) return;
  const response = await finishGoogle(api, await api.startGoogle(), { name: 'A' });
  assert.equal(response.status, 200);
  assert.equal(response.json.data.user.name, 'Citizen');
});

test('reset and pending password OTP recheck Google binding before granting credentials', async t => {
  const api = await googleApi(t, { NO_MAIL: false, REGISTRATION_ENABLED: '1' }); if (!api) return;
  const existing = await signup(api, 'later-linked@example.test');
  const original = (await api.pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [existing.user.id])).rows[0].password_hash;
  const login = (await api.request('/auth/login', { method: 'POST', data: { email: existing.user.email, password: PASSWORD } })).json.data.challenge;
  const loginCode = api.code(existing.user.email);
  const recovery = (await api.request('/auth/forgot', { method: 'POST', data: { email: existing.user.email } })).json.data.challenge;
  const recoveryCode = api.code(existing.user.email);
  // Model an operator-approved future linking action in the disposable schema;
  // there is deliberately no public automatic email-linking endpoint.
  await api.pool.query('INSERT INTO portal_google_identities(google_sub,user_id,linked_at) VALUES($1,$2,$3)', ['123456789012345678901', existing.user.id, Math.floor(Date.now()/1000)]);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: {
    challengeId: login.id, flowToken: login.token, code: loginCode,
  } })).status, 422);
  assert.equal((await api.request('/auth/reset', { method: 'POST', data: {
    challengeId: recovery.id, flowToken: recovery.token, code: recoveryCode,
    password: 'Different password 3846!', confirmPassword: 'Different password 3846!',
  } })).status, 200);
  assert.equal((await api.pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [existing.user.id])).rows[0].password_hash, original);
});

test('private Google test allowlists accept only approved verified addresses and still deny the owner', async t => {
  const api = await googleApi(t, { GOOGLE_ALLOWED_EMAILS: 'google-citizen@example.test, owner@example.test' }); if (!api) return;
  assert.equal((await finishGoogle(api, await api.startGoogle(), { email: 'not-approved@example.test' })).status, 403);
  assert.equal((await finishGoogle(api, await api.startGoogle(), { email: 'owner@example.test' })).status, 403);
  assert.equal(await count(api, 'portal_users'), 0);
  const accepted = await finishGoogle(api, await api.startGoogle());
  assert.equal(accepted.status, 200);
  assert.ok(!JSON.stringify((await api.request('/health')).json).includes('google-citizen@example.test'));
});
