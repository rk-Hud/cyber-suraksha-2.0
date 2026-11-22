/* Account traffic is separate from the checker and planner. Session credentials live only in this closure. */
(function (root) {
  'use strict';
  class ApiError extends Error {
    constructor(code, status = 0, requestId = '') { super(code); this.code = code; this.status = status; this.requestId = requestId; }
  }
  function validatedBase(value) {
    if (!value) throw new ApiError('account_not_configured');
    let url;
    try { url = new URL(value); } catch (_) { throw new ApiError('account_not_configured'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || /\s/.test(value)) throw new ApiError('account_not_configured');
    return url.href.replace(/\/+$/, '');
  }
  function expiry(value) {
    if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
    return Date.parse(value);
  }
  function createClient(base, transport = root.fetch?.bind(root)) {
    const apiBase = validatedBase(base);
    if (typeof transport !== 'function') throw new ApiError('account_disconnected');
    let bearer = null;
    let expires = 0;
    let revision = 0;
    const pending = new Set();
    function clear() { revision += 1; bearer = null; expires = 0; for (const controller of pending) controller.abort(); pending.clear(); }
    return Object.freeze({
      setSession(session) {
        if (!session || typeof session.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.token) || !Number.isFinite(expiry(session.expiresAt)) || expiry(session.expiresAt) <= Date.now()) throw new ApiError('msg_request_failed');
        clear(); bearer = session.token; expires = expiry(session.expiresAt);
      },
      clearSession: clear,
      async request(path, method = 'GET', body, { authenticated = false } = {}) {
        if (!/^\/api\/v1\/[A-Za-z0-9_/?=&%.-]+$/.test(path) || path.includes('..') || !['GET', 'POST', 'PUT', 'PATCH'].includes(method)) throw new ApiError('msg_invalid_form');
        const startRevision = revision;
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (authenticated) {
          if (!bearer || expires <= Date.now()) { bearer = null; expires = 0; throw new ApiError('account_session_expired', 401); }
          headers.Authorization = 'Bearer ' + bearer;
        }
        const controller = new AbortController();
        if (authenticated) pending.add(controller);
        const timer = setTimeout(() => controller.abort(), 25000);
        let response, revokedCurrent = false;
        try {
          response = await transport(apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal });
          if (Number(response.headers?.get('content-length') || 0) > 524288) throw new ApiError('msg_request_failed', response.status);
          const text = await response.text();
          if (text.length > 524288) throw new ApiError('msg_request_failed', response.status);
          let payload;
          try { payload = JSON.parse(text); } catch (_) { throw new ApiError('account_disconnected', response.status); }
          if (startRevision !== revision) throw new ApiError('account_request_cancelled');
          const reference = typeof payload.requestId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(payload.requestId) ? payload.requestId : '';
          if (!response.ok || payload.error) {
            if (response.status === 401 && authenticated && startRevision === revision) { clear(); revokedCurrent = true; }
            const code = typeof payload.error?.code === 'string' && /^[a-z_]{3,80}$/.test(payload.error.code) ? payload.error.code : 'msg_request_failed';
            throw new ApiError(code, response.status, reference);
          }
          if (!Object.prototype.hasOwnProperty.call(payload, 'data')) throw new ApiError('msg_request_failed', response.status, reference);
          return payload.data;
        } catch (error) {
          if (startRevision !== revision && !revokedCurrent && error.code !== 'account_request_cancelled') throw new ApiError('account_request_cancelled');
          if (error instanceof ApiError) throw error;
          throw new ApiError('account_disconnected');
        } finally { pending.delete(controller); clearTimeout(timer); }
      }
    });
  }
  function validChallenge(value) {
    if (!value || typeof value.id !== 'string' || typeof value.token !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.id) || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || !Number.isFinite(expiry(value.expiresAt)) || expiry(value.expiresAt) <= Date.now()) throw new ApiError('msg_request_failed');
    return { id: value.id, token: value.token, purpose: value.purpose, expiresAt: expiry(value.expiresAt) };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createClient, validatedBase, validChallenge, ApiError, expiry };
  if (typeof document === 'undefined') return;

  const language = ['en', 'hi', 'te'].includes(document.documentElement.lang) ? document.documentElement.lang : 'en';
  const basePath = document.documentElement.dataset.basePath || '';
  const dictionary = { ...(root.CyberSurakshaAccountCopy || {}) };
  const t = (key) => Object.prototype.hasOwnProperty.call(dictionary, key) && typeof dictionary[key] === 'string' ? dictionary[key] : dictionary.error_generic || 'The request could not be completed.';
  const app = document.getElementById('account-app');
  const clientBase = document.documentElement.dataset.apiUrl || '';
  let client;
  try { client = createClient(clientBase); } catch (error) {
    const status = document.getElementById(app ? 'account-service-status' : 'citizen-service-status');
    if (status) status.textContent = t(error.code);
    if (app) app.querySelectorAll('form button[type="submit"], #mfa-start').forEach(button => { button.disabled = true; });
    return;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function action(text, callback, className = 'button button-secondary') {
    const button = element('button', text, className); button.type = 'button'; button.addEventListener('click', callback); return button;
  }
  function formatTime(value) {
    const date = new Date(expiry(value));
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : language === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date) + ' IST';
  }
  function statusBadge(status) { return element('span', t('status_' + status), 'status-badge status-' + (['pending', 'in_review', 'awaiting_info', 'resolved', 'closed'].includes(status) ? status : 'pending')); }
  function applyCopy() {
    document.querySelectorAll('[data-copy-key]').forEach(node => { const value = dictionary[node.dataset.copyKey]; if (typeof value === 'string') node.textContent = value; });
    for (const attribute of ['aria-label', 'placeholder', 'title']) {
      document.querySelectorAll('[data-copy-' + attribute + ']').forEach(node => { const key = node.getAttribute('data-copy-' + attribute); if (typeof dictionary[key] === 'string') node.setAttribute(attribute, dictionary[key]); });
    }
  }
  function safePublicContent(data) {
    if (!Array.isArray(data?.sections)) return;
    const sections = Object.fromEntries(data.sections.filter(item => typeof item.section === 'string').map(item => [item.section, item.content]));
    const copy = sections['copy_' + language];
    if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
      for (const [key, value] of Object.entries(copy)) if (typeof value === 'string' && value.length <= 4000 && Object.prototype.hasOwnProperty.call(dictionary, key)) dictionary[key] = value;
      applyCopy();
    }
    const branding = sections.branding;
    if (branding && typeof branding.title === 'string' && branding.title.length <= 100) {
      document.querySelectorAll('.brand strong, .footer-brand').forEach(node => { node.textContent = branding.title; });
      if (typeof branding.tagline?.[language] === 'string') document.querySelectorAll('.brand small').forEach(node => { node.textContent = branding.tagline[language]; });
      const logo = branding.logo_url;
      if (typeof logo === 'string' && /^\/static\/img\/[A-Za-z0-9_-]+\.(svg|png|webp)$/.test(logo)) {
        document.querySelectorAll('.brand-mark, .overview-symbol').forEach(node => { node.src = basePath + logo; });
      }
    }
    const advisory = sections.advisory;
    const banner = document.getElementById('live-advisory');
    if (banner && advisory && typeof advisory.active === 'boolean') {
      banner.hidden = !advisory.active;
      banner.classList.toggle('advisory-high', advisory.priority === 'high');
      const heading = document.getElementById('live-advisory-heading');
      const text = document.getElementById('live-advisory-text');
      if (heading) heading.textContent = t(advisory.priority === 'high' ? 'advisory_high' : 'advisory');
      if (text) text.textContent = typeof advisory.text?.[language] === 'string' ? advisory.text[language] : '';
    }
    if (Array.isArray(sections.resources) && sections.resources.length === 20) {
      const body = document.getElementById('agency-body');
      if (body) {
        const rows = [];
        for (const agency of sections.resources) {
          let destination;
          try { destination = new URL(agency.url); } catch (_) { return; }
          if (destination.protocol !== 'https:' || destination.username || destination.password || !['india', 'international', 'national'].includes(agency.group)) return;
          const row = element('tr'); row.dataset.group = agency.group;
          row.dataset.search = [agency.acronym, agency.name?.en, agency.name?.[language], agency.region?.en, agency.region?.[language], agency.purpose?.[language]].join(' ').toLocaleLowerCase();
          const name = element('th'); name.scope = 'row';
          const link = element('a', agency.acronym + ' ↗'); link.href = destination.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          name.append(link, element('span', agency.name?.[language], 'agency-full-name'), element('span', agency.region?.[language], 'agency-region'));
          row.append(name, element('td', agency.purpose?.[language]), element('td', agency.reporting?.[language])); rows.push(row);
        }
        body.replaceChildren(...rows); document.dispatchEvent(new CustomEvent('cyber-resources-updated'));
      }
    }
  }

  let readiness;
  const state = { adminLogin: false, googleClientId: '', user: null, challenge: null, view: 'login', features: {}, mfaAt: 0, setup: null, caseData: null, returnView: 'admin', preserveReturn: false, pages: { cases: 1, admin: 1, users: 1 }, loaded: new Set() };
  const panels = app ? [...app.querySelectorAll('[data-account-panel]')] : [];
  const inFlight = new WeakSet();
  function message(code, error = false, reference = '') {
    const box = document.getElementById('account-message'); if (!box) return;
    box.replaceChildren(element('strong', t(error ? 'form_error_title' : 'notice_title')), element('p', t(code)));
    if (reference) box.append(element('small', t('account_request_reference') + ': ' + reference));
    box.classList.toggle('message-error', error); box.hidden = false;
  }
  function dismiss() { const box = document.getElementById('account-message'); if (box) { box.hidden = true; box.replaceChildren(); } }
  function clearSensitive() {
    state.user = null; state.challenge = null; state.setup = null; state.caseData = null; state.mfaAt = 0; state.loaded.clear(); client.clearSession();
    app?.querySelectorAll('form').forEach(form => form.reset());
    for (const id of ['citizen-cases', 'citizen-pagination', 'case-detail-content', 'admin-summary', 'admin-cases', 'admin-pagination', 'admin-users', 'users-pagination', 'admin-logins', 'admin-audit', 'admin-content', 'mfa-secret-value']) document.getElementById(id)?.replaceChildren();
    const uri = document.getElementById('mfa-setup-uri'); if (uri) uri.value = '';
    const secret = document.getElementById('mfa-secret'); if (secret) secret.hidden = true;
    const confirm = document.getElementById('account-mfa-confirm'); if (confirm) confirm.hidden = true;
    updateNavigation(); notifyGoogleState();
  }
  function handleError(error) {
    if (error.code === 'account_request_cancelled') return;
    if (error.status === 401) { clearSensitive(); showView('login'); message('account_session_expired', true, error.requestId); return; }
    if (error.code === 'msg_mfa_required' && state.user?.role === 'owner') {
      state.returnView = state.view; state.preserveReturn = state.loaded.has(state.view); showView('mfa'); message('account_mfa_needed', true, error.requestId); return;
    }
    message(error.code || 'error_generic', true, error.requestId || '');
  }
  async function task(work) { try { await work(); } catch (error) { handleError(error); } }
  function googleState() {
    const configuredId = document.documentElement.dataset.googleClientId || '';
    return { enabled: Boolean(app && state.features.googleSignIn && configuredId && configuredId === state.googleClientId), citizenLogin: Boolean(app && !state.user && state.view === 'login' && !state.adminLogin), registration: state.features.googleRegistration === true };
  }
  function notifyGoogleState() { document.dispatchEvent(new CustomEvent('cyber-account-state')); }
  function updateAvailability() {
    app?.querySelectorAll('[data-email-required] button[type="submit"]').forEach(button => { button.disabled = !state.features.emailOtp; });
    app?.querySelectorAll('[data-registration-required] button[type="submit"]').forEach(button => { button.disabled = !state.features.registration || !state.features.emailOtp; });
  }
  function updateNavigation() {
    if (!app) return;
    const nav = document.getElementById('account-navigation'); nav.replaceChildren();
    const ownerLink = document.getElementById('operator-entry-link');
    const items = state.user
      ? [['cases', 'nav_account'], ['new-case', 'new_complaint']]
      : [['login', 'sign_in'], ['register', 'create_account'],
        ...(ownerLink ? [] : [['admin-login', 'admin_sign_in']])];
    if (state.user?.role === 'owner') items.push(['admin', 'admin_dashboard'], ['users', 'admin_users'], ['content', 'admin_content'], ['mfa', 'mfa_settings']);
    for (const [view, label] of items) {
      const button = action(t(label), () => showView(view), 'workspace-link');
      button.dataset.accountView = view; nav.append(button);
    }
    if (ownerLink) {
      // Navigation only. The operator service independently verifies Google,
      // a distinct admin password, MFA, role and revocable session.
      const link = document.createElement('a');
      link.className = 'workspace-link'; link.textContent = t('admin_sign_in');
      link.href = ownerLink.href; nav.append(link);
    }
    if (state.user) nav.append(action(t('sign_out'), () => task(async () => {
      try { await client.request('/api/v1/auth/logout', 'POST', {}, { authenticated: true }); }
      finally { clearSensitive(); showView('login'); }
      message('notice_signed_out');
    }), 'workspace-link'));
    const identity = document.getElementById('signed-in-identity'); identity.hidden = !state.user;
    identity.replaceChildren(); if (state.user) identity.append(element('span', t('session_identity') + ' '), element('strong', state.user.name));
  }
  // Clear private DOM as well as credentials before a history cache can retain this page.
  root.addEventListener('pagehide', () => { clearSensitive(); showView('login'); });
  async function showView(name, { load = true } = {}) {
    if (!app) return;
    dismiss();
    const adminLogin = name === 'admin-login';
    if (adminLogin) name = 'login';
    const publicViews = ['login', 'register', 'verify', 'forgot', 'reset'];
    if (!publicViews.includes(name) && !state.user) { name = 'login'; message('account_auth_required', true); }
    if (['admin', 'users', 'content', 'mfa'].includes(name) && state.user?.role !== 'owner') { name = 'cases'; message('msg_forbidden', true); }
    if (!panels.some(panel => panel.dataset.accountPanel === name)) name = 'login';
    state.view = name; state.adminLogin = adminLogin; notifyGoogleState();
    panels.forEach(panel => { panel.hidden = panel.dataset.accountPanel !== name; });
    if (name === 'login') {
      document.getElementById('login-heading').textContent = t(adminLogin ? 'account_admin_title' : 'account_login_title');
      document.getElementById('login-description').textContent = t(adminLogin ? 'portal_admin_body' : 'portal_login_body');
    }
    if (name === 'mfa') {
      const enabled = Boolean(state.user?.totpEnabled);
      document.getElementById('mfa-enabled').hidden = !enabled;
      document.getElementById('mfa-enrollment').hidden = enabled;
    }
    updateAvailability();
    if (!load) return;
    if (name === 'cases') await task(loadCases);
    if (name === 'admin') await task(loadAdmin);
    if (name === 'users') await task(loadUsers);
    if (name === 'content') await task(loadContent);
  }
  function formValues(form) { const values = Object.fromEntries(new FormData(form)); if (form.querySelector('[name="consent"]')) values.consent = Boolean(form.elements.consent.checked); return values; }
  function bindForm(id, work) {
    const form = document.getElementById(id); if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (inFlight.has(form) || !form.reportValidity()) return;
      inFlight.add(form); dismiss(); const button = form.querySelector('button[type="submit"]'); const label = button?.textContent;
      if (button) { button.disabled = true; button.textContent = t('account_working'); }
      try { await work(formValues(form), form); }
      catch (error) { handleError(error); }
      finally { inFlight.delete(form); if (button) { button.disabled = false; button.textContent = label; } updateAvailability(); }
    });
  }
  function challengePayload(values) {
    if (!state.challenge || state.challenge.expiresAt <= Date.now()) throw new ApiError('msg_code_invalid');
    return { challengeId: state.challenge.id, flowToken: state.challenge.token, code: values.code };
  }
  function beginChallenge(data, target) { state.challenge = validChallenge(data.challenge); showView(target); message(target === 'reset' ? 'msg_reset_check_email' : 'notice_otp_sent'); }
  function table(headers, records, draw) {
    const wrap = element('div', null, 'table-wrap workspace-table-wrap'); const grid = element('table', null, 'workspace-table'); const head = element('thead'); const row = element('tr');
    for (const label of headers) { const cell = element('th', t(label)); cell.scope = 'col'; row.append(cell); }
    head.append(row); const body = element('tbody'); for (const record of records) body.append(draw(record)); grid.append(head, body); wrap.append(grid); return wrap;
  }
  function pagination(id, data, callback) {
    const host = document.getElementById(id); host.replaceChildren();
    const info = data?.pagination; if (!info || Number(info.pages) <= 1) return;
    const page = Number(info.page), pages = Number(info.pages);
    host.append(element('span', t('account_page') + ' ' + page + ' / ' + pages));
    if (page > 1) host.append(action(t('account_previous'), () => callback(page - 1)));
    if (page < pages) host.append(action(t('next_page'), () => callback(page + 1)));
  }
  function caseTable(records) {
    return table(['case_reference', 'case_subject', 'case_status', 'case_updated'], records, record => {
      const row = element('tr'); const ref = element('th'); ref.scope = 'row';
      ref.append(action(record.reference, () => task(() => loadCase(record.id)), 'record-open'));
      row.append(ref, element('td', record.subject), element('td'), element('td', formatTime(record.updated_at))); row.children[2].append(statusBadge(record.status)); return row;
    });
  }
  async function loadCases() {
    const host = document.getElementById('citizen-cases'); host.replaceChildren(element('p', t('account_loading')));
    const data = await client.request('/api/v1/cases?page=' + state.pages.cases, 'GET', undefined, { authenticated: true });
    const records = Array.isArray(data.cases) ? data.cases : [];
    host.replaceChildren(records.length ? caseTable(records) : element('p', t('cases_empty_body'), 'empty-state'));
    pagination('citizen-pagination', data, page => { state.pages.cases = page; task(loadCases); }); state.loaded.add('cases');
  }
  async function loadCase(identifier) {
    const data = await client.request('/api/v1/cases/' + encodeURIComponent(identifier), 'GET', undefined, { authenticated: true });
    if (!data.case?.id) throw new ApiError('msg_request_failed');
    state.caseData = data;
    await showView('case-detail');
    const record = data.case; const host = document.getElementById('case-detail-content'); host.replaceChildren();
    const heading = element('div', null, 'workspace-heading'); const headingText = element('div'); headingText.append(element('p', record.reference, 'eyebrow'), element('h2', record.subject), element('p', t('category_' + record.category) + ' · ' + formatTime(record.created_at))); heading.append(headingText, statusBadge(record.status)); host.append(heading);
    const layout = element('div', null, 'case-detail-layout'); const main = element('div'); const original = element('article', null, 'surface case-original'); original.append(element('h3', t('case_original')), element('p', record.details, 'submitted-text'));
    if (state.user.role === 'owner' && data.owner) original.append(element('p', data.owner.name), element('p', data.owner.email));
    main.append(original);
    const timeline = element('section', null, 'case-timeline'); timeline.append(element('h3', t('case_timeline'))); const events = element('ol', null, 'timeline-list');
    for (const event of Array.isArray(data.events) ? data.events : []) {
      const item = element('li'); const meta = element('div', null, 'timeline-meta'); meta.append(element('strong', t(event.author_role === 'owner' ? 'case_owner' : event.author_role === 'citizen' ? 'case_citizen' : 'case_system')), element('span', formatTime(event.created_at))); item.append(meta);
      if (event.new_status) item.append(statusBadge(event.new_status)); if (event.message) item.append(element('p', event.message, 'submitted-text')); events.append(item);
    }
    timeline.append(events.children.length ? events : element('p', t('case_no_activity'))); main.append(timeline);
    const side = element('aside'); const panel = element('div', null, 'surface form-panel'); const owner = state.user.role === 'owner';
    panel.append(element('h3', t(owner ? 'admin_case_update' : 'case_reply')));
    const form = element('form', null, 'stack-form'); form.id = 'case-action-form'; form.method = 'post'; form.action = '#';
    if (owner) {
      const label = element('label', t('case_status'), 'field-label'); label.htmlFor = 'detail-status'; const select = element('select'); select.id = 'detail-status'; select.name = 'status';
      const transitions = { pending: ['in_review', 'awaiting_info', 'closed'], in_review: ['awaiting_info', 'resolved', 'closed'], awaiting_info: ['in_review', 'resolved', 'closed'], resolved: ['in_review', 'closed'], closed: ['in_review'] };
      for (const status of [record.status, ...(transitions[record.status] || [])]) { const option = element('option', t('status_' + status)); option.value = status; select.append(option); }
      form.append(label, select);
    }
    const label = element('label', t(owner ? 'admin_case_message' : 'case_reply'), 'field-label'); label.htmlFor = 'detail-message'; const input = element('textarea'); input.id = 'detail-message'; input.name = 'message'; input.required = true; input.minLength = 3; input.maxLength = 3000; input.rows = 7; input.autocomplete = 'off';
    const submit = element('button', t(owner ? 'admin_case_save' : 'case_reply_submit'), 'button button-dark'); submit.type = 'submit'; form.append(label, input, element('p', t(owner ? 'admin_case_update_note' : 'case_reply_hint'), 'field-hint'), submit); panel.append(form); side.append(panel, element('p', t('case_notification_note'), 'field-hint side-caption'), action(t(owner ? 'admin_complaints' : 'case_back'), () => showView(owner ? 'admin' : 'cases'))); layout.append(main, side); host.append(layout);
    bindForm('case-action-form', async (values, currentForm) => {
      const path = owner ? '/api/v1/admin/cases/' + encodeURIComponent(record.id) : '/api/v1/cases/' + encodeURIComponent(record.id) + '/replies';
      const body = owner ? { status: values.status, message: values.message, version: Number(record.version) } : { message: values.message };
      await client.request(path, owner ? 'PATCH' : 'POST', body, { authenticated: true }); currentForm.reset(); await loadCase(record.id); message(owner ? 'notice_case_updated' : 'notice_reply_saved');
    }); state.loaded.add('case-detail');
  }
  async function loadAdmin() {
    const [summary, data] = await Promise.all([client.request('/api/v1/admin/summary', 'GET', undefined, { authenticated: true }), client.request('/api/v1/admin/cases?page=' + state.pages.admin, 'GET', undefined, { authenticated: true })]);
    const count = summary.counts || {}; const stats = element('dl', null, 'workspace-stats');
    for (const [label, value] of [['admin_total_users', count.users], ['admin_total_cases', Number(count.pending || 0) + Number(count.inReview || 0) + Number(count.awaitingInfo || 0) + Number(count.resolved || 0) + Number(count.closed || 0)], ['admin_pending_cases', count.pending], ['pending_notifications', count.notifications]]) { const cell = element('div'); cell.append(element('dt', t(label)), element('dd', value ?? 0)); stats.append(cell); }
    const host = document.getElementById('admin-summary'); host.replaceChildren(stats);
    const delivery = element('div', null, 'boundary-note'); delivery.append(element('p', t('account_delivery_note')));
    delivery.append(action(t('account_delivery_action'), () => task(async () => { const result = await client.request('/api/v1/admin/notifications/send-one', 'POST', {}, { authenticated: true }); message(result.delivered || result.sent ? 'msg_manual_notification_sent' : 'msg_manual_notification_empty'); await loadAdmin(); }))); host.append(delivery);
    const records = Array.isArray(data.cases) ? data.cases : []; document.getElementById('admin-cases').replaceChildren(records.length ? caseTable(records) : element('p', t('admin_queue_empty'), 'empty-state'));
    pagination('admin-pagination', data, page => { state.pages.admin = page; task(loadAdmin); });
    const logins = Array.isArray(summary.logins) ? summary.logins : [];
    document.getElementById('admin-logins').replaceChildren(logins.length ? table(['login_time', 'login_email', 'login_name', 'login_result', 'login_source'], logins, item => {
      const row = element('tr'); row.append(element('td', formatTime(item.created_at)), element('td', item.email || '—'), element('td', item.name || '—'), element('td', t(item.success ? 'login_success' : 'login_failure')), element('td', item.ip_label || '—')); return row;
    }) : element('p', t('login_empty')));
    const audit = Array.isArray(summary.audit) ? summary.audit : [];
    document.getElementById('admin-audit').replaceChildren(audit.length ? table(['login_time', 'content_section', 'case_reference'], audit, item => { const row = element('tr'); row.append(element('td', formatTime(item.created_at)), element('td', item.action || '—'), element('td', item.record_id || item.record || '—')); return row; }) : element('p', t('login_empty')));
    state.loaded.add('admin');
  }
  async function loadUsers() {
    const data = await client.request('/api/v1/admin/users?page=' + state.pages.users, 'GET', undefined, { authenticated: true }); const records = Array.isArray(data.users) ? data.users : [];
    const host = document.getElementById('admin-users');
    host.replaceChildren(records.length ? table(['name', 'email', 'user_role', 'user_state'], records, user => {
      const row = element('tr'); row.append(element('td', user.name), element('td', user.email), element('td', t(user.role === 'owner' ? 'user_owner_role' : 'user_citizen_role'))); const cell = element('td');
      if (user.role === 'owner') cell.append(element('span', t('user_own_protected')));
      else {
        const form = element('form', null, 'inline-account-form'); form.method = 'post'; form.action = '#'; form.id = 'user-state-' + user.id; const select = element('select'); select.name = 'active'; select.setAttribute('aria-label', t('user_state'));
        for (const [value, label] of [['true', 'user_active'], ['false', 'user_disabled']]) { const option = element('option', t(label)); option.value = value; option.selected = String(Boolean(user.active)) === value; select.append(option); }
        const button = element('button', t('user_save'), 'button button-secondary'); button.type = 'submit'; form.append(select, button); cell.append(form);
        queueMicrotask(() => bindForm(form.id, async values => { const body = { active: values.active === 'true' }; if (Number.isInteger(user.version)) body.version = user.version; await client.request('/api/v1/admin/users/' + encodeURIComponent(user.id), 'PATCH', body, { authenticated: true }); await loadUsers(); message('notice_user_updated'); }));
      }
      row.append(cell); return row;
    }) : element('p', t('users_empty')));
    pagination('users-pagination', data, page => { state.pages.users = page; task(loadUsers); }); state.loaded.add('users');
  }
  async function loadContent() {
    const data = await client.request('/api/v1/admin/content', 'GET', undefined, { authenticated: true }); const host = document.getElementById('admin-content'); host.replaceChildren();
    for (const section of Array.isArray(data.sections) ? data.sections : []) {
      if (!/^[a-z_]{3,40}$/.test(section.section) || !Number.isInteger(section.version)) continue;
      const item = element('details', null, 'surface content-editor'); const summary = element('summary'); summary.append(element('strong', section.section), element('span', t('admin_record_version') + ': ' + section.version)); item.append(summary);
      const form = element('form', null, 'stack-form'); form.method = 'post'; form.action = '#'; form.id = 'content-' + section.section;
      const label = element('label', t('content_json'), 'field-label'); label.htmlFor = 'content-value-' + section.section; const input = element('textarea', null, 'json-editor'); input.name = 'content'; input.id = label.htmlFor; input.value = JSON.stringify(section.content, null, 2); input.required = true; input.rows = 16; input.spellcheck = false; input.autocomplete = 'off';
      const button = element('button', t('content_save'), 'button button-dark'); button.type = 'submit'; form.append(label, input, button); item.append(form); host.append(item);
      bindForm(form.id, async values => { let content; try { content = JSON.parse(values.content); } catch (_) { throw new ApiError('account_json_invalid'); } await client.request('/api/v1/admin/content/' + section.section, 'PUT', { content, version: section.version }, { authenticated: true }); await loadContent(); message('notice_content_updated'); });
    }
    if (!host.children.length) host.append(element('p', t('content_empty'))); state.loaded.add('content');
  }
  async function ready() {
    try {
      const health = await client.request('/api/v1/health');
      state.features = Object.fromEntries(['registration', 'emailOtp', 'complaints', 'admin', 'googleSignIn', 'googleRegistration'].map(key => [key, health.features?.[key] === true]));
      state.googleClientId = typeof health.googleClientId === 'string' ? health.googleClientId : '';
      const code = !state.features.emailOtp ? 'account_mail_closed' : !state.features.registration ? 'account_registration_closed' : 'account_ready';
      const status = document.getElementById(app ? 'account-service-status' : 'citizen-service-status'); if (status) status.textContent = googleState().enabled ? t('google_service_ready') : t(code);
      updateAvailability(); notifyGoogleState();
      client.request('/api/v1/public/content').then(safePublicContent).catch(() => {});
    } catch (error) {
      const status = document.getElementById(app ? 'account-service-status' : 'citizen-service-status'); if (status) status.textContent = t(error.code || 'account_disconnected');
      state.features = {}; updateAvailability(); notifyGoogleState();
    }
  }
  // The Google UI receives only a short-lived API challenge. Identity tokens
  // never become application sessions until the server verifies and consumes it.
  root.CyberSurakshaGoogleAuth = Object.freeze({
    ready: () => readiness,
    state: googleState,
    async begin() {
      if (!googleState().enabled || !googleState().citizenLogin) throw new ApiError('msg_service_unavailable', 503);
      const data = await client.request('/api/v1/auth/google/challenge', 'POST', { locale: language });
      const flow = validChallenge(data.challenge);
      if (data.challenge.purpose !== 'google' || typeof data.challenge.nonce !== 'string') throw new ApiError('msg_request_failed');
      return { ...flow, nonce: data.challenge.nonce };
    },
    async finish(values, stillCurrent) {
      try {
        if (!googleState().enabled || !googleState().citizenLogin || typeof stillCurrent !== 'function' || !stillCurrent()) throw new ApiError('account_request_cancelled');
        const data = await client.request('/api/v1/auth/google', 'POST', { ...values, locale: language });
        if (!stillCurrent()) throw new ApiError('account_request_cancelled');
        if (data.user?.role !== 'citizen') throw new ApiError('msg_forbidden', 403);
        client.setSession(data); state.user = data.user; state.challenge = null;
        app.querySelectorAll('form').forEach(form => form.reset());
        updateNavigation(); notifyGoogleState(); await showView('cases');
      } catch (error) {
        if (typeof stillCurrent !== 'function' || !stillCurrent()) throw new ApiError('account_request_cancelled');
        handleError(error); throw error;
      }
    }
  });
  if (!app) { readiness = ready(); return; }
  app.querySelectorAll('[data-account-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.accountView)));
  updateNavigation();
  bindForm('account-register', async (values, form) => {
    if (!state.features.registration || !state.features.emailOtp) throw new ApiError('msg_registration_closed');
    const data = await client.request('/api/v1/auth/register', 'POST', { ...values, locale: language }); form.reset(); beginChallenge(data, 'verify');
  });
  bindForm('account-login', async (values, form) => {
    if (!state.features.emailOtp) throw new ApiError('msg_mail_unavailable');
    const data = await client.request('/api/v1/auth/login', 'POST', { ...values, locale: language }); form.reset(); beginChallenge(data, 'verify');
  });
  bindForm('account-verify', async (values, form) => {
    const data = await client.request('/api/v1/auth/verify', 'POST', challengePayload(values)); form.reset(); state.challenge = null;
    if (data.loginRequired) { await showView('login'); message('msg_registration_check_email'); return; }
    if (!data.user || !['owner', 'citizen'].includes(data.user.role)) throw new ApiError('msg_request_failed');
    client.setSession(data); state.user = data.user; updateNavigation(); await showView(state.user.role === 'owner' ? 'mfa' : 'cases');
  });
  bindForm('account-forgot', async (values, form) => { const data = await client.request('/api/v1/auth/forgot', 'POST', { ...values, locale: language }); form.reset(); beginChallenge(data, 'reset'); });
  bindForm('account-reset', async (values, form) => { await client.request('/api/v1/auth/reset', 'POST', { ...challengePayload(values), password: values.password, confirmPassword: values.confirmPassword }); form.reset(); state.challenge = null; clearSensitive(); await showView('login'); message('notice_password_reset'); });
  bindForm('account-new-case', async (values, form) => { const data = await client.request('/api/v1/cases', 'POST', values, { authenticated: true }); const record = data.case || data; if (!record.id) throw new ApiError('msg_request_failed'); form.reset(); await loadCase(record.id); message('notice_case_created'); });
  document.getElementById('mfa-start').addEventListener('click', () => task(async () => {
    const data = await client.request('/api/v1/admin/mfa/start', 'POST', {}, { authenticated: true });
    if (typeof data.secret !== 'string' || typeof data.uri !== 'string') throw new ApiError('msg_request_failed');
    state.setup = data; document.getElementById('mfa-secret-value').textContent = data.secret; document.getElementById('mfa-setup-uri').value = data.uri; document.getElementById('mfa-secret').hidden = false; document.getElementById('account-mfa-confirm').hidden = false;
  }));
  async function verifiedMfa() {
    state.user.totpEnabled = true; state.mfaAt = Date.now(); state.setup = null;
    document.getElementById('mfa-secret-value').replaceChildren(); document.getElementById('mfa-setup-uri').value = ''; document.getElementById('mfa-secret').hidden = true; document.getElementById('account-mfa-confirm').hidden = true;
    const target = state.returnView || 'admin'; await showView(target, { load: !state.preserveReturn }); state.preserveReturn = false; message('notice_mfa_verified');
  }
  bindForm('account-mfa-confirm', async (values, form) => { await client.request('/api/v1/admin/mfa/confirm', 'POST', values, { authenticated: true }); form.reset(); await verifiedMfa(); });
  bindForm('account-mfa-verify', async (values, form) => { await client.request('/api/v1/admin/mfa/verify', 'POST', values, { authenticated: true }); form.reset(); await verifiedMfa(); });
  const ownerLink = document.getElementById('operator-entry-link');
  // Old admin bookmarks lead to the same independent owner sign-in service.
  // Do not ask for an operator password on the citizen authentication form.
  if (location.hash === '#admin' && ownerLink) {
    location.replace(ownerLink.href);
    readiness = ready();
    return;
  }
  const firstView = location.hash === '#admin' ? 'admin-login' : location.hash === '#register' ? 'register' : 'login';
  showView(firstView); readiness = ready();
})(globalThis);
