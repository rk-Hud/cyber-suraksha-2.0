'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const CLIENT = '942815048048-6pi4g094nto74sad0afo1dqdpvhdlk3g.apps.googleusercontent.com';
const credential = 'signedheader.signedpayload.signature';
const user = { id: '11111111-1234-1234-1234-123456789abc', name: 'Google Citizen', email: 'citizen@example.test', role: 'citizen', totpEnabled: false };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) { for (let i = 0; i < 50; i++) { if (condition()) return; await tick(); } assert.fail('Google UI condition did not settle'); }
function response(data, status = 200) { return new Response(JSON.stringify(status < 400 ? { data, requestId: 'googletestreference' } : { error: { code: data }, requestId: 'googletestreference' }), { status }); }
async function mount(t, { language = 'en', enabled = true, audience = CLIENT, hash = '', issue, finish, emailReady = false, passwordLogin } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'docs', language, 'account.html'), 'utf8');
  const dom = new JSDOM(html, { url: `https://rk-hud.github.io/cyber-suraksha-2.0/${language}/account.html${hash}`, runScripts: 'outside-only' });
  const w = dom.window, doc = w.document, calls = [], sdk = [];
  t.after(() => w.close());
  doc.documentElement.dataset.apiUrl = 'https://api.example';
  let sequence = 0;
  w.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.example');
    const route = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ route, body, options });
    if (route === '/api/v1/health') return response({ status: 'ok', features: { googleSignIn: enabled, googleRegistration: true, registration: false, emailOtp: emailReady, complaints: true, admin: false }, googleClientId: audience });
    if (route === '/api/v1/public/content') return response({ sections: [] });
    if (route === '/api/v1/auth/google/challenge') {
      sequence++;
      return response({ challenge: issue ? issue(sequence) : { id: String(sequence).padStart(8, '0') + '-1234-1234-1234-123456789abc', token: 'f'.repeat(43), purpose: 'google', nonce: String.fromCharCode(96 + sequence).repeat(43), expiresAt: Math.floor(Date.now() / 1000) + 300 } });
    }
    if (route === '/api/v1/auth/login') return passwordLogin ? passwordLogin(body) : response('msg_invalid_credentials', 401);
    if (route === '/api/v1/auth/google') return finish ? finish(body) : response({ token: 't'.repeat(43), user, expiresAt: Math.floor(Date.now() / 1000) + 1800 });
    if (route === '/api/v1/cases') return response({ cases: [], pagination: { page: 1, pages: 1 } });
    if (route === '/api/v1/auth/logout') return response({});
    throw new Error('Unexpected Google test request');
  };
  for (const storage of [w.localStorage, w.sessionStorage]) storage.setItem = () => { throw new Error('Private data must not reach browser storage'); };
  w.eval(fs.readFileSync(path.join(ROOT, `docs/static/js/account_copy_${language}.js`), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'source/static/js/account.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'source/static/js/google_signin.js'), 'utf8'));
  await w.CyberSurakshaGoogleAuth.ready(); await tick();
  function loadGoogle() {
    w.google = { accounts: { id: { initialize(options) { sdk.push(options); }, renderButton(host, options) { assert.equal(options.locale, language); const b = doc.createElement('button'); b.type = 'button'; b.textContent = 'Provider button'; host.append(b); }, cancel() {} } } };
    const script = doc.querySelector('script[src="https://accounts.google.com/gsi/client"]'); assert.ok(script); script.onload();
  }
  async function optIn() {
    const consent = doc.getElementById('google-citizen-consent'); consent.checked = true; consent.dispatchEvent(new w.Event('change'));
    await until(() => calls.some(c => c.route.endsWith('/challenge')));
    if (!w.google) { await until(() => doc.querySelector('script[src="https://accounts.google.com/gsi/client"]')); loadGoogle(); }
    await until(() => sdk.length === sequence);
  }
  return { w, doc, calls, sdk, optIn, copy: w.CyberSurakshaAccountCopy };
}

for (const language of ['en', 'hi', 'te']) test(`${language}: Google callback exchanges only a current server flow and enters citizen cases`, async t => {
  const s = await mount(t, { language });
  assert.equal(s.doc.getElementById('google-citizen-signin').hidden, false);
  assert.equal(s.doc.getElementById('account-service-status').textContent, s.copy.google_service_ready);
  assert.equal(s.doc.querySelector('script[src="https://accounts.google.com/gsi/client"]'), null, 'No Google contact before consent');
  assert.equal(s.calls.some(c => c.route.endsWith('/challenge')), false);
  await s.optIn();
  assert.equal(s.sdk[0].nonce, 'a'.repeat(43)); assert.equal(s.sdk[0].client_id, CLIENT); assert.equal(s.sdk[0].auto_select, false); assert.equal(s.sdk[0].ux_mode, 'popup');
  await s.sdk[0].callback({ credential });
  await until(() => !s.doc.querySelector('[data-account-panel=cases]').hidden);
  const exchange = s.calls.find(c => c.route === '/api/v1/auth/google');
  assert.deepEqual(exchange.body, { credential, nonce: 'a'.repeat(43), challengeId: '00000001-1234-1234-1234-123456789abc', flowToken: 'f'.repeat(43), consent: true, locale: language });
  assert.equal(exchange.options.credentials, 'omit'); assert.equal(exchange.options.referrerPolicy, 'no-referrer'); assert.equal(exchange.options.headers.Authorization, undefined);
  assert.equal(s.calls.find(c => c.route === '/api/v1/cases').options.headers.Authorization, 'Bearer ' + 't'.repeat(43));
  assert.equal(s.doc.getElementById('google-citizen-signin').hidden, true);
  assert.equal(s.calls.some(c => c.route.startsWith('/api/v1/admin')), false);
});

test('Google client/audience mismatch, disabled readiness and administrator sign-in hide the citizen provider', async t => {
  for (const options of [{ audience: 'wrong.apps.googleusercontent.com' }, { enabled: false }, { hash: '#admin' }]) {
    const s = await mount(t, options);
    assert.equal(s.doc.getElementById('google-citizen-signin').hidden, true);
    assert.equal(s.doc.querySelector('script[src="https://accounts.google.com/gsi/client"]'), null);
    assert.equal(s.calls.some(c => c.route.endsWith('/challenge')), false);
  }
});

test('withdrawing consent invalidates old callbacks and a fresh attempt gets a different server nonce', async t => {
  const s = await mount(t); await s.optIn(); const first = s.sdk[0];
  const checkbox = s.doc.getElementById('google-citizen-consent'); checkbox.checked = false; checkbox.dispatchEvent(new s.w.Event('change'));
  await first.callback({ credential });
  assert.equal(s.calls.some(c => c.route === '/api/v1/auth/google'), false);
  await s.optIn(); assert.notEqual(s.sdk[1].nonce, first.nonce);
  await first.callback({ credential }); assert.equal(s.calls.some(c => c.route === '/api/v1/auth/google'), false);
  await s.sdk[1].callback({ credential });
  assert.equal(s.calls.filter(c => c.route === '/api/v1/auth/google').length, 1);
});

test('duplicate callbacks cannot create concurrent exchanges', async t => {
  let release;
  const s = await mount(t, { finish: () => new Promise(resolve => { release = resolve; }) }); await s.optIn();
  const first = s.sdk[0].callback({ credential }); await until(() => release);
  await s.sdk[0].callback({ credential });
  assert.equal(s.calls.filter(c => c.route === '/api/v1/auth/google').length, 1);
  release(response({ token: 't'.repeat(43), user, expiresAt: Date.now() / 1000 + 1800 })); await first;
});

test('pagehide discards a late successful exchange instead of installing a hidden session', async t => {
  let release;
  const s = await mount(t, { finish: () => new Promise(resolve => { release = resolve; }) }); await s.optIn();
  const pending = s.sdk[0].callback({ credential }); await until(() => release);
  s.w.dispatchEvent(new s.w.Event('pagehide'));
  release(response({ token: 't'.repeat(43), user, expiresAt: Date.now() / 1000 + 1800 })); await pending;
  assert.equal(s.doc.getElementById('signed-in-identity').hidden, true);
  assert.equal(s.calls.some(c => c.route === '/api/v1/cases'), false);
  assert.equal(s.doc.getElementById('google-citizen-consent').checked, false);
});

test('malformed server challenge never loads the identity script', async t => {
  const s = await mount(t, { issue: () => ({ id: 'bad', token: 'bad', nonce: 'bad', purpose: 'google', expiresAt: Date.now() + 10000 }) });
  const box = s.doc.getElementById('google-citizen-consent'); box.checked = true; box.dispatchEvent(new s.w.Event('change'));
  await until(() => s.doc.getElementById('google-signin-status').textContent === s.copy.google_unavailable);
  assert.equal(s.doc.querySelector('script[src="https://accounts.google.com/gsi/client"]'), null);
});

test('unexpected owner response never grants a privileged frontend session', async t => {
  const s = await mount(t, { finish: () => response({ token: 't'.repeat(43), user: { ...user, role: 'owner' }, expiresAt: Date.now() / 1000 + 1800 }) }); await s.optIn();
  await s.sdk[0].callback({ credential });
  assert.equal(s.doc.getElementById('signed-in-identity').hidden, true);
  assert.equal(s.calls.some(c => c.route === '/api/v1/cases' || c.route.startsWith('/api/v1/admin')), false);
});

test('navigation to administrator login cancels a prepared citizen Google callback', async t => {
  const s = await mount(t); await s.optIn();
  const callback = s.sdk[0].callback;
  s.doc.querySelector('#account-navigation [data-account-view="admin-login"]').click();
  assert.equal(s.doc.getElementById('google-citizen-signin').hidden, true);
  await callback({ credential });
  assert.equal(s.calls.some(c => c.route === '/api/v1/auth/google'), false);
});

test('expired server challenge is rejected before loading any Google script', async t => {
  const s = await mount(t, { issue: () => ({ id: '11111111-1234-1234-1234-123456789abc', token: 'f'.repeat(43), nonce: 'n'.repeat(43), purpose: 'google', expiresAt: Date.now() / 1000 - 1 }) });
  const box = s.doc.getElementById('google-citizen-consent'); box.checked = true; box.dispatchEvent(new s.w.Event('change'));
  await until(() => s.doc.getElementById('google-signin-status').textContent === s.copy.google_unavailable);
  assert.equal(s.doc.querySelector('script[src="https://accounts.google.com/gsi/client"]'), null);
});

test('a stale rejected Google exchange cannot revoke a newer successful citizen session', async t => {
  let rejectOld, exchanges = 0;
  const s = await mount(t, { finish: () => ++exchanges === 1 ? new Promise(resolve => { rejectOld = resolve; }) : response({ token: 't'.repeat(43), user, expiresAt: Date.now() / 1000 + 1800 }) });
  await s.optIn(); const pending = s.sdk[0].callback({ credential }); await until(() => rejectOld);
  const checkbox = s.doc.getElementById('google-citizen-consent'); checkbox.checked = false; checkbox.dispatchEvent(new s.w.Event('change'));
  await s.optIn(); await s.sdk[1].callback({ credential });
  assert.equal(s.doc.getElementById('signed-in-identity').hidden, false);
  rejectOld(response('msg_invalid_credentials', 401)); await pending;
  assert.equal(s.doc.getElementById('signed-in-identity').hidden, false);
  assert.equal(s.doc.querySelector('[data-account-panel=cases]').hidden, false);
});

test('an older password-login rejection cannot sign out a newly verified Google citizen', async t => {
  let rejectPassword;
  const s = await mount(t, { emailReady: true, passwordLogin: () => new Promise(resolve => { rejectPassword = resolve; }) });
  s.doc.getElementById('login-email').value = 'fictional@example.test';
  s.doc.getElementById('login-password').value = 'FictionalPassword!2026';
  s.doc.getElementById('account-login').dispatchEvent(new s.w.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => rejectPassword);
  await s.optIn(); await s.sdk[0].callback({ credential });
  assert.equal(s.doc.getElementById('signed-in-identity').hidden, false);
  rejectPassword(response('msg_invalid_credentials', 401)); await tick(); await tick();
  assert.equal(s.doc.getElementById('signed-in-identity').hidden, false);
  assert.equal(s.doc.querySelector('[data-account-panel=cases]').hidden, false);
});
