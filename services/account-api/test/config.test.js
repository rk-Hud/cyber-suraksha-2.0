import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration } from '../src/config.js';

test('the owner identity must be explicitly configured and valid', () => {
  assert.throws(() => configuration({}), /Invalid email/);
  assert.throws(() => configuration({ ADMIN_EMAIL: 'not-an-address' }), /Invalid email/);
  assert.equal(configuration({ ADMIN_EMAIL: 'Owner@EXAMPLE.test' }).adminEmail, 'owner@example.test');
});

test('browser origins are exact HTTPS origins without paths or credentials', () => {
  const env = { ADMIN_EMAIL: 'owner@example.test' };
  for (const origin of ['http://example.test', 'https://example.test/path', 'https://user@example.test', 'https://example.test/?query=1']) {
    assert.throws(() => configuration({ ...env, ALLOWED_ORIGINS: origin }));
  }
  assert.deepEqual(configuration({ ...env, ALLOWED_ORIGINS: 'https://example.test' }).origins, ['https://example.test']);
});

test('independent signing keys and actual mail credentials are required for readiness', () => {
  const env = { ADMIN_EMAIL: 'owner@example.test', API_SESSION_KEY: 's'.repeat(48), API_OTP_KEY: 's'.repeat(48), EMAIL_READY: '1' };
  assert.equal(configuration(env).authReady, false);
  assert.equal(configuration({ ...env, API_OTP_KEY: 'o'.repeat(48) }).authReady, true);
  assert.equal(configuration(env).mailReady, false);
  assert.throws(() => configuration({ ...env, MAIL_FROM: 'sender@example.test\r\nBcc:other@example.test' }));
});
