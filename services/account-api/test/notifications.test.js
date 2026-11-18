import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/app.js';
import { dispatchNotifications } from '../src/mail.js';
import { fixture, signup } from './helper.js';

const caseInput = { subject: 'Suspicious support request', category: 'account',
  details: 'Private context that must remain inside the authenticated case view.', consent: true };

test('post-commit status delivery is scheduled and uses an authenticated generic link', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  const tasks = [], delivered = [];
  api.app = createApi({ config: api.config, pool: api.pool,
    testTransport: async message => { delivered.push(message); }, schedule: promise => tasks.push(promise) }).app;
  const created = await api.request('/cases', { method: 'POST', token: citizen.token, data: caseInput });
  assert.equal(created.status, 201);
  assert.equal(tasks.length, 1);
  await Promise.all(tasks);
  assert.equal(delivered.length, 1);
  assert.ok(delivered[0].body.includes('/en/account.html#cases'));
  assert.ok(!delivered[0].body.includes(caseInput.details));
  assert.ok(!delivered[0].body.includes(created.json.data.case.id));
  const job = (await api.pool.query('SELECT status,sent_at FROM portal_notifications')).rows[0];
  assert.equal(job.status, 'sent'); assert.ok(job.sent_at);
});

test('failed background delivery does not roll back a saved private case', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api), tasks = [];
  api.app = createApi({ config: api.config, pool: api.pool,
    testTransport: async () => { throw new Error('synthetic delivery failure'); }, schedule: promise => tasks.push(promise) }).app;
  const created = await api.request('/cases', { method: 'POST', token: citizen.token, data: caseInput });
  assert.equal(created.status, 201);
  await Promise.all(tasks);
  const record = await api.request('/cases/' + created.json.data.case.id, { token: citizen.token });
  assert.equal(record.status, 200); assert.equal(record.json.data.case.details, caseInput.details);
  const job = (await api.pool.query('SELECT status,attempts,due_at FROM portal_notifications')).rows[0];
  assert.equal(job.status, 'pending'); assert.equal(job.attempts, 1);
  assert.ok(job.due_at > Math.floor(Date.now() / 1000));
});

test('an expired final notification lease becomes a visible dead job', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  await api.request('/cases', { method: 'POST', token: citizen.token, data: caseInput });
  await api.pool.query("UPDATE portal_notifications SET status='sending',attempts=6,leased_at=1");
  assert.equal(await dispatchNotifications(api, 1), 0);
  const job = (await api.pool.query('SELECT status,last_error,leased_at FROM portal_notifications')).rows[0];
  assert.equal(job.status, 'dead'); assert.equal(job.last_error, 'delivery_lease_expired'); assert.equal(job.leased_at, null);
});

test('notification dispatch respects the same global mail budget as OTP messages', async t => {
  const api = await fixture(t); if (!api) return;
  const citizen = await signup(api);
  await api.request('/cases', { method: 'POST', token: citizen.token, data: caseInput });
  // Registration has already created both the hour and day message buckets.
  await api.pool.query('UPDATE portal_rate_buckets SET count=100');
  assert.equal(await dispatchNotifications(api, 1), 0);
  const job = (await api.pool.query('SELECT status,attempts FROM portal_notifications')).rows[0];
  assert.equal(job.status, 'pending'); assert.equal(job.attempts, 0);
});
