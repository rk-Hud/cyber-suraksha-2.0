/* Navigation and reference filters never read the citizen-tool inputs. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const menuButton = document.getElementById('menu-toggle');
  const navigation = document.getElementById('main-navigation');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    navigation?.classList.toggle('is-open', open);
  });
  navigation?.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      menuButton?.setAttribute('aria-expanded', 'false');
      navigation.classList.remove('is-open');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
      menuButton.setAttribute('aria-expanded', 'false');
      navigation?.classList.remove('is-open');
      menuButton.focus();
    }
  });

  document.getElementById('language-select')?.addEventListener('change', (event) => {
    const lang = event.target.value;
    if (['en', 'hi', 'te'].includes(lang)) {
      // A fixed path keeps pasted text and incident details out of the URL.
      const basePath = document.documentElement.dataset?.basePath || "";
      const configuredPage = document.documentElement.dataset?.pageFilename;
      const account = ["account.html", "privacy.html", "terms.html"].includes(configuredPage) ? configuredPage : document.documentElement.dataset?.accountPage === "true" ? "account.html" : "";
      window.location.assign(`${basePath}/${lang}/${account}`);
    }
  });

  const disclosureTargets = {
    '#resources': 'resources-details'
  };
  function openLinkedSection(hash) {
    const identifier = disclosureTargets[hash];
    if (!identifier) return;
    const details = document.getElementById(identifier);
    if (details) details.open = true;
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    // Anchor.hash also handles project-prefixed navigation when a section was closed manually.
    if (link) openLinkedSection(link.hash || link.getAttribute('href'));
  });
  window.addEventListener('hashchange', () => openLinkedSection(window.location.hash));
  openLinkedSection(window.location.hash);

  const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().trim();
  const agencySearch = document.getElementById('agency-search');
  const agencyGroup = document.getElementById('agency-group');
  let agencyRows = [...document.querySelectorAll('#agency-body tr')];
  function filterAgencies() {
    const query = normalize(agencySearch?.value || '');
    const group = agencyGroup?.value || 'all';
    let matches = 0;
    for (const row of agencyRows) {
      const inGroup = group === 'all' || row.dataset.group === group;
      row.hidden = !inGroup || !normalize(row.dataset.search || '').includes(query);
      if (!row.hidden) matches += 1;
    }
    const count = document.getElementById('agency-count');
    const empty = document.getElementById('agency-no-results');
    if (count) count.textContent = String(matches);
    if (empty) empty.hidden = matches !== 0;
  }
  agencySearch?.addEventListener('input', filterAgencies);
  agencyGroup?.addEventListener('change', filterAgencies);
  document.addEventListener('cyber-resources-updated', () => {
    agencyRows = [...document.querySelectorAll('#agency-body tr')];
    filterAgencies();
  });

})();
