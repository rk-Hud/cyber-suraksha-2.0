// Operator-only browser client. No browser persistence, cookies, analytics or token logs.
// Source-only: enabled exclusively by the private staging operator URL in build config.
(() => {
  'use strict';
  const root = document.documentElement;
  const base = root.dataset.operatorApiUrl || '';
  const clientId = root.dataset.googleClientId || '';
  const status = document.getElementById('operator-status');
  const buttonHost = document.getElementById('operator-google-button');
  const challengeButton = document.getElementById('operator-challenge');
  const modeSelect = document.getElementById('operator-mode');
  const credentials = document.getElementById('operator-credentials');
  const enrollment = document.getElementById('operator-enrollment');
  const dashboard = document.getElementById('operator-dashboard');
  const casesHost = document.getElementById('operator-cases');
  const session = { bearer: '', expiresAt: 0, provisionId: '', secret: '', mode: 'login', challenge: null };
  const text = (element, value) => { element.textContent = String(value); };
  const message = (value) => text(status, value);
  if (!/^https:\/\/br-sweet-band-azhwai4r-[a-z0-9]+\.compute\.[a-z0-9.-]+\.neon\.tech$/.test(base) || !clientId) {
    challengeButton.disabled = true;
    message('Private administrator enrollment is not active. The separate operator service must be approved first.');
    return;
  }
  async function call(path, payload, bearer = '') {
    const headers = { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) };
    const response = await fetch(base + '/operator/v1/' + path, {
      method: payload === undefined ? 'GET' : path.startsWith('cases/') && payload.status ? 'PATCH' : 'POST',
      headers, cache: 'no-store', credentials: 'omit', redirect: 'error',
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.code || 'operator_request_failed');
    return result.data;
  }
  const clear = () => {
    credentials.querySelectorAll('input[type=password],input[name=code]').forEach(x => { x.value = ''; });
  };
  const resetProof = () => { session.challenge = null; buttonHost.replaceChildren(); };
  async function beginChallenge() {
    resetProof(); clear();
    session.mode = modeSelect.value;
    if (session.mode === 'finish' && !session.provisionId) {
      message('Start owner enrollment and scan the authenticator code before finishing.');
      return;
    }
    challengeButton.disabled = true;
    try {
      const proof = await call('challenge', {});
      session.challenge = proof;
      message('Choose the approved Google account below. Its signed identity will be checked by the server.');
      const render = () => {
        if (!session.challenge) return;
        google.accounts.id.initialize({
          client_id: clientId, nonce: proof.nonce,
          auto_select: false, cancel_on_tap_outside: true,
          callback: async event => {
            if (!session.challenge || session.challenge.challengeId !== proof.challengeId) return;
            await submitProof(event?.credential || '');
          },
        });
        google.accounts.id.renderButton(buttonHost, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
      };
      if (window.google?.accounts?.id) render();
      else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
        script.onload = render; script.onerror = () => message('Google verification could not load.');
        document.head.append(script);
      }
    } catch (error) { message('Owner challenge unavailable: ' + error.message); }
    finally { challengeButton.disabled = false; }
  }
  async function submitProof(credential) {
    if (!credential || !session.challenge) return message('Google identity proof was not received.');
    const proof = session.challenge; resetProof();
    const common = { challengeId: proof.challengeId, nonce: proof.nonce, credential };
    let request;
    try {
      if (session.mode === 'begin') {
        request = { ...common, approvalKey: credentials.elements.approvalKey.value,
          password: credentials.elements.password.value,
          confirmPassword: credentials.elements.confirmPassword.value };
        const data = await call('begin', request);
        session.provisionId = data.provisionId;
        session.secret = data.secret;
        text(document.getElementById('operator-totp-seed'), data.secret);
        text(document.getElementById('operator-totp-uri'), data.uri);
        enrollment.hidden = false;
        message('Add this one-time secret to your authenticator app. Then choose Finish enrollment.');
      } else if (session.mode === 'finish') {
        request = { ...common, approvalKey: credentials.elements.approvalKey.value,
          provisionId: session.provisionId, code: credentials.elements.code.value };
        await call('finish', request);
        session.provisionId = ''; session.secret = '';
        text(document.getElementById('operator-totp-seed'), '');
        text(document.getElementById('operator-totp-uri'), '');
        enrollment.hidden = true;
        message('Owner enrolled. Select Login and complete a fresh Google challenge and TOTP.');
      } else {
        request = { ...common, password: credentials.elements.password.value,
          code: credentials.elements.code.value };
        const data = await call('login', request);
        session.bearer = data.token;
        session.expiresAt = data.expiresAt;
        dashboard.hidden = false;
        message('Administrator authenticated with fresh MFA. This session is held only in page memory.');
        await loadCases();
      }
    } catch (error) { message('Operator authentication denied: ' + error.message); }
    finally {
      clear();
      request = null;
      credential = '';
    }
  }
  async function loadCases() {
    if (!session.bearer) return;
    try {
      const list = await call('cases', undefined, session.bearer);
      casesHost.replaceChildren();
      for (const item of list.cases) {
        const article = document.createElement('article');
        article.className = 'surface auth-panel';
        const title = document.createElement('h3');
        text(title, item.reference + ' — ' + item.subject);
        const state = document.createElement('p');
        text(state, 'Status: ' + item.status + ' | Version: ' + item.version);
        const form = document.createElement('form');
        form.className = 'stack-form'; form.setAttribute('action', '#');
        const select = document.createElement('select'); select.setAttribute('aria-label', 'Updated case status');
        for (const name of ['pending','in_review','awaiting_info','resolved','closed']) {
          const option = document.createElement('option'); option.value = name; text(option, name);
          option.selected = name === item.status; select.append(option);
        }
        const note = document.createElement('textarea'); note.required = true; note.minLength = 3;
        note.maxLength = 3000; note.setAttribute('aria-label', 'Fictional case investigation note');
        const action = document.createElement('button'); action.type = 'submit';
        action.className = 'button button-dark'; text(action, 'Save fictional case status');
        form.append(select,note,action);
        form.addEventListener('submit', async event => {
          event.preventDefault(); action.disabled = true;
          try {
            await call('cases/' + encodeURIComponent(item.id),
              { status: select.value, version: item.version, message: note.value }, session.bearer);
            message('Fictional case updated and audit event recorded.');
            await loadCases();
          } catch(error) { message('Update denied: ' + error.message); }
          finally { action.disabled = false; }
        });
        article.append(title,state,form); casesHost.append(article);
      }
      if (!list.cases.length) message('No fictional cases are registered.');
    } catch(error) { message('Case list denied: ' + error.message); }
  }
  credentials.addEventListener('submit', event => { event.preventDefault(); void beginChallenge(); });
  modeSelect.addEventListener('change', () => {
    resetProof(); message('Choose Start Google verification to begin a new challenge.');
  });
  document.getElementById('operator-refresh').addEventListener('click', () => void loadCases());
  document.getElementById('operator-logout').addEventListener('click', async () => {
    const token = session.bearer; session.bearer = ''; session.expiresAt = 0;
    dashboard.hidden = true; casesHost.replaceChildren(); resetProof();
    if (token) { try { await call('logout', {}, token); } catch { /* token is discarded regardless */ } }
    message('Signed out. Page memory cleared.');
  });
  window.addEventListener('pagehide', () => { session.bearer = ''; session.secret = ''; });
  call('health').then(health => {
    message(health.status === 'configuration_present'
      ? 'Private operator service is configured. Choose your action.'
      : 'Private operator service is not enabled.');
  }).catch(() => {
    challengeButton.disabled = true;
    message('Private operator service is unavailable; no administrator access is active.');
  });
})();
