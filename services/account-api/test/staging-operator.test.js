import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { digest } from '../src/crypto.js';
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
  STAGING_OPERATOR_SESSION_KEY: 'S'.repeat(64),
  STAGING_OPERATOR_OTP_KEY: 'O'.repeat(64),
  STAGING_OPERATOR_TOTP_KEY: 'T'.repeat(64),
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
  // Assert directly against the existing rate-bucket table.
  const rateUse = async scope => {
    const key = digest(env().STAGING_OPERATOR_OTP_KEY, 'operator:rate', scope);
    const result = await api.pool.query(
      'SELECT COALESCE(SUM(count),0)::int AS attempts FROM portal_rate_buckets WHERE key=$1', [key]);
    return result.rows[0].attempts;
  };

  // Unverified identity claims must not consume the approved owner's
  // nonprivileged Google-proof rate budget either.
  for (let i = 0; i < 13; i++) {
    const nonce = await request(op, '/identity-challenge', {});
    assert.equal(nonce.status, 200);
    const denied = await request(op, '/identity-proof', {
      ...credentials(nonce.json.data, 'forged') });
    assert.equal(denied.status, 401);
  }
  assert.equal(await rateUse('operator-identity-proof'), 0);
  const approvedNonce = await request(op, '/identity-challenge', {});
  assert.equal(approvedNonce.status, 200);
  const verifiedIdentity = await request(op, '/identity-proof', credentials(approvedNonce.json.data));
  assert.equal(verifiedIdentity.status, 200);
  assert.equal(verifiedIdentity.json.data.operatorEnrolled, false);
  assert.equal(await rateUse('operator-identity-proof'), 1);
  assert.equal(await rateUse('login'), 0);

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

  // Bad public bootstrap attempts must not spend the private owner's budget.
  for (let i = 0; i < 14; i++) {
    const denial = await challenge(op);
    const rejected = await request(op, '/begin', {
      ...credentials(denial), approvalKey: 'wrong-approval',
      password: ownerPassword, confirmPassword: ownerPassword });
    assert.equal(rejected.status, 401);
  }
  assert.equal(await rateUse('begin'), 0);

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

  // Forged Google assertions cannot consume the owner's 8-attempt login budget.
  for (let i = 0; i < 12; i++) {
    const denial = await challenge(op);
    const rejected = await request(op, '/login', {
      ...credentials(denial, 'forged'), password: ownerPassword, code: '000000' });
    assert.equal(rejected.status, 401);
  }
  assert.equal(await rateUse('login'), 0, 'unverified Google proofs cannot lock owner out');

  // Enrollment consumes the first counter. A later valid code is required.
  proof = await challenge(op);
  const bearer = await request(op, '/login', {
    ...credentials(proof), password: ownerPassword,
    code: codeFor(enrolled.json.data.secret, timeStep + 1) });
  assert.equal(bearer.status, 200);
  assert.equal(bearer.json.data.mfaVerified, true);
  const ownerAdmin = await api.request('/admin/summary', { token: bearer.json.data.token });
  assert.notEqual(ownerAdmin.status, 200, 'operator bearer must not authenticate on citizen API');
  const operatorSummary = await op.app.request('/operator/v1/summary', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  assert.equal(operatorSummary.status, 200);
  const citizenSummary = await op.app.request('/operator/v1/summary', {
    headers: { Authorization: 'Bearer ' + a.token, Origin: origin } });
  assert.equal(citizenSummary.status, 401);

  // Workspace APIs require an independently verified operator bearer.
  const workspacePaths = ['/workspace/summary', '/workspace/users', '/workspace/events',
    '/workspace/sessions', '/workspace/audit', '/workspace/cases', '/workspace/users/' + a.user.id + '/cases'];
  for (const path of workspacePaths) {
    const approved = await op.app.request('/operator/v1' + path, {
      headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
    assert.equal(approved.status, 200, path + ' authorized');
    const denied = await op.app.request('/operator/v1' + path, {
      headers: { Authorization: 'Bearer ' + b.token, Origin: origin } });
    assert.equal(denied.status, 401, path + ' citizen token denied');
    const anonymous = await op.app.request('/operator/v1' + path, { headers: { Origin: origin } });
    assert.equal(anonymous.status, 401, path + ' anonymous denied');
  }
  const overview = await op.app.request('/operator/v1/workspace/summary', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  assert.equal((await overview.json()).data.citizens, 2);
  const usersPage = await op.app.request('/operator/v1/workspace/users?q=citizen-a%40example.test', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  const userRows = (await usersPage.json()).data.items;
  assert.equal(userRows.length, 1);
  assert.equal(userRows[0].case_count, 1);
  assert.equal(userRows[0].case_references[0], aCase.json.data.case.reference);
  assert.ok(!('password_hash' in userRows[0]) && !('totp_secret' in userRows[0]));
  assert.ok(Number.isSafeInteger(userRows[0].version));
  const ownerChangeUser = async (id, payload, token = bearer.json.data.token) =>
    op.app.request('/operator/v1/workspace/users/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, Origin: origin },
      body: JSON.stringify(payload),
    });
  const citizenId = a.user.id, currentVersion = userRows[0].version;
  const bannedChange = await ownerChangeUser(citizenId, { active: false, version: currentVersion }, b.token);
  assert.equal(bannedChange.status, 401, 'citizen bearer cannot change account status');
  const ownerId = (await api.pool.query(
    "SELECT id FROM portal_users WHERE role='owner'")).rows[0].id;
  assert.equal((await ownerChangeUser(ownerId, { active: false, version: 1 })).status, 403);
  assert.equal((await ownerChangeUser(citizenId, { active: false, version: 999 })).status, 409);
  const disabled = await ownerChangeUser(citizenId, { active: false, version: currentVersion });
  assert.equal(disabled.status, 200);
  assert.equal((await disabled.json()).data.user.changed, true);
  assert.equal((await api.request('/cases', { token: a.token })).status, 401);
  const preserved = await api.pool.query('SELECT count(*)::int AS n FROM portal_sessions WHERE user_id=$1',
    [citizenId]);
  assert.ok(preserved.rows[0].n > 0, 'session history is preserved');
  const restored = await ownerChangeUser(citizenId, { active: true, version: currentVersion + 1 });
  assert.equal(restored.status, 200);
  assert.equal((await api.request('/cases', { token: a.token })).status, 401,
    're-enabling a citizen must not revive an old session');
  assert.equal((await api.pool.query('SELECT active FROM portal_users WHERE id=$1',
    [citizenId])).rows[0].active, true);
  assert.equal((await ownerChangeUser(citizenId, { active: true, version: currentVersion + 2 })).status, 200);
  // Trimmed control characters must not bypass server input validation.
  assert.equal((await op.app.request('/operator/v1/workspace/users?q=%0A', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin },
  })).status, 400);
  for (const bad of ['/workspace/users?page=0', '/workspace/users?page=-3',
    '/workspace/events?type=other', '/workspace/sessions?page=9999',
    '/workspace/cases?status=bogus', '/workspace/cases?page=1000',
    '/workspace/cases?q=%0A']) {
    const denied = await op.app.request('/operator/v1' + bad, {
      headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
    assert.equal(denied.status, 400, bad);
  }
  // Owner case search is bound/filtered on the server, never in browser JS.
  const caseSearch = await op.app.request('/operator/v1/workspace/cases?q='
    + encodeURIComponent(aCase.json.data.case.reference) + '&status=pending', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  assert.equal(caseSearch.status, 200);
  const caseSearchData = (await caseSearch.json()).data;
  assert.equal(caseSearchData.items.length, 1);
  assert.equal(caseSearchData.items[0].reference, aCase.json.data.case.reference);
  assert.equal(caseSearchData.pageSize, 20);
  const injected = await op.app.request('/operator/v1/workspace/cases?q='
    + encodeURIComponent("' OR 1=1 --"), {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  assert.equal(injected.status, 200);
  assert.equal((await injected.json()).data.items.length, 0);

  const operatorCases = await op.app.request('/operator/v1/cases', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  assert.equal(operatorCases.status, 200);
  const listed = (await operatorCases.json()).data.cases;
  assert.equal(listed.length, 2);
  const adminRow = listed.find(x => x.id === aCase.json.data.case.id);
  assert.ok(adminRow);
  // Anonymous requests cannot exhaust the operator-only case-change budget.
  for (let i = 0; i < 31; i++) {
    const anonymous = await op.app.request('/operator/v1/cases/' + adminRow.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ status: 'in_review', version: adminRow.version,
        message: 'Unauthorized synthetic request' }),
    });
    assert.equal(anonymous.status, 401);
  }
  const update = await op.app.request('/operator/v1/cases/' + adminRow.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer.json.data.token,
      Origin: origin },
    body: JSON.stringify({ status: 'in_review', version: adminRow.version, message: 'Synthetic operator triage update' }),
  });
  assert.equal(update.status, 200);
  const forbiddenUpdate = await op.app.request('/operator/v1/cases/' + adminRow.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + b.token,
      Origin: origin },
    body: JSON.stringify({ status: 'resolved', version: adminRow.version + 1, message: 'Forbidden' }),
  });
  assert.equal(forbiddenUpdate.status, 401);
  const replayUpdate = await op.app.request('/operator/v1/cases/' + adminRow.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer.json.data.token,
      Origin: origin },
    body: JSON.stringify({ status: 'in_review', version: adminRow.version, message: 'Stale version' }),
  });
  assert.equal(replayUpdate.status, 409);
  // Disposable PostgreSQL fixture: exercise real server-side case pagination.
  await api.pool.query(`
    INSERT INTO portal_complaints(
      id,reference,user_id,subject,category,details,status,
      consent_at,created_at,updated_at,version)
    SELECT md5('synthetic-page-' || g::text),
      'CS-SYN-PAGE-' || lpad(g::text,3,'0'),$1,
      'Synthetic pagination case ' || g::text,'other',
      'Safe fictional pagination fixture', 'pending',
      1750000000,1750000000 + g,1750000000 + g,1
    FROM generate_series(1,23) AS g`, [a.user.id]);
  const getPage = async page => {
    const response = await op.app.request('/operator/v1/workspace/cases?'
      + 'q=CS-SYN-PAGE&status=pending&page=' + page, {
      headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const pageOne = await getPage(1), pageTwo = await getPage(2);
  assert.equal(pageOne.items.length, 20);
  assert.equal(pageOne.hasMore, true);
  assert.equal(pageTwo.items.length, 3);
  assert.equal(pageTwo.hasMore, false);
  assert.equal(new Set([...pageOne.items,...pageTwo.items].map(x => x.id)).size, 23);

  const logout = await request(op, '/logout', {});
  assert.equal(logout.status, 401, 'logout must require bearer');
  const authorizedLogout = await op.app.request('/operator/v1/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer.json.data.token,
      Origin: origin }, body: '{}' });
  assert.equal(authorizedLogout.status, 200);
  const revoked = await op.app.request('/operator/v1/summary', {
    headers: { Authorization: 'Bearer ' + bearer.json.data.token, Origin: origin } });
  assert.equal(revoked.status, 401);
  assert.equal((await api.request('/admin/summary', { token: b.token })).status, 403);
  assert.equal((await api.request('/cases/' + aCase.json.data.case.id, { token: b.token })).status, 404);
  const after = (await api.pool.query("SELECT reference,user_id,status FROM portal_complaints WHERE reference NOT LIKE 'CS-SYN-PAGE-%' ORDER BY reference")).rows;
  assert.deepEqual(after.filter(x => x.reference !== aCase.json.data.case.reference),
    before.filter(x => x.reference !== aCase.json.data.case.reference));
  assert.equal(after.find(x => x.reference === aCase.json.data.case.reference).status, 'in_review');
  const linked = (await api.pool.query('SELECT google_sub,user_id FROM portal_google_identities ORDER BY google_sub')).rows;
  assert.equal(linked.length, 2);
  assert.deepEqual(linked.map(x => x.user_id).sort(), [a.user.id, b.user.id].sort());
  const audits = (await api.pool.query(
    "SELECT action FROM portal_audit_events WHERE action LIKE 'staging.owner.%' ORDER BY created_at")).rows;
  assert.deepEqual(audits.map(x => x.action).sort(),
    ['staging.owner.mfa_login', 'staging.owner.provisioned', 'staging.owner.case_updated',
      'staging.owner.citizen_disabled', 'staging.owner.citizen_enabled',
      'staging.owner.logout'].sort());


});


test('operator fails closed when credentials are absent, reused or shared with citizen keys', async t => {
  const api = await fixture(t);
  if (!api) return;
  const variants = [
    env({ STAGING_OPERATOR_SESSION_KEY: '' }),
    env({ STAGING_OPERATOR_OTP_KEY: '' }),
    env({ STAGING_OPERATOR_TOTP_KEY: '' }),
    env({ STAGING_OPERATOR_SESSION_KEY: 's'.repeat(48) }),
    env({ STAGING_OPERATOR_OTP_KEY: 'o'.repeat(48) }),
    env({ STAGING_OPERATOR_TOTP_KEY: 't'.repeat(48) }),
    env({ STAGING_OPERATOR_SESSION_KEY: 'O'.repeat(64) }),
  ];
  for (const candidate of variants) {
    const op = createStagingOperator({ env: candidate, pool: api.pool, googleVerifier });
    assert.equal((await request(op, '/challenge', {})).status, 503);
  }
});
