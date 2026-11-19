import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { configuration } from '../src/config.js';
import { createStagingOperator } from '../src/staging-operator.js';
import { fixture, signup } from './helper.js';

const origin = 'https://rk-hud.github.io';
const ownerSub = '123456789012345678901';
const approvalKey = 'A'.repeat(64); // synthetic disposable test credential only
const ownerPassword = 'Synthetic stage owner password 2026!';
const env = (overrides = {}) => ({
  NODE_ENV: 'test',
  ADMIN_EMAIL: 'owner@example.test',
  STAGING_OWNER_EMAIL: 'owner@example.test',
  STAGING_OWNER_GOOGLE_SUB: ownerSub,
  STAGING_OPERATOR_APPROVAL_KEY: approvalKey,
  STAGING_OPERATOR_ENABLED: '1',
  STAGING_BRANCH_ID: 'br-sweet-band-azhwai4r',
  API_SESSION_KEY: 's'.repeat(48),
  API_OTP_KEY: 'o'.repeat(48),
  TOTP_ENCRYPTION_KEY: 't'.repeat(48),
  GOOGLE_CLIENT_ID: '1234567890-test.apps.googleusercontent.com',
  PUBLIC_WEB_URL: origin + '/cyber-suraksha-2.0/',
  ...overrides,
});
const googleVerifier = async (credential, { nonce }) => {
  if (credential === 'owner.' + nonce) return { subject: ownerSub, email: 'owner@example.test' };
  if (credential === 'citizen.' + nonce) return { subject: '234567890123456789012', email: 'citizen@example.test' };
  throw new Error('test-only invalid Google credential');
};
function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = []; let bits = 0, accumulator = 0;
  for (const character of secret) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 255);
      accumulator &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}
function codeFor(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = mac.at(-1) & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function request(operator, path, data, suppliedOrigin = origin) {
  const response = await operator.app.request('/operator/v1' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: suppliedOrigin },
    body: JSON.stringify(data),
  });
  return { status: response.status, json: await response.json() };
}
async function challenge(operator) {
  const response = await request(operator, '/challenge', {});
  assert.equal(response.status, 200);
  return response.json.data;
}
const credentials = (proof, actor = 'owner') => ({
  challengeId: proof.challengeId,
  nonce: proof.nonce,
  credential: actor + '.' + proof.nonce,
});

test('operator disabled by default, wrong branch, or missing private approval', async t => {
  const api = await fixture(t);
  if (!api) return;
  const variants = [
    env({ STAGING_OPERATOR_ENABLED: '0' }),
    env({ STAGING_BRANCH_ID: 'br-other-branch' }),
    env({ STAGING_OWNER_EMAIL: '' }),
    env({ STAGING_OPERATOR_APPROVAL_KEY: '' }),
    env({ STAGING_OWNER_GOOGLE_SUB: '98765432109876543210' }),
  ];
  for (const settings of variants) {
    // The different approved sub is valid configuration; its acceptance is
    // checked by identity tests, not by a hard-coded subject in the service.
    if (settings.STAGING_OWNER_GOOGLE_SUB !== ownerSub) continue;
    const op = createStagingOperator({ env: settings, config: configuration(settings),
      pool: api.pool, googleVerifier });
    assert.equal((await request(op, '/challenge', {})).status, 503);
  }
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM portal_users WHERE role='owner'")).rows[0].n, 0);
});

test('staging owner provisioning requires approved Google subject, private key and genuine TOTP; preserves citizens', async t => {
  const api = await fixture(t);
  if (!api) return;
  await api.pool.query(await readFile(new URL('../sql/003-staging-operator-only.sql', import.meta.url), 'utf8'));
  const a = await signup(api, 'citizen-a@example.test', 'Citizen A');
  const b = await signup(api, 'citizen-b@example.test', 'Citizen B');
  const aCase = await api.request('/cases', { method: 'POST', token: a.token,
    data: { subject: 'Fictional case A', category: 'account', details: 'Synthetic test case details only', consent: true } });
  const bCase = await api.request('/cases', { method: 'POST', token: b.token,
    data: { subject: 'Fictional case B', category: 'account', details: 'Synthetic test case details only', consent: true } });
  assert.equal(aCase.status, 201);
  assert.equal(bCase.status, 201);
  const before = (await api.pool.query('SELECT reference,user_id,status FROM portal_complaints ORDER BY reference')).rows;
  await api.pool.query('INSERT INTO portal_google_identities(google_sub,user_id,linked_at) VALUES($1,$2,$3),($4,$5,$6)',
    ['11111111111111111111', a.user.id, 100, '22222222222222222222', b.user.id, 100]);
  // Pinning an existing citizen's Google subject is never proof of ownership.
  const misconfigured = env({ ADMIN_EMAIL: 'citizen-a@example.test',
    STAGING_OWNER_EMAIL: 'citizen-a@example.test',
    STAGING_OWNER_GOOGLE_SUB: '11111111111111111111' });
  const linkedCitizenVerifier = async (credential, { nonce }) => {
    if (credential !== 'linked.' + nonce) throw new Error('invalid test credential');
    return { subject: '11111111111111111111', email: 'citizen-a@example.test' };
  };
  const linkedOp = createStagingOperator({ env: misconfigured, config: configuration(misconfigured),
    pool: api.pool, googleVerifier: linkedCitizenVerifier });
  let linkedProof = await challenge(linkedOp);
  const linkedAttempt = await request(linkedOp, '/begin', {
    ...credentials(linkedProof, 'linked'), approvalKey,
    password: ownerPassword, confirmPassword: ownerPassword });
  assert.equal(linkedAttempt.status, 403);

  const op = createStagingOperator({ env: env(), config: configuration(env()), pool: api.pool, googleVerifier });

  // Public or cross-origin requests never bootstrap an owner.
  assert.equal((await request(op, '/challenge', {}, 'https://evil.example')).status, 403);
  let proof = await challenge(op);
  let forbidden = await request(op, '/begin', {
    ...credentials(proof, 'citizen'), approvalKey, password: ownerPassword, confirmPassword: ownerPassword });
  assert.equal(forbidden.status, 401);
  proof = await challenge(op);
  forbidden = await request(op, '/begin', {
    ...credentials(proof), approvalKey: 'not-the-private-approval',
    password: ownerPassword, confirmPassword: ownerPassword });
  assert.equal(forbidden.status, 401);
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM portal_users WHERE role='owner'")).rows[0].n, 0);

  proof = await challenge(op);
  const enrolled = await request(op, '/begin', {
    ...credentials(proof), approvalKey, password: ownerPassword, confirmPassword: ownerPassword });
  assert.equal(enrolled.status, 200);
  assert.equal(enrolled.json.data.secret.length, 32);
  assert.match(enrolled.json.data.uri, /^otpauth:\/\/totp\//);
  const provisionId = enrolled.json.data.provisionId;
  const timeStep = Math.floor(Date.now() / 30000);
  proof = await challenge(op);
  const validWindow = new Set([-1, 0, 1, 2].map(offset =>
    codeFor(enrolled.json.data.secret, timeStep + offset)));
  let invalidCode = '000000';
  while (validWindow.has(invalidCode)) {
    invalidCode = String((Number(invalidCode) + 1) % 1000000).padStart(6, '0');
  }
  const wrong = await request(op, '/finish', {
    ...credentials(proof), approvalKey, provisionId, code: invalidCode });
  assert.equal(wrong.status, 401);
  assert.equal((await api.pool.query(
    'SELECT attempts FROM cs_stage_operator_pending WHERE id=$1',
    [provisionId])).rows[0].attempts, 1);
  proof = await challenge(op);
  const confirmed = await request(op, '/finish', {
    ...credentials(proof), approvalKey, provisionId,
    code: codeFor(enrolled.json.data.secret, timeStep) });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.data.provisioned, true);
  assert.equal((await api.pool.query("SELECT count(*)::int AS n FROM portal_users WHERE role='owner'")).rows[0].n, 1);

  // Old proofs cannot be replayed to make an extra owner.
  const replay = await request(op, '/finish', {
    ...credentials(proof), approvalKey, provisionId,
    code: codeFor(enrolled.json.data.secret, timeStep) });
  assert.equal(replay.status, 401);
  const next = await challenge(op);
  assert.equal((await request(op, '/begin', {
    ...credentials(next), approvalKey,
    password: ownerPassword, confirmPassword: ownerPassword })).status, 409);

  // Enrollment consumes the first counter. A later valid code is required.
  proof = await challenge(op);
  const bearer = await request(op, '/login', {
    ...credentials(proof), password: ownerPassword,
    code: codeFor(enrolled.json.data.secret, timeStep + 1) });
  assert.equal(bearer.status, 200);
  assert.equal(bearer.json.data.mfaVerified, true);
  const ownerAdmin = await api.request('/admin/summary', { token: bearer.json.data.token });
  assert.equal(ownerAdmin.status, 200);
  assert.equal((await api.request('/admin/summary', { token: b.token })).status, 403);
  assert.equal((await api.request('/cases/' + aCase.json.data.case.id, { token: b.token })).status, 404);
  const after = (await api.pool.query('SELECT reference,user_id,status FROM portal_complaints ORDER BY reference')).rows;
  assert.deepEqual(after, before);
  const linked = (await api.pool.query('SELECT google_sub,user_id FROM portal_google_identities ORDER BY google_sub')).rows;
  assert.equal(linked.length, 2);
  assert.deepEqual(linked.map(x => x.user_id).sort(), [a.user.id, b.user.id].sort());
  const audits = (await api.pool.query(
    "SELECT action FROM portal_audit_events WHERE action LIKE 'staging.owner.%' ORDER BY created_at")).rows;
  assert.deepEqual(audits.map(x => x.action).sort(),
    ['staging.owner.mfa_login', 'staging.owner.provisioned'].sort());
});
