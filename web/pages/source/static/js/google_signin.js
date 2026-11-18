/* Google Identity Services UI — opt-in, no custom sending domain.
 * Google tokens go only to the separate, authenticated Neon API.
 * Never use Google's email address to authorize admin access or case records.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const container = document.getElementById('google-citizen-signin');
  const clientId = document.documentElement.dataset.googleClientId || '';
  const api = document.documentElement.dataset.apiUrl || '';
  if (!container || !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) return;
  if (!api.startsWith('https://')) return;
  const lang = document.documentElement.lang;
  const copy = {
    en: ['Sign in with Google', 'I agree to the privacy notice and the independent support-case terms.', 'Google sign-in is unavailable.'],
    hi: ['Google से साइन इन करें', 'मैं गोपनीयता सूचना और स्वतंत्र सहायता-सेवा की शर्तों से सहमत हूँ।', 'Google साइन-इन उपलब्ध नहीं है।'],
    te: ['Googleతో సైన్ ఇన్ చేయండి', 'గోప్యతా ప్రకటన మరియు స్వతంత్ర సహాయ సేవ నిబంధనలను అంగీకరిస్తున్నాను.', 'Google సైన్ ఇన్ అందుబాటులో లేదు.']
  }[lang] || ['Sign in with Google', 'I agree to the privacy notice and support-case terms.', 'Google sign-in is unavailable.'];
  async function launch() {
    try {
      const response = await fetch(api.replace(/\/$/, '') + '/api/v1/health', { cache: 'no-store', credentials: 'omit' });
      const data = await response.json();
      if (!response.ok || data?.data?.features?.googleSignIn !== true) return;
    } catch { return; }
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'google-citizen-consent';
    const text = document.createElement('span');
    text.textContent = copy[1];
    label.append(checkbox, text);
    const title = document.createElement('p');
    title.textContent = copy[0];
    const button = document.createElement('div');
    button.id = 'google-signin-button';
    const notice = document.createElement('p');
    notice.id = 'google-signin-status'; notice.setAttribute('role', 'status');
    container.replaceChildren(title, label, button, notice);
    container.hidden = false;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://accounts.google.com/gsi/client';
    script.referrerPolicy = 'no-referrer';
    script.onload = () => {
      const google = root.google?.accounts?.id;
      if (!google || !root.crypto?.getRandomValues) {
        notice.textContent = copy[2]; return;
      }
      const bytes = new Uint8Array(24);
      root.crypto.getRandomValues(bytes);
      const nonce = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      google.initialize({
        client_id: clientId,
        nonce,
        auto_select: false,
        callback: response => {
          if (!checkbox.checked) { notice.textContent = copy[1]; return; }
          if (typeof root.CyberSurakshaGoogleSignIn !== 'function' || typeof response?.credential !== 'string') {
            notice.textContent = copy[2]; return;
          }
          Promise.resolve(root.CyberSurakshaGoogleSignIn({ credential: response.credential, nonce, consent: true }))
            .catch(() => { notice.textContent = copy[2]; });
        }
      });
      google.renderButton(button, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with' });
    };
    script.onerror = () => { notice.textContent = copy[2]; };
    // Do not load Google identity scripts until the visitor expressly opts in.
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && !script.isConnected) document.head.append(script);
    });
  }
  launch();
})(window);
