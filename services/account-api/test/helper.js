import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { configuration } from '../src/config.js';
import { createPool } from '../src/db.js';
import { createApi, seedContent } from '../src/app.js';

export const ORIGIN = 'https://rk-hud.github.io';
export const PASSWORD = 'Test site password 4821!';
export async function fixture(t, overrides = {}, dependencies = {}) {
  let supplied;
  if (process.env.TEST_DATABASE_URL) {
    const direct = new URL(process.env.TEST_DATABASE_URL);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(direct.hostname)) throw new Error('TEST_DATABASE_URL must target disposable loopback PostgreSQL');
    supplied = { DATABASE_URL: direct.href };
  } else if (process.env.PORTAL_TEST_CONFIG) {
    supplied = JSON.parse(await readFile(process.env.PORTAL_TEST_CONFIG, 'utf8'));
  } else {
    if (process.env.REQUIRE_DB_TESTS === '1') throw new Error('Disposable PostgreSQL configuration is required for this test run');
    t.skip('Set TEST_DATABASE_URL or PORTAL_TEST_CONFIG to run disposable PostgreSQL API tests');
    return null;
  }
  const target = new URL(supplied.DATABASE_URL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('Tests require disposable loopback PostgreSQL');
  // Every test uses and cleans only its own random schema in a local disposable database.
  const schema = 'csapi_test_' + randomBytes(12).toString('hex');
  const env = { ...supplied, NODE_ENV: 'test', ADMIN_EMAIL: 'owner@example.test',
    API_SESSION_KEY: 's'.repeat(48), API_OTP_KEY: 'o'.repeat(48), TOTP_ENCRYPTION_KEY: 't'.repeat(48),
    REGISTRATION_ENABLED: '1', EMAIL_READY: '0', PUBLIC_WEB_URL: ORIGIN + '/cyber-suraksha-2.0/', ...overrides };
  const control = createPool(configuration(env));
  let api;
  try {
    await control.query('CREATE SCHEMA "' + schema + '"');
    target.searchParams.set('options', '-csearch_path=' + schema);
    env.DATABASE_URL = target.href;
    const config = configuration(env), pool = createPool(config);
    await pool.query(await readFile(new URL('../sql/001-existing-portal.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(new URL('../sql/002-google-citizen-auth.sql', import.meta.url), 'utf8'));
    await seedContent(pool);
    const mailbox = [];
    const transport = async message => { mailbox.push(message); };
    api = createApi({ config, pool, testTransport: overrides.NO_MAIL ? undefined : transport, ...dependencies });
    api.mailbox = mailbox;
    api.request = async (path, { method = 'GET', data, token, origin = ORIGIN, headers = {} } = {}) => {
      const response = await api.app.request('/api/v1' + path, { method,
        headers: { ...(origin !== null ? { Origin: origin } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
      return { status: response.status, headers: response.headers, json: await response.json().catch(() => null) };
    };
    api.code = address => {
      const mail = [...mailbox].reverse().find(message => message.recipient === address && !message.identity);
      if (!mail) throw new Error('Expected captured verification message');
      return /\b[0-9]{6}\b/.exec(mail.body)[0];
    };
    t.after(async () => {
      await pool.end();
      await control.query('DROP SCHEMA "' + schema + '" CASCADE');
      await control.end();
    });
    return api;
  } catch (error) {
    await api?.pool.end();
    await control.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => {});
    await control.end();
    throw new Error('Private PostgreSQL test fixture failed: ' + (error.code || error.constructor.name));
  }
}
export async function signup(api, address = 'citizen@example.test', name = 'Citizen Example') {
  const registration = await api.request('/auth/register', { method: 'POST', data: {
    name, email: address, password: PASSWORD, confirmPassword: PASSWORD, consent: true, locale: 'en' } });
  if (registration.status !== 200) throw new Error('Registration request failed: ' + registration.status + ':' + registration.json?.error?.code);
  const challenge = registration.json.data.challenge;
  const verified = await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: api.code(address) } });
  if (verified.status !== 200) throw new Error('Verification failed: ' + verified.status + ':' + verified.json?.error?.code);
  return verified.json.data;
}
export async function login(api, address, password = PASSWORD) {
  const response = await api.request('/auth/login', { method: 'POST', data: { email: address, password, locale: 'en' } });
  if (response.status !== 200) throw new Error('Login request failed: ' + response.status);
  const challenge = response.json.data.challenge;
  return (await api.request('/auth/verify', { method: 'POST', data: { challengeId: challenge.id, flowToken: challenge.token, code: api.code(address) } })).json.data;
}
