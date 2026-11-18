import { createPublicKey, createHash, verify } from 'node:crypto';

const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
let cache = { keys: null, expires: 0 };
function parsePart(input) {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]+$/.test(input)) throw new Error('invalid_google_credential');
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
}
async function keysFor(kid, fetcher) {
  if (Date.now() < cache.expires && cache.keys?.some(k => k.kid === kid)) return cache.keys;
  const response = await fetcher(KEYS_URL, { redirect: 'error', signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error('google_jwks_unavailable');
  const value = await response.json();
  if (!Array.isArray(value?.keys) || value.keys.length > 12) throw new Error('google_jwks_invalid');
  cache = { keys: value.keys, expires: Date.now() + 300000 };
  return value.keys;
}
export async function verifyGoogleCredential(credential, { clientId, nonce, fetcher = fetch, now = Date.now() } = {}) {
  if (!clientId || typeof credential !== 'string' || credential.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential) ||
      typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(nonce)) throw new Error('invalid_google_credential');
  const [head, payloadText, signature] = credential.split('.');
  const header = parsePart(head), payload = parsePart(payloadText);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(header.kid)) throw new Error('invalid_google_credential');
  const key = (await keysFor(header.kid, fetcher)).find(k => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig' && k.alg === 'RS256');
  if (!key || !verify('RSA-SHA256', Buffer.from(head + '.' + payloadText), createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url'))) throw new Error('invalid_google_credential');
  const seconds = Math.floor(now / 1000);
  if (!ISSUERS.has(payload.iss) || payload.aud !== clientId || typeof payload.sub !== 'string' ||
      !/^[0-9]{8,32}$/.test(payload.sub) || typeof payload.exp !== 'number' || payload.exp <= seconds ||
      typeof payload.iat !== 'number' || payload.iat > seconds + 60 || payload.iat < seconds - 3600 ||
      payload.nonce !== nonce || payload.email_verified !== true ||
      typeof payload.email !== 'string' || payload.email.length > 254) throw new Error('invalid_google_credential');
  return { subject: payload.sub, email: payload.email, name: typeof payload.name === 'string' ? payload.name.slice(0, 100) : '' };
}
export function googleCredentialFingerprint(credential) { return createHash('sha256').update(credential).digest('hex'); }
