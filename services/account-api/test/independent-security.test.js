import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, signup, ORIGIN } from './helper.js';
import { configuration } from '../src/config.js';
import { createApi } from '../src/app.js';

const caseInput = { subject: 'Suspicious account request', category: 'account',
  details: 'An unexpected account request needs private review. No credentials were shared.', consent: true };

test('the citizen detail route requires owner MFA before granting cross-account access', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api, 'reporter@example.test');
  const owner = await signup(api, 'owner@example.test', 'Owner Example');
  const created = await api.request('/cases', { method: 'POST', data: caseInput, token: citizen.token });
  const id = created.json.data.case.id;
  const response = await api.request('/cases/' + id, { token: owner.token });
  assert.equal(response.status, 403);
  assert.equal(response.json.error.code, 'msg_mfa_required');
  assert.ok(!JSON.stringify(response.json).includes(caseInput.details));
  assert.equal((await api.request('/cases', { token: owner.token })).json.data.cases.length, 0);
  assert.equal((await api.request('/cases/' + id + '/replies', { method: 'POST',
    data: { message: 'Owner access must use the authorized administration route.' }, token: owner.token })).status, 403);
});

test('an owner role alone cannot replace the configured owner identity', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api, 'different-owner@example.test');
  await api.pool.query("UPDATE portal_users SET role='owner' WHERE id=$1", [citizen.user.id]);
  for (const path of ['/admin/summary', '/admin/users', '/admin/cases', '/admin/content']) {
    const response = await api.request(path, { token: citizen.token });
    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, 'msg_forbidden');
  }
});

test('cookies and near-match origins cannot authorize a private API request', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  assert.equal((await api.request('/cases', { headers: { Cookie: 'session=' + citizen.token } })).status, 401);
  for (const origin of [ORIGIN + '.attacker.example', ORIGIN + '/', 'http://rk-hud.github.io', 'null']) {
    const response = await api.request('/cases', { token: citizen.token, origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
});

test('unexpected infrastructure errors return a stable code without exception details', async () => {
  const marker = 'private-database-diagnostic-marker';
  const pool = { query: async () => { throw new Error(marker); } };
  const config = configuration({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@example.test',
    API_SESSION_KEY: 's'.repeat(48), API_OTP_KEY: 'o'.repeat(48), ALLOWED_ORIGINS: ORIGIN });
  const api = createApi({ pool, config });
  const response = await api.app.request('/api/v1/public/content', { headers: { Origin: ORIGIN } });
  assert.equal(response.status, 503);
  const output = await response.text();
  assert.ok(!output.includes(marker));
  assert.ok(!output.includes('Error:'));
  assert.equal(JSON.parse(output).error.code, 'msg_request_failed');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
