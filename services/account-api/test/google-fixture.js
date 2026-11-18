import { generateKeyPairSync, sign } from 'node:crypto';
import { fixture } from './helper.js';

export const CLIENT_ID = '12345-citizen-test.apps.googleusercontent.com';
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'citizen-api-test-key', kty: 'RSA', alg: 'RS256', use: 'sig' };
export function credential(flow, claims = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID,
    sub: '123456789012345678901', email: 'google-citizen@example.test', email_verified: true,
    name: 'Google Citizen', iat: seconds-5, exp: seconds+1800, nonce: flow.nonce, ...claims })).toString('base64url');
  return header + '.' + payload + '.' + sign('RSA-SHA256', Buffer.from(header + '.' + payload), key.privateKey).toString('base64url');
}
export async function googleApi(t, overrides = {}) {
  const api = await fixture(t, { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_SIGNIN_ENABLED: '1',
    GOOGLE_REGISTRATION_ENABLED: '1', REGISTRATION_ENABLED: '0', NO_MAIL: true, ...overrides }, {
    googleFetcher: async () => new Response(JSON.stringify({ keys: [jwk] }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } }),
  });
  if (api) api.startGoogle = async (locale = 'en') => {
    const response = await api.request('/auth/google/challenge', { method: 'POST', data: { locale } });
    if (response.status !== 200) throw new Error('Google flow initialization failed: ' + response.status);
    return response.json.data.challenge;
  };
  return api;
}
export async function finishGoogle(api, flow, claims = {}, extra = {}) {
  return api.request('/auth/google', { method: 'POST', data: {
    credential: credential(flow, claims), nonce: flow.nonce, challengeId: flow.id,
    flowToken: flow.token, consent: true, ...extra,
  } });
}
