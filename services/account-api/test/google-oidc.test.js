import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGoogleCredential, googleCredentialFingerprint } from '../src/google-oidc.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', kty: 'RSA', alg: 'RS256', use: 'sig' };
const clientId = '12345-myapp.apps.googleusercontent.com', nonce = 'a'.repeat(48), secs = Math.floor(Date.now() / 1000);
const payload = { iss: 'https://accounts.google.com', aud: clientId, sub: '123456789012345678901',
  email: 'citizen@gmail.com', email_verified: true, nonce, iat: secs - 10, exp: secs + 1200, name: 'Citizen Example' };
function makeToken(p = payload, h = { alg: 'RS256', kid: 'test-key' }) {
  const head = Buffer.from(JSON.stringify(h)).toString('base64url');
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return head + '.' + body + '.' + sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString('base64url');
}
const fetcher = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const check = (p = payload, h) => verifyGoogleCredential(makeToken(p, h), { clientId, nonce, fetcher });
test('valid signed Google credential verifies', async () => {
  const result = await check();
  assert.equal(result.subject, payload.sub);
  assert.equal(result.email, payload.email);
});
test('wrong audience rejected', async () => assert.rejects(check({ ...payload, aud: 'wrong' })));
test('wrong nonce rejected', async () => assert.rejects(check({ ...payload, nonce: 'b'.repeat(48) })));
test('email not verified rejected', async () => assert.rejects(check({ ...payload, email_verified: false })));
test('expired credential rejected', async () => assert.rejects(check({ ...payload, exp: secs - 1 })));
test('future-issued credential rejected', async () => assert.rejects(check({ ...payload, iat: secs + 300 })));
test('incorrect issuer rejected', async () => assert.rejects(check({ ...payload, iss: 'https://evil.example' })));
test('none algorithm rejected', async () => assert.rejects(check(payload, { alg: 'none', kid: 'test-key' })));
test('modified credential rejected', async () => {
  const token = makeToken();
  await assert.rejects(verifyGoogleCredential(token.slice(0, -2) + 'aa', { clientId, nonce, fetcher }));
});
test('fingerprints are deterministic', () => assert.equal(googleCredentialFingerprint(makeToken()), googleCredentialFingerprint(makeToken())));
