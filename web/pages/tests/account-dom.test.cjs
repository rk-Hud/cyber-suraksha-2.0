'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const directory = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(directory, 'source/static/js/account.js'), 'utf8');
const UI = fs.readFileSync(path.join(directory, 'source/static/js/ui.js'), 'utf8');
const token = 't'.repeat(43);
const challenge = { id: '12345678-1234-1234-1234-123456789abc', token: 'f'.repeat(43), expiresAt: Date.now() + 300000, purpose: 'login' };
const future = () => Math.floor(Date.now() / 1000) + 3600;
const citizen = { id: '11111111-1234-1234-1234-123456789abc', name: 'Citizen One', email: 'citizen@example.com', role: 'citizen', totpEnabled: false };
const owner = { ...citizen, id: '22222222-1234-1234-1234-123456789abc', name: 'Owner', role: 'owner', totpEnabled: true };
const record = { id: '33333333-1234-1234-1234-123456789abc', reference: 'CS-A12345', subject: '<img src=x onerror=alert(1)>', details: 'Private complaint text with evidence description.', category: 'account', status: 'pending', version: 1, created_at: 1794900000, updated_at: 1794900000 };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, message = 'condition') { for (let i = 0; i < 40; i++) { if (predicate()) return; await tick(); } assert.fail('Timed out: ' + message); }
function envelope(data, status = 200) { return new Response(JSON.stringify(status < 400 ? { data, requestId: 'requestreference01' } : { error: { code: data }, requestId: 'requestreference01' }), { status }); }

async function mount({ language = 'en', hash = '', features = { registration: true, emailOtp: true, complaints: true, admin: true }, handle = () => ({}) , configured = true, home = false } = {}) {
  const html = fs.readFileSync(path.join(directory, 'docs', language, home ? 'index.html' : 'account.html'), 'utf8');
  const dom = new JSDOM(html, { url: `https://rk-hud.github.io/cyber-suraksha-2.0/${language}/${home ? '' : 'account.html'}${hash}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.document.documentElement.dataset.apiUrl = configured ? 'https://api.example' : '';
  const calls = [];
  window.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.example');
    const route = new URL(url).pathname + new URL(url).search;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ route, body, options });
    if (route === '/api/v1/health') return envelope({ status: 'ok', features });
    if (route === '/api/v1/public/content') return envelope({ sections: [] });
    const data = await handle(route, body, options);
    return data instanceof Response ? data : envelope(data);
  };
  for (const storage of [window.localStorage, window.sessionStorage]) storage.setItem = () => { throw new Error('No browser storage permitted'); };
  window.eval(fs.readFileSync(path.join(directory, `docs/static/js/account_copy_${language}.js`), 'utf8'));
  window.eval(source);
  if (configured) await until(() => !window.document.getElementById(home ? 'citizen-service-status' : 'account-service-status').textContent.includes('…'), 'service health');
  const doc = window.document;
  const submit = async (id, values = {}) => {
    const form = doc.getElementById(id);
    for (const [name, value] of Object.entries(values)) {
      const input = form.elements.namedItem(name); assert.ok(input, `${id}.${name}`);
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
    }
    assert.equal(form.checkValidity(), true, `${id} should be valid`);
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(); await tick();
  };
  const visible = name => !doc.querySelector(`[data-account-panel="${name}"]`).hidden;
  const navigate = async name => { const button = [...doc.querySelectorAll('[data-account-view]')].find(item => item.dataset.accountView === name); assert.ok(button); button.click(); await tick(); };
  return { dom, window, doc, calls, submit, visible, navigate, copy: JSON.parse(fs.readFileSync(path.join(directory, `source/data/ui_${language}.json`), 'utf8')) };
}

for (const language of ['en', 'hi', 'te']) test(`${language}: registration, OTP, private case timeline and reply use the API without leaking text into URLs`, async t => {
  const state = await mount({ language, hash: '#register', handle(route) {
    if (route === '/api/v1/auth/register') return { challenge };
    if (route === '/api/v1/auth/verify') return { token, expiresAt: future(), user: citizen };
    if (route.startsWith('/api/v1/cases?')) return { cases: [], pagination: { page: 1, pages: 1 } };
    if (route === '/api/v1/cases') return { case: record };
    if (route === '/api/v1/cases/' + record.id) return { case: record, events: [{ author_role: 'citizen', message: '<script>private text</script>', new_status: 'pending', created_at: record.created_at }] };
    if (route.endsWith('/replies')) return { accepted: true };
    throw new Error('Unexpected ' + route);
  }});
  t.after(() => state.dom.window.close());
  assert.equal(state.visible('register'), true);
  await state.submit('account-register', { name: 'Citizen One', email: citizen.email, password: 'LongPassword!2026', confirmPassword: 'LongPassword!2026', consent: true });
  await until(() => state.visible('verify'), 'OTP panel');
  const registration = state.calls.find(item => item.route.endsWith('/register'));
  assert.equal(registration.body.consent, true); assert.equal(registration.body.locale, language);
  assert.equal(state.doc.getElementById('register-password').value, '');
  await state.submit('account-verify', { code: '123456' });
  await until(() => state.visible('cases'), 'private cases');
  await state.navigate('new-case');
  await state.submit('account-new-case', { subject: 'A suspicious account message', category: 'account', details: record.details, consent: true });
  await until(() => state.visible('case-detail'), 'case detail');
  assert.equal(state.doc.querySelector('#case-detail-content h2').textContent, record.subject);
  assert.equal(state.doc.querySelector('#case-detail-content img'), null, 'submitted content remains text');
  assert.equal(state.doc.querySelector('#case-detail-content script'), null);
  await state.submit('case-action-form', { message: 'Additional private context.' });
  await until(() => state.calls.some(item => item.route.endsWith('/replies')), 'reply request');
  for (const call of state.calls.filter(item => item.route.startsWith('/api/v1/cases'))) {
    assert.equal(call.options.headers.Authorization, 'Bearer ' + token);
    assert.equal(call.route.includes('Private'), false);
    assert.equal(call.options.credentials, 'omit');
  }
  assert.equal(state.window.location.hash, '#register');
  state.window.dispatchEvent(new state.window.Event('pagehide'));
  assert.equal(state.doc.getElementById('case-detail-content').textContent, '');
  assert.equal(state.doc.getElementById('signed-in-identity').hidden, true);
  assert.equal(state.visible('login'), true);
});

test('mail readiness disables signup and sign-in while leaving understandable localized status', async t => {
  const state = await mount({ language: 'te', features: { registration: false, emailOtp: false, complaints: true, admin: false } });
  t.after(() => state.dom.window.close());
  assert.equal(state.doc.querySelector('#account-login button[type=submit]').disabled, true);
  assert.equal(state.doc.querySelector('#account-register button[type=submit]').disabled, true);
  assert.equal(state.doc.getElementById('account-service-status').textContent, state.copy.account_mail_closed);
  assert.equal(state.calls.filter(item => item.route.includes('/auth/')).length, 0);
});

test('absent API configuration fails closed and performs no network request', async t => {
  const state = await mount({ configured: false });
  t.after(() => state.dom.window.close());
  assert.equal(state.calls.length, 0);
  assert.equal(state.doc.getElementById('account-service-status').textContent, state.copy.account_not_configured);
  for (const button of state.doc.querySelectorAll('form button[type=submit], #mfa-start')) assert.equal(button.disabled, true);
});

test('owner email verification leads to authenticator gate before records and admin editing', async t => {
  let mfaVerified = false;
  const state = await mount({ hash: '#admin', handle(route, body) {
    if (route === '/api/v1/auth/login') return { challenge };
    if (route === '/api/v1/auth/verify') return { token, expiresAt: future(), user: owner };
    if (route === '/api/v1/admin/mfa/verify') { assert.equal(body.code, '234567'); mfaVerified = true; return { mfaVerified: true }; }
    assert.equal(mfaVerified, true, 'no records before authenticator verification');
    if (route === '/api/v1/admin/summary') return { counts: { users: 2, pending: 1, notifications: 1 }, logins: [{ name: '<img onerror=alert(1)>', email: citizen.email, success: false, created_at: record.created_at }], audit: [] };
    if (route.startsWith('/api/v1/admin/cases?')) return { cases: [record] };
    if (route === '/api/v1/admin/content') return { sections: [{ section: 'advisory', content: { active: false }, version: 3 }] };
    if (route === '/api/v1/admin/content/advisory') { assert.equal(body.version, 3); assert.deepEqual(body.content, { active: false }); return { updated: true }; }
    if (route.startsWith('/api/v1/admin/users?')) return { users: [{ ...citizen, active: true, version: 7 }, owner] };
    if (route === '/api/v1/admin/users/' + citizen.id) { assert.deepEqual(body, { active: false, version: 7 }); return { user: citizen }; }
    if (route === '/api/v1/cases/' + record.id) return { case: record, events: [], owner: { name: citizen.name, email: citizen.email } };
    if (route === '/api/v1/admin/cases/' + record.id) { assert.deepEqual(body, { status: 'in_review', message: 'We are reviewing your support request.', version: 1 }); return { case: { ...record, status: 'in_review', version: 2 } }; }
    if (route === '/api/v1/admin/notifications/send-one') return { sent: true };
    throw new Error('Unexpected route ' + route);
  }});
  t.after(() => state.dom.window.close());
  assert.equal(state.doc.getElementById('login-heading').textContent, state.copy.account_admin_title);
  await state.submit('account-login', { email: owner.email, password: 'LongPassword!2026' });
  await until(() => state.visible('verify'));
  await state.submit('account-verify', { code: '123456' });
  await until(() => state.visible('mfa'));
  assert.equal(state.calls.some(item => item.route === '/api/v1/admin/summary'), false);
  await state.submit('account-mfa-verify', { code: '234567' });
  await until(() => state.doc.getElementById('admin-logins').textContent.includes(citizen.email));
  assert.equal(state.visible('admin'), true);
  assert.equal(state.doc.querySelector('#admin-logins img'), null);
  await state.navigate('content');
  await until(() => state.doc.getElementById('content-advisory'));
  await state.submit('content-advisory');
  await until(() => state.calls.some(item => item.route.endsWith('/content/advisory')));
  await state.navigate('users');
  await until(() => state.doc.getElementById('user-state-' + citizen.id));
  assert.equal(state.doc.getElementById('user-state-' + owner.id), null, 'owner account cannot be disabled by this form');
  await state.submit('user-state-' + citizen.id, { active: 'false' });
  await until(() => state.calls.some(item => item.route === '/api/v1/admin/users/' + citizen.id));
  await state.navigate('admin');
  await until(() => state.doc.querySelector('#admin-cases .record-open'));
  state.doc.querySelector('#admin-cases .record-open').click();
  await until(() => state.visible('case-detail'));
  assert.equal(state.doc.getElementById('case-detail-content').textContent.includes(citizen.email), true);
  await state.submit('case-action-form', { status: 'in_review', message: 'We are reviewing your support request.' });
  await until(() => state.calls.some(item => item.route === '/api/v1/admin/cases/' + record.id));
  for (const call of state.calls.filter(item => item.route.startsWith('/api/v1/admin/'))) assert.equal(call.options.headers.Authorization, 'Bearer ' + token);
});

test('password recovery carries only the current flow token and clears credentials after reset', async t => {
  const state = await mount({ handle(route, body) {
    if (route === '/api/v1/auth/forgot') return { challenge: { ...challenge, purpose: 'reset' } };
    if (route === '/api/v1/auth/reset') { assert.equal(body.flowToken, challenge.token); assert.equal(body.challengeId, challenge.id); return { reset: true }; }
    throw new Error('Unexpected ' + route);
  }});
  t.after(() => state.dom.window.close());
  await state.navigate('forgot');
  await state.submit('account-forgot', { email: citizen.email });
  await until(() => state.visible('reset'));
  await state.submit('account-reset', { code: '123456', password: 'LongerPassword!2026', confirmPassword: 'LongerPassword!2026' });
  await until(() => state.visible('login'));
  assert.equal(state.doc.getElementById('reset-password').value, '');
  assert.equal(state.doc.getElementById('account-message').textContent.includes(state.copy.notice_password_reset), true);
});

test('status notification account URL requires sign-in and never reads case details from a URL', async t => {
  const state = await mount({ hash: '#cases' });
  t.after(() => state.dom.window.close());
  assert.equal(state.visible('login'), true);
  assert.equal(state.calls.some(item => item.route.includes('/cases')), false);
});

test('language switch from an account page preserves account route and excludes private URL parameters', async t => {
  const state = await mount();
  t.after(() => state.dom.window.close());
  let destination;
  const browser = { location: { hash: '', assign(value) { destination = value; } }, addEventListener() {} };
  const vm = require('node:vm');
  vm.runInNewContext(UI, { document: state.doc, window: browser });
  const select = state.doc.getElementById('language-select'); select.value = 'hi'; select.dispatchEvent(new state.window.Event('change'));
  assert.equal(destination, '/cyber-suraksha-2.0/hi/account.html');
});

test('new owner authenticator setup remains in memory and is erased after confirmation', async t => {
  const setupSecret = 'JBSWY3DPEHPK3PXP';
  const state = await mount({ hash: '#admin', handle(route) {
    if (route === '/api/v1/auth/login') return { challenge };
    if (route === '/api/v1/auth/verify') return { token, expiresAt: future(), user: { ...owner, totpEnabled: false } };
    if (route === '/api/v1/admin/mfa/start') return { secret: setupSecret, uri: 'otpauth://totp/CYBER?secret=' + setupSecret };
    if (route === '/api/v1/admin/mfa/confirm') return { mfaVerified: true };
    if (route === '/api/v1/admin/summary') return { counts: {}, logins: [], audit: [] };
    if (route.startsWith('/api/v1/admin/cases?')) return { cases: [] };
    throw new Error('Unexpected ' + route);
  }});
  t.after(() => state.dom.window.close());
  await state.submit('account-login', { email: owner.email, password: 'LongPassword!2026' });
  await until(() => state.visible('verify'));
  await state.submit('account-verify', { code: '123456' });
  await until(() => state.visible('mfa'));
  assert.equal(state.doc.getElementById('mfa-enrollment').hidden, false);
  state.doc.getElementById('mfa-start').click();
  await until(() => !state.doc.getElementById('mfa-secret').hidden);
  assert.equal(state.doc.getElementById('mfa-secret-value').textContent, setupSecret);
  assert.equal(state.window.location.href.includes(setupSecret), false);
  await state.submit('account-mfa-confirm', { code: '123456' });
  await until(() => state.visible('admin'));
  assert.equal(state.doc.getElementById('mfa-secret-value').textContent, '');
  assert.equal(state.doc.getElementById('mfa-setup-uri').value, '');
  assert.equal(state.doc.getElementById('mfa-secret').hidden, true);
});

test('a revoked authenticated request clears private panels and requires sign-in again', async t => {
  const state = await mount({ handle(route) {
    if (route === '/api/v1/auth/login') return { challenge };
    if (route === '/api/v1/auth/verify') return { token, expiresAt: future(), user: citizen };
    if (route.startsWith('/api/v1/cases?')) return envelope('msg_authentication_required', 401);
    throw new Error('Unexpected ' + route);
  }});
  t.after(() => state.dom.window.close());
  await state.submit('account-login', { email: citizen.email, password: 'LongPassword!2026' });
  await until(() => state.visible('verify'));
  await state.submit('account-verify', { code: '123456' });
  await until(() => state.visible('login'));
  assert.equal(state.doc.getElementById('signed-in-identity').hidden, true);
  assert.equal(state.doc.getElementById('citizen-cases').textContent, '');
  assert.ok(state.doc.getElementById('account-message').textContent.includes(state.copy.account_session_expired));
});
