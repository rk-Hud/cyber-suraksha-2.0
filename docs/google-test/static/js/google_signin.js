/* Google citizen sign-in. The API owns nonce issuance, identity verification and sessions. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const container = document.getElementById('google-citizen-signin');
  const clientId = document.documentElement.dataset.googleClientId || '';
  const bridge = root.CyberSurakshaGoogleAuth;
  if (!container || !bridge || !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) return;
  const copy = root.CyberSurakshaAccountCopy || {};
  const language = document.documentElement.lang;
  const basePath = document.documentElement.dataset.basePath || '';
  let generation = 0, flow = null, pending = false, scriptPromise = null, timer;
  const node = (tag, key) => { const value = document.createElement(tag); if (key) value.textContent = copy[key] || copy.error_generic || ''; return value; };
  const title = node('h3', 'google_title');
  const help = node('p', 'google_intro');
  const label = node('label'); label.className = 'checkbox-label';
  const consent = node('input'); consent.type = 'checkbox'; consent.id = 'google-citizen-consent';
  const text = node('span', 'google_consent'); label.append(consent, text);
  const policies = node('p'); policies.className = 'field-hint';
  for (const [key, filename] of [['privacy_policy', 'privacy.html'], ['service_terms', 'terms.html']]) {
    const link = node('a', key); link.href = basePath + '/' + language + '/' + filename;
    if (policies.children.length) policies.append(document.createTextNode(' · ')); policies.append(link);
  }
  const button = node('div'); button.id = 'google-signin-button';
  const notice = node('p'); notice.id = 'google-signin-status'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const retry = node('button', 'google_retry'); retry.type = 'button'; retry.className = 'plain-button'; retry.hidden = true;
  container.replaceChildren(title, help, label, policies, button, notice, retry);

  function reset({ uncheck = true } = {}) {
    generation++; flow = null; pending = false; clearTimeout(timer); button.replaceChildren(); retry.hidden = true;
    if (uncheck) consent.checked = false;
    try { root.google?.accounts?.id?.cancel(); } catch (_) { /* A provider cleanup failure must not retain our flow. */ }
  }
  function available() { const state = bridge.state(); return state.enabled && state.citizenLogin; }
  function update() {
    container.hidden = !available();
    if (container.hidden) { reset(); notice.textContent = ''; }
  }
  function loadScript() {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      if (root.google?.accounts?.id) { resolve(root.google.accounts.id); return; }
      const script = node('script'); script.async = true; script.src = 'https://accounts.google.com/gsi/client'; script.referrerPolicy = 'strict-origin-when-cross-origin';
      script.onload = () => root.google?.accounts?.id ? resolve(root.google.accounts.id) : reject(new Error('identity_unavailable'));
      script.onerror = () => { script.remove(); scriptPromise = null; reject(new Error('identity_unavailable')); };
      document.head.append(script);
    });
    return scriptPromise;
  }
  function expired(attempt) {
    if (attempt !== generation) return;
    reset({ uncheck: false }); notice.textContent = copy.google_expired; retry.hidden = !consent.checked;
  }
  async function start() {
    reset({ uncheck: false });
    if (!consent.checked || !available()) return;
    const attempt = generation;
    notice.textContent = copy.google_loading;
    try {
      const next = await bridge.begin();
      if (attempt !== generation || !consent.checked || !available()) return;
      if (!next || typeof next.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(next.id) ||
          !/^[A-Za-z0-9_-]{43}$/.test(next.token) || !/^[A-Za-z0-9_-]{43}$/.test(next.nonce) || next.purpose !== 'google' ||
          !Number.isFinite(next.expiresAt) || next.expiresAt <= Date.now() || next.expiresAt > Date.now() + 310000) throw new Error('invalid_flow');
      flow = next;
      const google = await loadScript();
      if (attempt !== generation || !consent.checked || !available()) return;
      timer = setTimeout(() => expired(attempt), Math.max(0, next.expiresAt - Date.now()));
      google.initialize({ client_id: clientId, nonce: next.nonce, auto_select: false, ux_mode: 'popup',
        use_fedcm_for_button: false, use_fedcm_for_prompt: false,
        callback: async response => {
          if (attempt !== generation || !consent.checked || !available() || pending || !flow) return;
          if (flow.expiresAt <= Date.now()) { expired(attempt); return; }
          if (typeof response?.credential !== 'string' || response.credential.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(response.credential)) {
            reset({ uncheck: false }); notice.textContent = copy.google_unavailable; retry.hidden = false; return;
          }
          pending = true; button.replaceChildren(); clearTimeout(timer);
          const current = flow; flow = null; notice.textContent = copy.google_verifying;
          try {
            await bridge.finish({ credential: response.credential, nonce: current.nonce, challengeId: current.id, flowToken: current.token, consent: true }, () => attempt === generation && consent.checked && available());
            if (attempt === generation) { reset(); notice.textContent = ''; }
          } catch {
            if (attempt !== generation) return;
            reset({ uncheck: false }); notice.textContent = copy.google_unavailable; retry.hidden = !consent.checked;
          }
        } });
      google.renderButton(button, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', locale: language,
        width: Math.min(320, Math.max(200, Math.floor(container.clientWidth || 280))) });
      notice.textContent = bridge.state().registration ? copy.google_choose_account : copy.google_existing_only;
    } catch {
      if (attempt !== generation) return;
      reset({ uncheck: false }); notice.textContent = copy.google_unavailable; retry.hidden = !consent.checked;
    }
  }
  consent.addEventListener('change', () => { if (consent.checked) start(); else { reset(); notice.textContent = ''; } });
  retry.addEventListener('click', start);
  document.addEventListener('cyber-account-state', update);
  root.addEventListener('pagehide', () => reset());
  Promise.resolve(bridge.ready()).then(update).catch(() => { container.hidden = true; });
})(globalThis);
