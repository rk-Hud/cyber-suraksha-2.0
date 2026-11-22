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
  if (base !== 'https://cyber-suraksha-security-gateway.cyber-suraksha-staging.workers.dev' || !clientId) {
    challengeButton.disabled = true;
    message('Private administrator enrollment is not active. The separate operator service must be approved first.');
    return;
  }
  async function call(path, payload, bearer = '') {
    const headers = { ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) };
    const response = await fetch(base + '/operator/v1/' + path, {
      method: payload === undefined ? 'GET'
        : ((path.startsWith('cases/') && payload.status)
          || (path.startsWith('workspace/users/') && typeof payload.active === 'boolean'))
          ? 'PATCH' : 'POST',
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
    resetProof();
    session.mode = modeSelect.value;
    if (session.mode === 'finish' && !session.provisionId) {
      message('Start owner enrollment and scan the authenticator code before finishing.');
      return;
    }
    challengeButton.disabled = true;
    try {
      const proof = await call(session.mode === 'identity' ? 'identity-challenge' : 'challenge', {});
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
      if (session.mode === 'identity') {
        const data = await call('identity-proof', common);
        // Display this Google-issued identifier only to the person who just signed in.
        // It is not a password, application session or privilege grant.
        message('Google identity verified for ' + data.verifiedEmail
          + '. Approved Google subject (sub): ' + data.verifiedGoogleSub
          + '. No administrator account was created.');
      } else if (session.mode === 'begin') {
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
        await showOwnerTab('overview');
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
      const query = new URLSearchParams({
        page: String(workspace.cases),
        q: workspace.caseSearch,
        status: workspace.caseStatus,
      });
      const list = await call('workspace/cases?' + query.toString(), undefined, session.bearer);
      casesHost.replaceChildren();
      for (const item of list.items) {
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
      if (!list.items.length) {
        casesHost.append(element('p', 'No matching fictional cases.', 'field-hint'));
      }
      paginate('cases', list, loadCases);
    } catch(error) { message('Case list denied: ' + error.message); }
  }

  // Owner-only activity panels. All data comes from operatorAuth-protected
  // backend endpoints; no citizen credentials, operator tokens or identities
  // are read from the URL, web storage or untrusted markup.
  const workspace = { active: 'overview', users: 1, events: 1, sessions: 1,
    audit: 1, cases: 1, search: '', type: 'all', caseSearch: '', caseStatus: 'all', userCasePage: 1 };
  const panes = [...document.querySelectorAll('[data-operator-panel]')];
  const tabs = [...document.querySelectorAll('[data-operator-tab]')];
  const lang = document.documentElement.lang;
  const words = {
    en: { none: 'No records available', previous: 'Previous', next: 'Next', page: 'Page',
      loadError: 'Owner workspace request denied', fields: ['Account ID','Name','Email','Role','Registered',
        'Last login','Last failed login','Last logout','Method','Current sessions','Cases / latest status / references','Account'],
      activity: ['Time (IST)','Email (claimed if failed)','Event','Result','Detail'],
      sessions: ['Account','Service','Started (IST)','Expires (IST)','State'],
      audits: ['Time (IST)','Actor','Action','Record'], details: 'Show all case references',
      enable: 'Enable', disable: 'Disable',
      confirmEnable: 'Enable this fictional citizen account?',
      confirmDisable: 'Disable this fictional citizen account and expire its sessions?' },
    hi: { none: 'कोई रिकॉर्ड नहीं', previous: 'पिछला', next: 'अगला', page: 'पृष्ठ',
      loadError: 'मालिक कार्यक्षेत्र अनुरोध अस्वीकृत', fields: ['खाता आईडी','नाम','ईमेल','भूमिका','पंजीकरण',
        'अंतिम लॉगिन','अंतिम विफल लॉगिन','अंतिम लॉगआउट','विधि','वर्तमान सत्र','मामले / स्थिति / संदर्भ','खाता'],
      activity: ['समय (IST)','ईमेल (विफल होने पर दावा)','घटना','परिणाम','विवरण'],
      sessions: ['खाता','सेवा','आरंभ (IST)','समाप्ति (IST)','स्थिति'],
      audits: ['समय (IST)','कर्ता','क्रिया','रिकॉर्ड'], details: 'सभी मामले संदर्भ देखें',
      enable: 'सक्रिय करें', disable: 'निष्क्रिय करें',
      confirmEnable: 'इस परीक्षण नागरिक खाते को सक्रिय करें?',
      confirmDisable: 'इस परीक्षण नागरिक खाते को निष्क्रिय करके सत्र समाप्त करें?' },
    te: { none: 'రికార్డులు లేవు', previous: 'మునుపటి', next: 'తర్వాత', page: 'పేజీ',
      loadError: 'యజమాని వర్క్‌స్పేస్ అభ్యర్థన తిరస్కరించబడింది', fields: ['ఖాతా ఐడీ','పేరు','ఇమెయిల్','పాత్ర','నమోదు',
        'చివరి లాగిన్','చివరి విఫల లాగిన్','చివరి లాగౌట్','పద్ధతి','ప్రస్తుత సెషన్‌లు','కేసులు / స్థితి / సూచనలు','ఖాతా'],
      activity: ['సమయం (IST)','ఇమెయిల్ (విఫలమైతే ప్రకటించినది)','ఈవెంట్','ఫలితం','వివరం'],
      sessions: ['ఖాతా','సేవ','ప్రారంభం (IST)','ముగింపు (IST)','స్థితి'],
      audits: ['సమయం (IST)','చేసినవారు','చర్య','రికార్డు'], details: 'అన్ని కేసు సూచనలు చూడండి',
      enable: 'ప్రారంభించు', disable: 'నిలిపివేయి',
      confirmEnable: 'ఈ కల్పిత పౌరుని ఖాతాను ప్రారంభించాలా?',
      confirmDisable: 'ఈ కల్పిత పౌరుని ఖాతాను నిలిపి సెషన్‌లను ముగించాలా?' },
  }[lang] || null;
  const label = words || {
    none: 'No records', previous: 'Previous', next: 'Next', page: 'Page',
    loadError: 'Owner workspace denied', fields: [], activity: [], sessions: [], audits: [],
    details: 'Show case references', enable: 'Enable', disable: 'Disable',
    confirmEnable: 'Enable this fictional citizen account?',
    confirmDisable: 'Disable this fictional citizen account and expire its sessions?',
  };
  function dateIST(value) {
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds) || seconds <= 0) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(seconds * 1000)) + ' IST';
  }
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined && value !== null) text(el, value);
    return el;
  }
  function tableInto(targetId, headers, rows, cells) {
    const host = document.getElementById(targetId);
    host.replaceChildren();
    if (!Array.isArray(rows) || rows.length === 0) {
      host.append(element('p', label.none, 'field-hint')); return;
    }
    const table = element('table', undefined, 'owner-data-table');
    const thead = element('thead'), head = element('tr');
    headers.forEach(h => head.append(element('th', h)));
    thead.append(head); table.append(thead);
    const tbody = element('tbody');
    for (const record of rows) {
      const tr = element('tr');
      for (const value of cells(record)) {
        const cell = element('td');
        if (value && typeof value === 'object' && value.nodeType === 1) cell.append(value);
        else text(cell, value === null || value === undefined || value === '' ? '—' : value);
        tr.append(cell);
      }
      tbody.append(tr);
    }
    table.append(tbody); host.append(table);
  }
  function paginate(name, data, loader) {
    const host = document.getElementById('operator-' + name + '-pagination');
    host.replaceChildren();
    const prev = element('button', label.previous, 'button button-secondary');
    const next = element('button', label.next, 'button button-secondary');
    prev.type = next.type = 'button';
    prev.disabled = workspace[name] <= 1;
    next.disabled = !data.hasMore;
    prev.addEventListener('click', () => { workspace[name]--; void loader(); });
    next.addEventListener('click', () => { workspace[name]++; void loader(); });
    host.append(prev, element('span', label.page + ' ' + workspace[name]), next);
  }
  function keyValues(info) {
    const pairs = [
      ['Registered citizens', info.citizens],
      ['Fictional cases', info.cases],
      ['Pending review', info.pending],
      ['In review', info.inReview],
      ['Active citizen sessions', info.citizenSessions],
      ['Fresh administrator sessions', info.operatorSessions],
      ['Successful logins · 24h', info.successfulLogins24h],
    ];
    const host = document.getElementById('operator-summary');
    host.replaceChildren();
    for (const [name, value] of pairs) {
      const card = element('div', undefined, 'surface owner-metric');
      card.append(element('span', name, 'owner-metric-label'), element('strong', value));
      host.append(card);
    }
  }
  async function loadUserCaseRefs(user, host, page = 1) {
    const data = await call('workspace/users/' + encodeURIComponent(user.id)
      + '/cases?page=' + page, undefined, session.bearer);
    host.replaceChildren();
    host.append(element('strong', user.name + ' · ' + user.email));
    const list = element('ul', undefined, 'owner-case-reference-list');
    for (const record of data.items) {
      list.append(element('li', record.reference + ' — ' + record.status
        + ' — ' + dateIST(record.updated_at)));
    }
    if (!data.items.length) host.append(element('p', label.none));
    host.append(list);
    if (data.hasMore) {
      const next = element('button', label.next, 'button button-secondary');
      next.type = 'button';
      next.addEventListener('click', () => void loadUserCaseRefs(user, host, page + 1));
      host.append(next);
    }
  }
  async function loadOwnerPane(name = workspace.active) {
    if (!session.bearer) return;
    try {
      if (name === 'cases') return await loadCases();
      if (name === 'overview') {
        const data = await call('workspace/summary', undefined, session.bearer);
        return keyValues(data);
      }
      if (name === 'users') {
        const params = new URLSearchParams({ page: String(workspace.users), q: workspace.search });
        const data = await call('workspace/users?' + params.toString(), undefined, session.bearer);
        return tableInto('operator-users', label.fields, data.items, user => {
          const holder = element('div');
          text(holder, user.case_count + ' · ' + (user.latest_case_status || '—')
            + ' · ' + (user.case_references || []).join(', '));
          const details = element('button', label.details, 'plain-button');
          details.type = 'button';
          details.addEventListener('click', () => {
            const region = document.getElementById('operator-user-case-details');
            void loadUserCaseRefs(user, region).catch(error => message(label.loadError + ': ' + error.message));
          });
          holder.append(details);
          const state = element('div');
          state.append(element('span', user.active ? 'active' : 'disabled'));
          if (user.role === 'citizen') {
            const toggle = element('button', user.active ? label.disable : label.enable, 'plain-button');
            toggle.type = 'button';
            toggle.setAttribute('aria-label', (user.active ? label.disable : label.enable)
              + ' ' + user.email);
            toggle.addEventListener('click', async () => {
              if (!window.confirm(user.active ? label.confirmDisable : label.confirmEnable)) return;
              toggle.disabled = true;
              try {
                const changed = await call('workspace/users/' + encodeURIComponent(user.id),
                  { active: !user.active, version: user.version }, session.bearer);
                message(changed.user.changed
                  ? 'Citizen account status updated and audit event recorded.'
                  : 'Citizen account status already matches the request.');
                await loadOwnerPane('users');
              } catch (error) {
                message(label.loadError + ': ' + error.message);
                toggle.disabled = false;
              }
            });
            state.append(toggle);
          }
          return [user.id, user.name, user.email, user.role, dateIST(user.created_at),
            dateIST(user.last_login_at), dateIST(user.last_failed_login_at),
            dateIST(user.last_logout_at), user.authentication_method,
            Number(user.citizen_active_sessions) + Number(user.operator_active_sessions),
            holder, state];
        }) || paginate('users', data, () => loadOwnerPane('users'));
      }
      if (name === 'events') {
        const data = await call('workspace/events?page=' + workspace.events
          + '&type=' + workspace.type, undefined, session.bearer);
        tableInto('operator-events', label.activity, data.items, event => [
          dateIST(event.created_at), event.email, event.source,
          event.result, event.detail,
        ]);
        return paginate('events', data, () => loadOwnerPane('events'));
      }
      if (name === 'sessions') {
        const data = await call('workspace/sessions?page=' + workspace.sessions,
          undefined, session.bearer);
        tableInto('operator-sessions', label.sessions, data.items, row => [
          row.email, row.service, dateIST(row.created_at),
          dateIST(row.expires_at), row.session_state,
        ]);
        return paginate('sessions', data, () => loadOwnerPane('sessions'));
      }
      if (name === 'audit') {
        const data = await call('workspace/audit?page=' + workspace.audit,
          undefined, session.bearer);
        tableInto('operator-audit', label.audits, data.items, row => [
          dateIST(row.created_at), row.email, row.action, row.record,
        ]);
        return paginate('audit', data, () => loadOwnerPane('audit'));
      }
    } catch (error) {
      message(label.loadError + ': ' + error.message);
      if (error.message === 'operator_unauthorized') {
        session.bearer = ''; session.expiresAt = 0; dashboard.hidden = true;
        casesHost.replaceChildren();
        document.querySelectorAll('.owner-scroll').forEach(x => x.replaceChildren());
      }
    }
  }
  async function showOwnerTab(name) {
    if (!['overview','users','events','sessions','cases','audit'].includes(name)) return;
    workspace.active = name;
    panes.forEach(panel => { panel.hidden = panel.dataset.operatorPanel !== name; });
    tabs.forEach(button => {
      button.setAttribute('aria-current', button.dataset.operatorTab === name ? 'page' : 'false');
    });
    await loadOwnerPane(name);
  }
  tabs.forEach(button => button.addEventListener('click',
    () => void showOwnerTab(button.dataset.operatorTab)));
  document.getElementById('operator-user-search').addEventListener('submit', event => {
    event.preventDefault();
    workspace.search = document.getElementById('operator-search').value.trim();
    workspace.users = 1;
    document.getElementById('operator-user-case-details').replaceChildren();
    void loadOwnerPane('users');
  });
  document.getElementById('operator-event-filter').addEventListener('change', event => {
    workspace.type = event.target.value;
    workspace.events = 1;
    void loadOwnerPane('events');
  });

  document.getElementById('operator-case-filters').addEventListener('submit', event => {
    event.preventDefault();
    workspace.caseSearch = document.getElementById('operator-case-search').value.trim();
    workspace.caseStatus = document.getElementById('operator-case-status').value;
    workspace.cases = 1;
    void loadOwnerPane('cases');
  });

  credentials.addEventListener('submit', event => { event.preventDefault(); void beginChallenge(); });
  modeSelect.addEventListener('change', () => {
    resetProof(); message('Choose Start Google verification to begin a new challenge.');
  });
  document.getElementById('operator-refresh').addEventListener('click', () => void loadOwnerPane());
  document.getElementById('operator-logout').addEventListener('click', async () => {
    const token = session.bearer; session.bearer = ''; session.expiresAt = 0;
    dashboard.hidden = true; casesHost.replaceChildren(); resetProof();
    document.querySelectorAll('.owner-scroll').forEach(x => x.replaceChildren());
    document.getElementById('operator-summary').replaceChildren();
    let confirmedByServer = false;
    if (token) {
      try { await call('logout', {}, token); confirmedByServer = true; }
      catch { /* Bearer is discarded locally; server revocation cannot be inferred. */ }
    }
    message(confirmedByServer
      ? 'Server confirmed explicit sign-out. Local session cleared.'
      : 'Local session cleared. Server revocation was not confirmed; an unexpired session may remain valid.');
  });
  window.addEventListener('pagehide', () => {
    session.bearer = ''; session.secret = ''; session.provisionId = '';
    dashboard.hidden = true; enrollment.hidden = true;
    casesHost.replaceChildren();
    document.querySelectorAll('.owner-scroll').forEach(x => x.replaceChildren());
    document.getElementById('operator-summary').replaceChildren();
    text(document.getElementById('operator-totp-seed'), '');
    text(document.getElementById('operator-totp-uri'), '');
    clear();
  });
  call('health').then(health => {
    message(health.status === 'configuration_present'
      ? 'Private operator service is configured. Choose your action.'
      : 'Private operator service is not enabled.');
  }).catch(() => {
    modeSelect.value = 'identity';
    message('Operator access is disabled. You may verify your Google identity without creating an administrator account.');
  });
})();
