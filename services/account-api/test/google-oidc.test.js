import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createGoogleVerifier, verifyGoogleCredential, googleCredentialFingerprint } from '../src/google-oidc.js';

const original = generateKeyPairSync('rsa', { modulusLength: 2048 });
const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...original.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const newJwk = { ...rotated.publicKey.export({ format: 'jwk' }), kid: 'rotated-key', alg: 'RS256', use: 'sig' };
const clientId = '12345-myapp.apps.googleusercontent.com', nonce = 'a'.repeat(48);
const NOW = 1800000000000, secs = NOW / 1000;
const payload = { iss: 'https://accounts.google.com', aud: clientId, sub: '123456789012345678901',
  email: 'citizen@example.test', email_verified: true, nonce, iat: secs - 10, exp: secs + 1200, name: 'Citizen Example' };
const keyResponse = (keys = [jwk], headers = {}) => new Response(JSON.stringify({ keys }), {
  headers: { 'content-type': 'application/json', 'cache-control': 'public,max-age=300', ...headers } });
function signedParts(head, body, key = original.privateKey) {
  return head + '.' + body + '.' + sign('RSA-SHA256', Buffer.from(head + '.' + body), key).toString('base64url');
}
function makeToken(p = payload, h = { alg: 'RS256', kid: 'test-key' }, key = original.privateKey) {
  return signedParts(Buffer.from(JSON.stringify(h)).toString('base64url'), Buffer.from(JSON.stringify(p)).toString('base64url'), key);
}
function verifier(fetcher = async () => keyResponse(), clock = () => NOW) {
  return createGoogleVerifier({ fetcher, clock });
}
const check = (p = payload, h) => verifier()(makeToken(p, h), { clientId, nonce });
const rejects = value => assert.rejects(value, { message: 'invalid_google_credential' });

test('valid signed Google credential verifies without returning raw claims or tokens', async () => {
  assert.deepEqual(await check(), { subject: payload.sub, email: payload.email, name: payload.name });
});
test('the documented alternate Google issuer and matching authorized presenter verify', async () => {
  assert.equal((await check({ ...payload, iss: 'accounts.google.com', azp: clientId })).subject, payload.sub);
});
for (const [name, change] of [
  ['wrong audience', { aud: 'wrong' }], ['array audience', { aud: [clientId, 'wrong'] }],
  ['different authorized presenter', { azp: 'another.apps.googleusercontent.com' }],
  ['wrong nonce', { nonce: 'b'.repeat(48) }], ['unverified email', { email_verified: false }],
  ['string verified-email claim', { email_verified: 'true' }], ['expired credential', { exp: secs }],
  ['future-issued credential', { iat: secs + 61 }], ['stale issuance', { iat: secs - 3601 }],
  ['fractional issuance', { iat: secs - 0.5 }], ['string expiry', { exp: String(secs + 60) }],
  ['unbounded lifetime', { exp: secs + 7200 }], ['expiry before issuance', { exp: secs + 1, iat: secs + 2 }],
  ['future not-before', { nbf: secs + 61 }], ['incorrect issuer', { iss: 'https://evil.example' }],
  ['numeric subject', { sub: 123456789 }], ['blank subject', { sub: '' }],
  ['invalid email', { email: 'not-an-email' }], ['email control characters', { email: 'citizen@example.test\r\nX:bad' }],
]) test(name + ' is rejected', async () => rejects(check({ ...payload, ...change })));

for (const [name, header] of [
  ['none algorithm', { alg: 'none', kid: 'test-key' }], ['wrong token type', { alg: 'RS256', kid: 'test-key', typ: 'JWE' }],
  ['unsupported critical extension', { alg: 'RS256', kid: 'test-key', crit: [] }],
  ['embedded key', { alg: 'RS256', kid: 'test-key', jwk }],
  ['attacker key URL', { alg: 'RS256', kid: 'test-key', jku: 'https://evil.example/keys' }],
  ['unencoded payload', { alg: 'RS256', kid: 'test-key', b64: false }],
]) test(name + ' is rejected before fetching keys', async () => {
  let requested = false;
  const verify = verifier(async () => { requested = true; return keyResponse(); });
  await rejects(verify(makeToken(payload, header), { clientId, nonce }));
  assert.equal(requested, false);
});
test('modified signature and a valid signature from another key are rejected', async () => {
  const value = makeToken();
  await rejects(verifier()(value.slice(0, -10) + 'A'.repeat(10), { clientId, nonce }));
  await rejects(verifier()(makeToken(payload, undefined, rotated.privateKey), { clientId, nonce }));
});
test('alternate base64url spellings cannot bypass replay fingerprints', async () => {
  const token = makeToken(), parts = token.split('.'), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const canonical = parts[2];
  const alternate = canonical.slice(0, -1) + alphabet[alphabet.indexOf(canonical.at(-1)) + 1];
  assert.deepEqual(Buffer.from(canonical, 'base64url'), Buffer.from(alternate, 'base64url'));
  parts[2] = alternate;
  assert.notEqual(googleCredentialFingerprint(token), googleCredentialFingerprint(parts.join('.')));
  await rejects(verifier()(parts.join('.'), { clientId, nonce }));
});
test('non-object and invalid UTF-8 signed JSON are rejected', async () => {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  for (const raw of [Buffer.from('null'), Buffer.from('[]'), Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125])]) {
    await rejects(verifier()(signedParts(head, raw.toString('base64url')), { clientId, nonce }));
  }
});
test('malformed credentials, client configuration and nonces fail before fetching keys', async () => {
  let requests = 0;
  const verify = verifier(async () => { requests++; return keyResponse(); });
  for (const credential of [null, 1, 'x'.repeat(8193), 'one.two', 'a.b.c=']) await rejects(verify(credential, { clientId, nonce }));
  await rejects(verify(makeToken(), { clientId: 'not-a-google-web-client', nonce }));
  await rejects(verify(makeToken(), { clientId, nonce: 'short' }));
  assert.equal(requests, 0);
});
test('key requests use only trusted HTTPS endpoint and reject redirects', async () => {
  const verify = verifier(async (url, init) => {
    assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    return { ok: true, redirected: true, body: new Response('{}').body };
  });
  await rejects(verify(makeToken(), { clientId, nonce }));
});
test('bounded key response and invalid key sets fail closed with sanitized errors', async () => {
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'jwk' });
  const bodies = [
    new Response('x'.repeat(65537)), new Response('{}', { headers: { 'content-length': '65537' } }),
    new Response('{bad-json}'), keyResponse([]), keyResponse([jwk, jwk]),
    keyResponse([{ ...jwk, alg: 'RS512' }]), keyResponse([{ ...jwk, use: 'enc' }]),
    keyResponse([{ ...jwk, ...weak }]), keyResponse([{ ...jwk, d: 'private-key-data' }]),
    new Response('provider-private-detail', { status: 503 }),
  ];
  for (const response of bodies) await rejects(verifier(async () => response)(makeToken(), { clientId, nonce }));
  await rejects(verifier(async () => { throw new Error('provider-private-detail'); })(makeToken(), { clientId, nonce }));
});
test('concurrent credentials share a single key request', async () => {
  let requests = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  const verify = verifier(async () => { requests++; await ready; return keyResponse(); });
  const attempts = Array.from({ length: 12 }, () => verify(makeToken(), { clientId, nonce }));
  release();
  const results = await Promise.all(attempts);
  assert.equal(results.length, 12); assert.equal(requests, 1);
});
test('cached known keys avoid fetches and unknown kids cannot trigger a request flood', async () => {
  let requests = 0, time = NOW;
  const verify = verifier(async () => { requests++; return keyResponse(); }, () => time);
  await verify(makeToken(), { clientId, nonce });
  await verify(makeToken(), { clientId, nonce });
  for (let index = 0; index < 6; index++) await rejects(verify(makeToken(payload, { alg: 'RS256', kid: 'unknown' + index }), { clientId, nonce }));
  assert.equal(requests, 1);
  time += 31000;
  await rejects(verify(makeToken(payload, { alg: 'RS256', kid: 'unknown-new' }), { clientId, nonce }));
  assert.equal(requests, 2);
});
test('rotated keys refresh once after cooldown without using attacker-selected URLs', async () => {
  let requests = 0, time = NOW;
  const verify = verifier(async () => { requests++; return keyResponse(requests === 1 ? [jwk] : [newJwk]); }, () => time);
  await verify(makeToken(), { clientId, nonce });
  time += 31000;
  const result = await verify(makeToken(payload, { alg: 'RS256', kid: 'rotated-key' }, rotated.privateKey), { clientId, nonce });
  assert.equal(result.subject, payload.sub); assert.equal(requests, 2);
});
test('expired caches refresh and provider failure never accepts stale keys', async () => {
  let requests = 0, time = NOW;
  const verify = verifier(async () => { requests++; if (requests > 1) throw new Error('private failure'); return keyResponse([jwk], { 'cache-control': 'max-age=30' }); }, () => time);
  await verify(makeToken(), { clientId, nonce });
  time += 31000;
  await rejects(verify(makeToken(), { clientId, nonce }));
  await rejects(verify(makeToken(), { clientId, nonce }));
  assert.equal(requests, 2);
});
test('no-store key response verifies its current request but is not retained for reuse', async () => {
  let requests = 0;
  const verify = verifier(async () => { requests++; return keyResponse([jwk], { 'cache-control': 'no-store' }); });
  await verify(makeToken(), { clientId, nonce });
  await rejects(verify(makeToken(), { clientId, nonce }));
  assert.equal(requests, 1);
});
test('separate verifier fetch dependencies cannot seed each other’s keys', async () => {
  const good = async () => keyResponse(), other = async () => keyResponse([{ ...newJwk, kid: 'test-key' }]);
  await verifyGoogleCredential(makeToken(), { clientId, nonce, now: NOW, fetcher: good });
  await rejects(verifyGoogleCredential(makeToken(), { clientId, nonce, now: NOW, fetcher: other }));
});
test('fingerprints are deterministic and do not contain raw credential text', () => {
  const value = makeToken(), hash = googleCredentialFingerprint(value);
  assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(hash, googleCredentialFingerprint(value));
  assert.equal(hash.includes(value), false);
});
