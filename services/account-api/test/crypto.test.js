import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  decryptTotp, digest, encryptTotp, generateTotpSecret, hashPassword,
  newId, newToken, totpStep, totpUri, verifyPassword,
} from '../src/crypto.js';

// Public synthetic fixtures generated independently with Python libraries.
const key = 'fixture-crypto-key-'.repeat(3);
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const pythonVectors = [
  ['Synthetic account password 2026!', 'scrypt:32768:8:1$SelR6DnhE9NAgF4Y$6d27d10f448099e8efdd219c042390e8a77eeaea1c8bc6d19efaadf2dd15ceffe561e5d37ea6a0fc61c2b22fc71a88dbcc60508159b29e82b836664c831cf92e'],
  ['परीक्षण पासवर्ड सुरक्षा 2026!', 'scrypt:32768:8:1$jeKpGIW8jlRkhjfI$237b7bce989208d40ad38b37292db752f6e054a4dce4bc865196640d93b2ea97f5443075f6a7be3d3fb1bec19c8e45abe395b0a3101f608c26c93902dd5f9d71'],
  ['పరీక్ష ఖాతా పాస్‌వర్డ్ 2026!', 'scrypt:32768:8:1$sNkTlKLXhHdpraxV$ccae1bfee9291e6cdbcdd3533f379955860e222cf19fe57710012fbf418a680bfa397670c0ffaf657a92868b55fb270a93e98f5b68b667a40e3a91cbf3c82b8e'],
];
const pythonFernet = 'gAAAAABlU_EAOGP72zwWJuWRpNE3y-EY-6J2Q6pfYyu1A8Nk3_GIPfnAQOj2enftdLAHE11Zq5RAE-QOwBRslZrxnofT6Pp74PYYz65CdZy2UegZ8ueWcdaFg0yA_UkPqj5HgmphycWl';

for (const [password, encoded] of pythonVectors) {
  test('existing Python account hash accepts its UTF-8 password', async () => {
    assert.equal(await verifyPassword(password, encoded), true);
    assert.equal(await verifyPassword(password + 'incorrect', encoded), false);
  });
}

test('legacy bounded scrypt and PBKDF2 account hashes remain usable', async () => {
  const password = pythonVectors[0][0];
  assert.equal(await verifyPassword(password, 'scrypt:16384:8:1$C8HUjfRpKSYHnT8t$e93c398c2b255fe5173fbad0801455dd219c82e0a75cddc5a43da6d1d9a16ac9b88660238871d8164d038b068d7c1e3acdedda165716a1de4412eec057a99304'), true);
  assert.equal(await verifyPassword(password, 'pbkdf2:sha256:600000$pui7hGEz3ZLgHJSz$257a7d167f40fdcb7f057e1e404fc81b8c95f0c27307bfd324a136c832ab4401'), true);
});

test('new passwords have independent salts and expected cost', async () => {
  const left = await hashPassword(pythonVectors[0][0]);
  const right = await hashPassword(pythonVectors[0][0]);
  assert.match(left, /^scrypt:32768:8:1\$[a-zA-Z0-9]{16}\$[a-f0-9]{128}$/);
  assert.notEqual(left, right);
  assert.equal(await verifyPassword(pythonVectors[0][0], left), true);
});

test('malformed and expensive hash parameters fail before derivation', async () => {
  const valid = pythonVectors[0][1];
  for (const encoded of [
    valid.replace('32768', '1073741824'), valid.replace(':8:1', ':32:10'),
    valid.replace('scrypt:', 'scrypt:0:'), valid + '$extra',
    'pbkdf2:sha256:999999999$saltfixture$' + 'a'.repeat(64),
    'pbkdf2:sha1:600000$saltfixture$' + 'a'.repeat(64),
    valid.replace('SelR6DnhE9NAgF4Y', '../bad salt'),
    'x'.repeat(1024), '', null,
  ]) assert.equal(await verifyPassword(pythonVectors[0][0], encoded), false);
  assert.equal(await verifyPassword('bad\0password', valid), false);
  assert.equal(await verifyPassword(null, valid), false);
});

test('opaque tokens, identifiers and HMAC purpose separation', () => {
  const tokens = Array.from({ length: 100 }, newToken);
  assert.equal(new Set(tokens).size, tokens.length);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(digest(key, 'session', 'value'), digest(key, 'otp', 'value'));
  assert.notEqual(digest(key, 'session', 'value'), digest(key, 'session', 'value2'));
  assert.throws(() => digest('', 'session', 'value'), /configuration/);
  assert.throws(() => digest(key, 'session\0', 'value'), /Invalid cryptographic input/);
});

test('existing durable Python Fernet authenticator seed decrypts unchanged', () => {
  assert.equal(decryptTotp(pythonFernet, key), secret);
  const first = encryptTotp(secret, key), second = encryptTotp(secret, key);
  assert.notEqual(first, second);
  assert.equal(decryptTotp(first, key), secret);
  assert.throws(() => decryptTotp(first, 'another-fixture-key-'.repeat(3)), /Invalid authenticator secret/);
});

test('Fernet rejects tampering, truncation and malformed encoding uniformly', () => {
  const valid = Buffer.from(pythonFernet, 'base64url');
  for (const index of [0, 1, 10, 28, valid.length - 1]) {
    const modified = Buffer.from(valid); modified[index] ^= 1;
    assert.throws(() => decryptTotp(modified.toString('base64url'), key), /^Error: Invalid authenticator secret\.$/);
  }
  for (const encoded of ['', 'a'.repeat(4096), pythonFernet.slice(0, -9), pythonFernet + '%', 'AAAA']) {
    assert.throws(() => decryptTotp(encoded, key), /^Error: Invalid authenticator secret\.$/);
  }
});

test('Fernet rejects valid-MAC invalid padding and non-authenticator plaintext', () => {
  const derived = createHash('sha256').update('cybersuraksha-totp-encryption-v1\0' + key).digest();
  const header = Buffer.from(pythonFernet, 'base64url').subarray(0, 25);
  const invalidPaddingCipher = createCipheriv('aes-128-cbc', derived.subarray(16), header.subarray(9));
  invalidPaddingCipher.setAutoPadding(false);
  const paddingCiphertext = Buffer.concat([invalidPaddingCipher.update(Buffer.alloc(16)), invalidPaddingCipher.final()]);
  const plainCipher = createCipheriv('aes-128-cbc', derived.subarray(16), header.subarray(9));
  const invalidPlaintext = Buffer.concat([plainCipher.update('not an authenticator'), plainCipher.final()]);
  for (const ciphertext of [paddingCiphertext, invalidPlaintext]) {
    const body = Buffer.concat([header, ciphertext]);
    const mac = createHmac('sha256', derived.subarray(0, 16)).update(body).digest();
    assert.throws(() => decryptTotp(Buffer.concat([body, mac]).toString('base64url'), key), /^Error: Invalid authenticator secret\.$/);
  }
});

test('TOTP matches independent Python vectors and rejects consumed counters', () => {
  for (const [time, code] of [[59, '503347'], [1111111109, '088309'], [1234567890, '401544'], [2000000000, '978524']]) {
    const step = Math.floor(time / 30);
    assert.equal(totpStep(code, secret, -1, time), step);
    assert.equal(totpStep(code, secret, step, time), null);
    assert.equal(totpStep(code, secret, step + 1, time), null);
  }
  assert.equal(totpStep('401544', secret, -1, 1234567890 + 30), Math.floor(1234567890 / 30));
  assert.equal(totpStep('401544', secret, -1, 1234567890 + 90), null);
  assert.equal(totpStep('40154x', secret, -1, 1234567890), null);
  assert.equal(totpStep('401544', 'invalid-base32', -1, 1234567890), null);
});

test('generated authenticator seeds and provisioning URI are bounded and valid', () => {
  const secrets = Array.from({ length: 40 }, generateTotpSecret);
  assert.equal(new Set(secrets).size, secrets.length);
  for (const value of secrets) assert.match(value, /^[A-Z2-7]{32}$/);
  const uri = new URL(totpUri(secret, 'owner@example.test'));
  assert.equal(uri.protocol, 'otpauth:');
  assert.equal(uri.hostname, 'totp');
  assert.equal(decodeURIComponent(uri.pathname), '/CYBER SURAKSHA 2.0:owner@example.test');
  assert.equal(uri.searchParams.get('issuer'), 'CYBER SURAKSHA 2.0');
  assert.equal(uri.searchParams.get('secret'), secret);
  assert.equal(uri.searchParams.get('digits'), '6');
  assert.equal(uri.searchParams.get('period'), '30');
  assert.throws(() => totpUri(secret, 'owner@example.test\nother'), /Invalid authenticator account/);
});

const python = process.env.PYTHON_COMPAT_BIN || 'python3';
const pythonAvailable = spawnSync(python, ['-c', 'import werkzeug.security, cryptography.fernet'], { timeout: 10000 }).status === 0;
test('Node-created hashes and Fernet seed are accepted by existing Python libraries', async t => {
  if (!pythonAvailable) {
    if (process.env.PYTHON_COMPAT_BIN || process.env.REQUIRE_DB_TESTS === '1') assert.fail('Configured Python compatibility verifier is unavailable');
    t.skip('Install Python Werkzeug and cryptography for bidirectional compatibility verification');
    return;
  }
  const password = pythonVectors[2][0];
  const payload = { password, encoded: await hashPassword(password), key, token: encryptTotp(secret, key) };
  const result = spawnSync(python, ['-c', [
    'import sys,json,hashlib,base64',
    'from werkzeug.security import check_password_hash',
    'from cryptography.fernet import Fernet',
    'p=json.load(sys.stdin)',
    "derived=hashlib.sha256(b'cybersuraksha-totp-encryption-v1\\0'+p['key'].encode()).digest()",
    "assert check_password_hash(p['encoded'],p['password'])",
    "assert Fernet(base64.urlsafe_b64encode(derived)).decrypt(p['token'].encode()).decode()=='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'",
  ].join('\n')], { input: JSON.stringify(payload), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, 'Independent compatibility verification failed.');
});
