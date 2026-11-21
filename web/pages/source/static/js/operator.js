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
  const session = { bearer: '', expiresAt: 0, provisionId: '', secret: '', mode: 'login',
    challenge: null, view: 'overview',
    pages: { users: 1, activity: 1, sessions: 1, cases: 1, audit: 1 },
    searches: { users: '', activity: '', sessions: '', cases: '', audit: '' }, statusFilter: '' };
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
      method: payload === undefined ? 'GET'
        : (path.startsWith('cases/') && payload.status || path.startsWith('users/') && typeof payload.active === 'boolean')
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
        await showOperatorPanel('overview');
      }
    } catch (error) { message('Operator authentication denied: ' + error.message); }
    finally {
      clear();
      request = null;
      credential = '';
    }
  }

  const shortTime = value => {
    if (value === null || value === undefined || value === '') return 'Not recorded';
    const stamp = new Date(Number(value) * 1000);
    if (!Number.isFinite(stamp.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(stamp) + ' IST';
  };
  const safeLabel = value => value == null || value === '' ? '—' : String(value);
  const make = (tag, content) => {
    const node = document.createElement(tag);
    if (content !== undefined) text(node, safeLabel(content));
    return node;
  };
  function renderTable(id, headers, records, cells) {
    const host = document.getElementById('operator-' + id);
    host.replaceChildren();
    if (!records.length) {
      host.append(make('p', 'No records found for this view.')); return;
    }
    const table = make('table'); table.className = 'operator-data-table';
    const caption = make('caption', 'Administrator-only ' + id + ' records');
    table.append(caption);
    const thead = make('thead'), heading = make('tr');
    for (const head of headers) heading.append(make('th', head));
    thead.append(heading);table.append(thead);
    const tbody = make('tbody');
    for (const record of records) {
      const row = make('tr');
      for (const value of cells(record)) row.append(make('td', value));
      tbody.append(row);
    }
    table.append(tbody);host.append(table);
  }
  function operatorQuery(view) {
    const params = new URLSearchParams({page: String(session.pages[view])});
    if (session.searches[view]) params.set('q',session.searches[view]);
    if (view === 'cases' && session.statusFilter) params.set('status',session.statusFilter);
    return view + '?' + params.toString();
  }
  function pager(view,total) {
    const host=document.querySelector('[data-operator-pager="'+view+'"]');
    if (!host) return;
    host.replaceChildren();
    const totalPages=Math.max(1,Math.ceil(Number(total)/20));
    const prev=make('button','Previous');prev.type='button';
    prev.className='button button-secondary';prev.disabled=session.pages[view]<=1;
    const next=make('button','Next');next.type='button';
    next.className='button button-secondary';next.disabled=session.pages[view]>=totalPages;
    const info=make('span','Page '+session.pages[view]+' / '+totalPages+' · '+total+' records');
    prev.addEventListener('click',()=>{session.pages[view]--;void showOperatorPanel(view);});
    next.addEventListener('click',()=>{session.pages[view]++;void showOperatorPanel(view);});
    host.append(prev,info,next);
  }
  async function loadOverview() {
    const data=await call('summary',undefined,session.bearer);
    const counts=data.counts||{};
    const cases=Object.values(counts).reduce((sum,n)=>sum+Number(n||0),0);
    for(const [id,value] of Object.entries({
      users: data.citizens, sessions:data.activeSessions,cases,
      pending:Number(counts.pending||0)+Number(counts.in_review||0)+Number(counts.awaiting_info||0),
    })) text(document.getElementById('operator-metric-'+id),Number(value));
  }
  async function loadOperatorRecords(view) {
    const result=await call(operatorQuery(view),undefined,session.bearer);
    if (view==='users') renderTable(view,
      ['Account ID','Name','Verified email','Role','Registered (IST)','Last login (IST)',
       'Last failed (IST)','Last logout (IST)','Sessions','Cases','Latest case','Status'],
      result.users||[],u=>[u.id,u.name,u.email,u.role,shortTime(u.created_at),
        shortTime(u.last_login_at),shortTime(u.last_failed_at),shortTime(u.last_logout_at),
        Number(u.citizen_active_sessions||0)+Number(u.operator_active_sessions||0),
        u.case_count,u.latest_case_status,u.active?'Active':'Disabled']);
    if(view==='activity') renderTable(view,
      ['Time (IST)','Email','Name','Event','Result'],
      result.events||[],v=>[shortTime(v.created_at),v.email,v.name,
        v.reason,v.success?'Recorded success':'Rejected']);
    if(view==='sessions') renderTable(view,
      ['Session ID','Email','Kind','Status','Created (IST)','Expires (IST)'],
      result.sessions||[],v=>[v.id,v.email,v.session_kind,v.state,
        shortTime(v.created_at),shortTime(v.expires_at)]);
    if(view==='audit') renderTable(view,
      ['Time (IST)','Administrator','Action','Record'],
      result.events||[],v=>[shortTime(v.created_at),v.actor_email,v.action,v.record]);
    pager(view,result.total||0);
  }
  async function showOperatorPanel(view) {
    if (!session.bearer) return;
    const choices=['overview','users','activity','sessions','cases','audit'];
    if(!choices.includes(view))return;
    session.view=view;
    for(const panel of document.querySelectorAll('[data-operator-panel]'))
      panel.hidden=panel.dataset.operatorPanel!==view;
    for(const tab of document.querySelectorAll('[data-operator-view]')){
      if(tab.dataset.operatorView===view)tab.setAttribute('aria-current','page');
      else tab.removeAttribute('aria-current');
    }
    try {
      if(view==='overview') await loadOverview();
      else if(view==='cases') await loadCases();
      else await loadOperatorRecords(view);
    }catch(error){
      if(error.message==='operator_unauthorized'){
        session.bearer='';dashboard.hidden=true;casesHost.replaceChildren();
        message('Administrator MFA has expired. Sign in again with a fresh authenticator code.');
      }else message('Workspace request denied: '+error.message);
    }
  }

  async function loadCases() {
    if (!session.bearer) return;
    try {
      const list = await call(operatorQuery('cases'), undefined, session.bearer);
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
      if (!list.cases.length) message('No fictional cases match this filter.');
      pager('cases',list.total||0);
    } catch(error) { message('Case list denied: ' + error.message); }
  }

  for(const button of document.querySelectorAll('[data-operator-view]'))
    button.addEventListener('click',()=>void showOperatorPanel(button.dataset.operatorView));
  for(const form of document.querySelectorAll('[data-operator-search]')){
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const view=form.dataset.operatorSearch;
      session.pages[view]=1;
      session.searches[view]=form.elements.q.value.trim();
      if(view==='cases')session.statusFilter=form.elements.status.value;
      void showOperatorPanel(view);
    });
  }

  credentials.addEventListener('submit', event => { event.preventDefault(); void beginChallenge(); });
  modeSelect.addEventListener('change', () => {
    resetProof(); message('Choose Start Google verification to begin a new challenge.');
  });
  document.getElementById('operator-refresh').addEventListener('click', () => {
    void showOperatorPanel('overview');
  });
  document.getElementById('operator-logout').addEventListener('click', async () => {
    const token = session.bearer; session.bearer = ''; session.expiresAt = 0;
    dashboard.hidden = true; casesHost.replaceChildren(); resetProof();
    for(const view of ['users','activity','sessions','audit']){
      document.getElementById('operator-'+view).replaceChildren();
    }
    for(const metric of ['users','sessions','cases','pending'])
      text(document.getElementById('operator-metric-'+metric),'—');
    if (token) { try { await call('logout', {}, token); } catch { /* token is discarded regardless */ } }
    message('Signed out. Page memory cleared.');
  });
  window.addEventListener('pagehide', () => { session.bearer = ''; session.secret = ''; });
  call('health').then(health => {
    message(health.status === 'configuration_present'
      ? 'Private operator service is configured. Choose your action.'
      : 'Private operator service is not enabled.');
  }).catch(() => {
    modeSelect.value = 'identity';
    message('Operator access is disabled. You may verify your Google identity without creating an administrator account.');
  });
})();
