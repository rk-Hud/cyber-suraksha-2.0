/* Optional server-backed demo data. Offline/static hosting falls back to app.js. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  async function loadCase() {
    const input = el('caseInput');
    const result = el('caseResult');
    if (!input || !result) return;
    const id = input.value;
    const lang = el('lang')?.value === 'te' ? 'te' : 'en';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch('/api/v1/cases/' + encodeURIComponent(id) + '?lang=' + lang,
        {signal: controller.signal, cache: 'no-store'});
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
      const item = await res.json();
      if (input.value !== id || (el('lang')?.value || 'en') !== lang) return;
      const box = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = item.id + ' · FICTIONAL · ' + item.severity;
      const title = document.createElement('p');
      title.textContent = item.title + ': ' + item.summary;
      const status = document.createElement('p');
      status.textContent = 'Training status: ' + item.training_status;
      box.append(heading, title, status);
      result.replaceChildren(box);
    } catch (_) { /* Static offline fallback stays active. */ }
    finally { clearTimeout(timeout); }
  }
  async function checkApi() {
    try {
      const response = await fetch('/api/v1/health', {cache: 'no-store'});
      const data = await response.json();
      if (!response.ok || data.mode !== 'independent-public-service') return;
      document.body.dataset.backend = 'connected';
      await loadCase();
    } catch (_) { document.body.dataset.backend = 'offline'; }
  }
  el('caseInput')?.addEventListener('change', loadCase);
  el('lang')?.addEventListener('change', loadCase);
  checkApi();
})();
