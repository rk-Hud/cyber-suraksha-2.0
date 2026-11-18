import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, signup, login, PASSWORD, ORIGIN } from './helper.js';
import { configuration } from '../src/config.js';
import { createMailer, dispatchNotifications } from '../src/mail.js';
import { contentValue } from '../src/validation.js';

const credentials = email => ({ name: 'Citizen Example', email, password: PASSWORD, confirmPassword: PASSWORD, consent: true });
const caseInput = { subject: 'Suspicious payment request', category: 'financial', details: 'A suspicious payment request was received. No money was sent.', consent: true };

test('registration verifies the mailbox, stores a hash, and rotates the flow token', async t => {
  const api = await fixture(t); if (!api) return;
  const response = await api.request('/auth/register', { method: 'POST', data: credentials('citizen@example.test') });
  assert.equal(response.status, 200);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_users')).rows[0].n, 0);
  const challenge = response.json.data.challenge;
  const verified = await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: api.code('citizen@example.test') } });
  assert.equal(verified.status, 200); assert.equal(verified.json.data.user.role, 'citizen');
  assert.notEqual(verified.json.data.token, challenge.token);
  const stored = (await api.pool.query('SELECT password_hash FROM portal_users')).rows[0];
  assert.ok(stored.password_hash.startsWith('scrypt:')); assert.ok(!stored.password_hash.includes(PASSWORD));
  assert.equal((await api.request('/auth/me', { token: verified.json.data.token })).status, 200);
  assert.equal((await api.request('/auth/me', { token: challenge.token })).status, 401);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: api.code('citizen@example.test') } })).status, 422);
});

test('OTP attempts are bounded and an expired correct code cannot authenticate', async t => {
  const api = await fixture(t); if (!api) return;
  const response = await api.request('/auth/register', { method: 'POST', data: credentials('attempt@example.test') });
  const challenge = response.json.data.challenge, correct = api.code('attempt@example.test');
  const wrong = correct === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: wrong } })).status, 422);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: correct } })).status, 422);
  const other = (await api.request('/auth/register', { method: 'POST', data: credentials('expired@example.test') })).json.data.challenge;
  await api.pool.query('UPDATE portal_challenges SET expires_at=1 WHERE id=$1', [other.id]);
  assert.equal((await api.request('/auth/verify', { method: 'POST', data: { challengeId: other.id, flowToken: other.token, code: api.code('expired@example.test') } })).status, 422);
});

test('correct password still requires fresh OTP and logout revokes the bearer', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  assert.equal((await api.request('/auth/logout', { method: 'POST', data: {}, token: citizen.token })).status, 200);
  assert.equal((await api.request('/auth/me', { token: citizen.token })).status, 401);
  const rejected = await api.request('/auth/login', { method: 'POST', data: { email: citizen.user.email, password: 'not-the-site-password' } });
  assert.equal(rejected.status, 401);
  const current = await login(api, citizen.user.email);
  assert.ok(current.token); assert.equal(current.user.id, citizen.user.id);
});

test('a duplicate registration never replaces the existing password or grants a session', async t => {
  const api = await fixture(t); if (!api) return;
  const original = await signup(api);
  const result = await api.request('/auth/register', { method: 'POST', data: { ...credentials(original.user.email), password: 'Different-password-8934', confirmPassword: 'Different-password-8934' } });
  const challenge = result.json.data.challenge;
  const verified = await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: api.code(original.user.email) } });
  assert.equal(verified.json.data.loginRequired, true); assert.equal(verified.json.data.token, undefined);
  assert.ok((await login(api, original.user.email)).token);
});

test('citizens submit private cases, read status history, reply and queue reference-only mail', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  const created = await api.request('/cases', { method: 'POST', data: caseInput, token: citizen.token });
  assert.equal(created.status, 201);
  const id = created.json.data.case.id;
  const detail = await api.request('/cases/' + id, { token: citizen.token });
  assert.equal(detail.json.data.events.length, 1);
  assert.equal(detail.json.data.case.details, caseInput.details);
  const reply = await api.request('/cases/' + id + '/replies', { method: 'POST', data: { message: 'Additional safe context for this support case.' }, token: citizen.token });
  assert.equal(reply.status, 200); assert.equal(reply.json.data.case.version, 2);
  assert.equal((await api.request('/cases', { token: citizen.token })).json.data.cases.length, 1);
  assert.equal(await dispatchNotifications(api, 1), 1);
  const message = api.mailbox.find(message => message.identity);
  assert.ok(message.body.includes(created.json.data.case.reference));
  assert.ok(!message.body.includes(caseInput.details));
});

test('unconfigured mail keeps registration unavailable without a bypass OTP', async t => {
  const api = await fixture(t, { NO_MAIL: true }); if (!api) return;
  const health = await api.request('/health');
  assert.equal(health.json.data.features.registration, false);
  const response = await api.request('/auth/register', { method: 'POST', data: credentials('unconfigured@example.test') });
  assert.equal(response.status, 503);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_users')).rows[0].n, 0);
  assert.equal((await api.pool.query('SELECT count(*)::int AS n FROM portal_challenges')).rows[0].n, 0);
});

test('exact CORS origin, strict JSON fields, and server authorization are enforced', async t => {
  const api = await fixture(t); if (!api) return;
  assert.equal((await api.request('/health', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await api.request('/health', { origin: 'null' })).status, 403);
  const health = await api.request('/health');
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(health.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await api.request('/auth/register', { method: 'POST', data: { ...credentials('role@example.test'), role: 'owner' } })).status, 422);
  assert.equal((await api.request('/cases')).status, 401);
  assert.equal((await api.request('/admin/summary')).status, 401);
});

test('test-only mail transport is rejected in a production process configuration', () => {
  const config = configuration({ ADMIN_EMAIL: 'owner@example.test' });
  assert.throws(() => createMailer(config, () => {}));
});

test('content references require string identifiers and exact translated shapes', () => {
  const base = { id: 'valid', acronym: 'AG', group: 'national', url: 'https://example.test/',
    name: { en: 'Agency', hi: 'संस्था', te: 'సంస్థ' }, region: { en: 'Region', hi: 'क्षेत्र', te: 'ప్రాంతం' },
    purpose: { en: 'Help', hi: 'सहायता', te: 'సహాయం' }, reporting: { en: 'Channel', hi: 'माध्यम', te: 'మార్గం' } };
  assert.equal(contentValue('resources', [base])[0].id, 'valid');
  for (const id of [null, true, 1]) assert.throws(() => contentValue('resources', [{ ...base, id }]));
  assert.throws(() => contentValue('branding', { title: 'Brand', logo_url: '//evil.example/image.svg', tagline: base.name }));
});
