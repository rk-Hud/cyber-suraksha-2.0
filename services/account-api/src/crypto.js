/** Compatibility with existing account hashes and encrypted authenticator seeds. */
import {
  createCipheriv, createDecipheriv, createHash, createHmac,
  pbkdf2 as pbkdf2Callback, randomBytes, randomInt, randomUUID,
  scrypt as scryptCallback, timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const pbkdf2 = promisify(pbkdf2Callback);
const SALT_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const FERNET_PREFIX = 'cybersuraksha-totp-encryption-v1\0';
const ISSUER = 'CYBER SURAKSHA 2.0';

function validPassword(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !value.includes('\0');
}

function equalBytes(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireKey(key) {
  if (typeof key !== 'string' || key.length < 32 || key.length > 4096) {
    throw new Error('Cryptographic configuration is unavailable.');
  }
  return key;
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function newId() {
  return randomUUID();
}

export function digest(key, purpose, value) {
  requireKey(key);
  if (typeof purpose !== 'string' || !/^[a-z0-9:-]{1,64}$/i.test(purpose)
      || typeof value !== 'string') throw new Error('Invalid cryptographic input.');
  return createHmac('sha256', key).update(purpose + '\0' + value, 'utf8').digest('hex');
}

export async function hashPassword(password) {
  if (!validPassword(password)) throw new Error('Invalid password input.');
  const salt = Array.from({ length: 16 }, () => SALT_ALPHABET[randomInt(SALT_ALPHABET.length)]).join('');
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return 'scrypt:32768:8:1$' + salt + '$' + derived.toString('hex');
}

export async function verifyPassword(password, encoded) {
  if (!validPassword(password) || typeof encoded !== 'string' || encoded.length > 512) return false;
  const fields = encoded.split('$');
  if (fields.length !== 3 || !/^[a-zA-Z0-9_-]{8,64}$/.test(fields[1])) return false;
  const [method, salt, hash] = fields;
  try {
    let derived;
    const parameters = method.split(':');
    if (parameters[0] === 'scrypt' && parameters.length === 4) {
      // A persisted hash is still untrusted input. Bound work before deriving.
      if (!['16384', '32768', '65536'].includes(parameters[1])
          || parameters[2] !== '8' || parameters[3] !== '1'
          || !/^[a-f0-9]{128}$/.test(hash)) return false;
      derived = await scrypt(password, salt, 64, {
        N: Number(parameters[1]), r: 8, p: 1, maxmem: 128 * 1024 * 1024,
      });
    } else if (parameters[0] === 'pbkdf2' && parameters.length === 3
        && parameters[1] === 'sha256' && /^[1-9][0-9]{4,6}$/.test(parameters[2])
        && Number(parameters[2]) >= 100000 && Number(parameters[2]) <= 2000000
        && /^[a-f0-9]{64}$/.test(hash)) {
      derived = await pbkdf2(password, salt, Number(parameters[2]), 32, 'sha256');
    } else return false;
    return equalBytes(derived, Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function decodeBase32(secret) {
  if (typeof secret !== 'string' || !/^[A-Z2-7]{16,128}$/.test(secret)
      || ![0, 2, 4, 5, 7].includes(secret.length % 8)) {
    throw new Error('Invalid authenticator secret.');
  }
  const bytes = [];
  let bits = 0, accumulator = 0;
  for (const character of secret) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 255);
      accumulator &= (1 << bits) - 1;
    }
  }
  if (bits && accumulator !== 0) throw new Error('Invalid authenticator secret.');
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  const source = randomBytes(20);
  let output = '', accumulator = 0, bits = 0;
  for (const byte of source) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(accumulator >>> bits) & 31];
    }
    accumulator &= (1 << bits) - 1;
  }
  if (bits) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return output;
}

function authenticatorKeys(key) {
  const material = createHash('sha256').update(FERNET_PREFIX, 'utf8').update(requireKey(key), 'utf8').digest();
  return { signing: material.subarray(0, 16), encryption: material.subarray(16) };
}

export function encryptTotp(secret, key) {
  decodeBase32(secret);
  const { signing, encryption } = authenticatorKeys(key);
  const header = Buffer.alloc(25);
  header[0] = 0x80;
  header.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)), 1);
  randomBytes(16).copy(header, 9);
  const cipher = createCipheriv('aes-128-cbc', encryption, header.subarray(9));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const signed = Buffer.concat([header, ciphertext]);
  const authentication = createHmac('sha256', signing).update(signed).digest();
  // Python Fernet emits padded URL-safe Base64. Preserve that format exactly.
  return Buffer.concat([signed, authentication]).toString('base64').replaceAll('+', '-').replaceAll('/', '_');
}

export function decryptTotp(token, key) {
  const { signing, encryption } = authenticatorKeys(key);
  try {
    if (typeof token !== 'string' || token.length > 2048
        || !/^[A-Za-z0-9_-]+={0,2}$/.test(token)) throw new Error();
    const decoded = Buffer.from(token, 'base64url');
    if (decoded.toString('base64url') !== token.replace(/=+$/, '')
        || decoded.length < 73 || decoded[0] !== 0x80) throw new Error();
    const signed = decoded.subarray(0, -32);
    const authentication = decoded.subarray(-32);
    const expected = createHmac('sha256', signing).update(signed).digest();
    if (!equalBytes(authentication, expected)) throw new Error();
    const ciphertext = signed.subarray(25);
    if (!ciphertext.length || ciphertext.length % 16 !== 0) throw new Error();
    const decipher = createDecipheriv('aes-128-cbc', encryption, signed.subarray(9, 25));
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    decodeBase32(plaintext);
    // Authenticator seeds are durable encrypted data; Fernet TTL is not applied.
    return plaintext;
  } catch {
    throw new Error('Invalid authenticator secret.');
  }
}

function codeForStep(secretBytes, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', secretBytes).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

export function totpStep(code, secret, lastStep = -1, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)
      || !Number.isSafeInteger(lastStep) || lastStep < -1
      || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return null;
  let secretBytes;
  try { secretBytes = decodeBase32(secret); } catch { return null; }
  const current = Math.floor(nowSeconds / 30);
  for (const step of [current - 1, current, current + 1]) {
    if (step < 0) continue;
    if (equalBytes(Buffer.from(code), Buffer.from(codeForStep(secretBytes, step)))) {
      return step > lastStep ? step : null;
    }
  }
  return null;
}

export function totpUri(secret, email) {
  decodeBase32(secret);
  if (typeof email !== 'string' || !email || email.length > 254 || /[\x00-\x20\x7f]/.test(email)) {
    throw new Error('Invalid authenticator account.');
  }
  const label = encodeURIComponent(ISSUER) + ':' + encodeURIComponent(email);
  return 'otpauth://totp/' + label + '?' + new URLSearchParams({ secret, issuer: ISSUER, algorithm: 'SHA1', digits: '6', period: '30' });
}
