import { createPublicKey, createHash, verify } from 'node:crypto';

const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const MAX_KEYS_BYTES = 65536;
const REFRESH_INTERVAL = 30000;
const invalid = () => new Error('invalid_google_credential');

function decodePart(input) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]+$/.test(input)) throw invalid();
  const value = Buffer.from(input, 'base64url');
  // Node's decoder accepts nonzero unused bits. Canonical segments prevent an
  // alternate spelling of one valid signature from bypassing replay hashes.
  if (value.toString('base64url') !== input) throw invalid();
  return value;
}
function parsePart(input) {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodePart(input)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value;
}
function cacheLifetime(headers) {
  const policy = headers?.get?.('cache-control') || '';
  if (/\b(?:no-store|no-cache)\b/i.test(policy)) return 0;
  const age = Number(headers?.get?.('age') || 0);
  const match = /(?:^|,)\s*max-age\s*=\s*(\d+)\b/i.exec(policy);
  const lifetime = match ? Number(match[1]) : 300;
  return Math.max(0, Math.min(3600, lifetime - (Number.isFinite(age) ? age : 0))) * 1000;
}
async function readKeys(response) {
  if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('google_jwks_unavailable');
  const declared = response.headers?.get?.('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_KEYS_BYTES)) {
    await response.body.cancel().catch(() => {});
    throw new Error('google_jwks_invalid');
  }
  const reader = response.body.getReader();
  const pieces = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_KEYS_BYTES) throw new Error('google_jwks_invalid');
      pieces.push(value);
    }
    const joined = Buffer.concat(pieces, size);
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
    if (!Array.isArray(result?.keys) || !result.keys.length || result.keys.length > 12) throw new Error('google_jwks_invalid');
    const keys = new Map();
    for (const key of result.keys) {
      if (!key || typeof key !== 'object' || key.kty !== 'RSA' || key.use !== 'sig' || key.alg !== 'RS256' ||
          typeof key.kid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(key.kid) || keys.has(key.kid) ||
          typeof key.n !== 'string' || typeof key.e !== 'string' ||
          ['d', 'p', 'q', 'dp', 'dq', 'qi'].some(field => field in key) ||
          key.key_ops && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify'))) throw new Error('google_jwks_invalid');
      decodePart(key.n); decodePart(key.e);
      const publicKey = createPublicKey({ key, format: 'jwk' });
      const bits = publicKey.asymmetricKeyDetails?.modulusLength;
      if (publicKey.asymmetricKeyType !== 'rsa' || !Number.isInteger(bits) || bits < 2048 || bits > 4096) throw new Error('google_jwks_invalid');
      keys.set(key.kid, { publicKey, signatureBytes: Math.ceil(bits / 8) });
    }
    return keys;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// One cache per verifier prevents tests or another caller's fetch dependency
// from seeding production keys. Concurrent requests share one bounded fetch.
export function createGoogleVerifier({ fetcher = fetch, clock = Date.now } = {}) {
  if (typeof fetcher !== 'function' || typeof clock !== 'function') throw invalid();
  let keys = new Map(), expires = 0, nextRefresh = 0, pending;
  async function keyFor(kid) {
    const time = clock();
    if (time < expires && keys.has(kid)) return keys.get(kid);
    if (!pending && time >= nextRefresh) {
      nextRefresh = time + REFRESH_INTERVAL;
      pending = (async () => {
        const response = await fetcher(KEYS_URL, { redirect: 'error', signal: AbortSignal.timeout(6000),
          headers: { Accept: 'application/json' } });
        const loaded = await readKeys(response);
        keys = loaded;
        expires = clock() + cacheLifetime(response.headers);
      })().finally(() => { pending = undefined; });
    }
    const refreshed = Boolean(pending);
    if (pending) await pending;
    if (!refreshed && clock() >= expires) throw new Error('google_jwks_unavailable');
    return keys.get(kid);
  }
  return async function verifyCredential(credential, { clientId, nonce, now = clock() } = {}) {
    try {
      if (typeof clientId !== 'string' || clientId.length > 256 || !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
          typeof credential !== 'string' || credential.length > 8192 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential) ||
          typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(nonce) || !Number.isFinite(now)) throw invalid();
      const [head, payloadText, signature] = credential.split('.');
      const header = parsePart(head), payload = parsePart(payloadText), signatureBytes = decodePart(signature);
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(header.kid) ||
          header.typ !== undefined && header.typ !== 'JWT' || 'crit' in header || 'b64' in header ||
          ['jku', 'jwk', 'x5u', 'x5c'].some(field => field in header)) throw invalid();
      const seconds = Math.floor(now / 1000);
      if (!ISSUERS.has(payload.iss) || payload.aud !== clientId || payload.azp !== undefined && payload.azp !== clientId ||
          typeof payload.sub !== 'string' || !/^[0-9]{8,32}$/.test(payload.sub) ||
          !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) ||
          payload.exp <= seconds || payload.exp <= payload.iat || payload.exp - payload.iat > 3600 ||
          payload.iat > seconds + 60 || payload.iat < seconds - 3600 ||
          payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > seconds + 60) ||
          payload.nonce !== nonce || payload.email_verified !== true ||
          typeof payload.email !== 'string' || payload.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || /[\x00-\x20\x7f]/.test(payload.email)) throw invalid();
      const key = await keyFor(header.kid);
      if (!key || signatureBytes.length !== key.signatureBytes || !verify('RSA-SHA256', Buffer.from(head + '.' + payloadText), key.publicKey, signatureBytes)) throw invalid();
      return { subject: payload.sub, email: payload.email, name: typeof payload.name === 'string' ? payload.name.slice(0, 100) : '' };
    } catch {
      // Neither key-provider responses nor identity assertions belong in errors.
      throw invalid();
    }
  };
}
const defaultVerifier = createGoogleVerifier();
const injectedVerifiers = new WeakMap();
export function verifyGoogleCredential(credential, options = {}) {
  if (!options.fetcher) return defaultVerifier(credential, options);
  if (typeof options.fetcher !== 'function') return Promise.reject(invalid());
  let verifier = injectedVerifiers.get(options.fetcher);
  if (!verifier) { verifier = createGoogleVerifier({ fetcher: options.fetcher }); injectedVerifiers.set(options.fetcher, verifier); }
  return verifier(credential, options);
}
export function googleCredentialFingerprint(credential) {
  if (typeof credential !== 'string' || credential.length > 8192) throw invalid();
  return createHash('sha256').update(credential).digest('hex');
}
