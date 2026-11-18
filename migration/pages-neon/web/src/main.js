import { createAuthClient } from '@neon/auth';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL || '';
const apiUrl = (import.meta.env.VITE_CYBER_API_URL || '').replace(/\/$/, '');
const configured = /^https:\/\//.test(authUrl) && /^https:\/\//.test(apiUrl) &&
  !authUrl.includes('REPLACE_WITH_') && !apiUrl.includes('REPLACE_WITH_');
const $ = id => document.getElementById(id);
const set = (id, text, kind = '') => {
  const node = $(id); node.textContent = text; node.className = kind;
};
const auth = configured ? createAuthClient(authUrl) : null;
let currentUser = null;
let allowSyntheticIntake = false;
const safeError = error => error?.message || 'The operation could not be completed.';
function elements(table, rows, cols) {
  const parent = $(table); parent.replaceChildren();
  if (!rows.length) { parent.textContent = 'No cases available.'; return; }
  const grid = document.createElement('table');
  const head = document.createElement('tr');
  for (const c of cols) { const el = document.createElement('th'); el.scope = 'col'; el.textContent = c[1]; head.append(el); }
  grid.append(head);
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const c of cols) { const el = document.createElement('td'); el.textContent = String(row[c[0]] ?? ''); tr.append(el); }
    grid.append(tr);
  }
  parent.append(grid);
}
async function token() {
  const result = await auth.token();
  if (result.error || !result.data?.token) throw new Error('Sign in again to continue.');
  return result.data.token;
}
async function api(path, method = 'GET', data = undefined) {
  const headers = { Authorization: 'Bearer ' + await token() };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiUrl + path, {
    method, headers, cache: 'no-store', credentials: 'omit',
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  let json;
  try { json = await response.json(); } catch { throw new Error('Invalid response from API.'); }
  if (!response.ok) throw new Error(json.error || 'Service returned HTTP ' + response.status);
  return json;
}
async function updateSession() {
  try {
    const session = await auth.getSession();
    currentUser = session?.data?.user || null;
    $('case-panel').hidden = !currentUser;
    $('admin-panel').hidden = true;
    allowSyntheticIntake = false;
    if (!currentUser) {
      set('auth-message', 'Signed out. Sign in to view your own test records.');
      return;
    }
    set('auth-message', 'Signed in as ' + currentUser.email, 'success');
    const me = await api('/v1/me');
    $('admin-panel').hidden = !me.admin;
    if (me.admin) set('auth-message', 'Signed in with administrator access.', 'success');
    await refreshCases();
  } catch (err) {
    set('auth-message', safeError(err), 'error');
  }
}
async function withMessage(id, action) {
  try { set(id, 'Working…'); await action(); } catch (e) { set(id, safeError(e), 'error'); }
}
async function refreshCases() {
  const result = await api('/v1/cases');
  elements('case-list', result.cases, [['reference','Reference'],['category','Category'],['status','Status'],['created_at','Created']]);
}
async function refreshAdmin() {
  const result = await api('/v1/admin/cases');
  elements('admin-list', result.cases, [['reference','Reference'],['category','Category'],['status','Status'],['created_at','Created']]);
}
const email = () => $('email').value.trim();
function requireEmail() { if (!$('email').checkValidity()) throw new Error('Enter a valid email address.'); }
function preventIfUnconfigured() {
  if (!configured) throw new Error('Service is not configured. No information was sent.');
}
$('login-form').addEventListener('submit', e => {
  e.preventDefault();
  withMessage('auth-message', async () => {
    preventIfUnconfigured(); requireEmail();
    const result = await auth.signIn.email({ email: email(), password: $('password').value });
    if (result.error) throw new Error(safeError(result.error));
    $('password').value = '';
    await updateSession();
  });
});
$('register').addEventListener('click', () => withMessage('auth-message', async () => {
  preventIfUnconfigured(); requireEmail();
  const name = $('display-name').value.trim();
  if (!name || name.length > 80) throw new Error('Enter your name (up to 80 characters).');
  if ($('password').value.length < 12) throw new Error('Use a password with at least 12 characters.');
  const result = await auth.signUp.email({ email: email(), password: $('password').value, name });
  $('password').value = '';
  if (result.error) throw new Error(safeError(result.error));
  set('auth-message', 'Account request received. Complete email verification before using protected services.', 'success');
  await updateSession();
}));
$('sign-out').addEventListener('click', () => withMessage('auth-message', async () => {
  preventIfUnconfigured();
  const result = await auth.signOut();
  if (result?.error) throw new Error(safeError(result.error));
  await updateSession();
}));
$('send-otp').addEventListener('click', () => withMessage('otp-message', async () => {
  preventIfUnconfigured(); requireEmail();
  const result = await auth.emailOtp.sendVerificationOtp({ email: email(), type: 'email-verification' });
  if (result.error) throw new Error(safeError(result.error));
  set('otp-message', 'If eligible, a verification code has been sent. Check your email.', 'success');
}));
$('verify-otp').addEventListener('click', () => withMessage('otp-message', async () => {
  preventIfUnconfigured(); requireEmail();
  const code = $('otp').value.trim();
  if (!/^\d{4,12}$/.test(code)) throw new Error('Enter the numeric verification code.');
  const result = await auth.emailOtp.verifyEmail({ email: email(), otp: code });
  $('otp').value = '';
  if (result.error) throw new Error(safeError(result.error));
  set('otp-message', 'Email verified. Sign in to continue.', 'success');
  await updateSession();
}));
$('case-form').addEventListener('submit', e => {
  e.preventDefault();
  withMessage('case-message', async () => {
    preventIfUnconfigured();
    const description = $('description').value.trim();
    if (description.length < 20 || description.length > 3000) throw new Error('Description must be 20–3,000 characters.');
    const result = await api('/v1/cases', 'POST', { category: $('category').value, description });
    $('description').value = '';
    set('case-message', 'Synthetic case recorded: ' + result.case.reference, 'success');
    await refreshCases();
  });
});
$('refresh-cases').addEventListener('click', () => withMessage('case-message', async () => { await refreshCases(); set('case-message', 'Tracking updated.', 'success'); }));
$('refresh-admin').addEventListener('click', () => withMessage('auth-message', async () => { await refreshAdmin(); set('auth-message', 'Admin queue updated.', 'success'); }));

async function initialize() {
  if (!configured) {
    set('status', 'Not active: backend and identity service URLs have not been configured. All account operations are disabled.');
    for (const button of document.querySelectorAll('button')) button.disabled = true;
    return;
  }
  try {
    const response = await fetch(apiUrl + '/health', { cache: 'no-store' });
    if (!response.ok) throw new Error('Backend health check failed');
    const health = await response.json();
    set('status', health.accepts_real_complaints === false
      ? 'Staging mode: real complaints are not accepted. Use only fictional test data.'
      : 'Backend reachable. Check privacy notice and service permissions before submitting.');
    await updateSession();
  } catch {
    set('status', 'Secure backend unreachable. Do not submit information.', 'error');
    for (const button of document.querySelectorAll('button')) button.disabled = true;
  }
}
initialize();
