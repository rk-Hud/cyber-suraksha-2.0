/* Explicit, optional lookup of hash prefixes; pasted text never leaves this page. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMIT = 2048;
  const THREATS = new Set(['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION']);
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const COPY = {
    en: {
      working: 'Checking current threat-list evidence…',
      oneUrl: 'Paste one HTTP or HTTPS web address for this optional check. Message interpretation remains on this device.',
      unsupported: 'This address format could not be checked reliably. It remains unverified; use the local warning review and an independently opened official channel.',
      unavailable: 'Current threat-list evidence is unavailable. No safety verdict has been made. The local review still applies.',
      noMatch: 'No current threat-list warning was returned for this address.',
      caveat: 'A missing match is not proof of safety. New attacks, compromised pages and false negatives are possible.',
      reported: 'Reported unsafe by Google Safe Browsing',
      providerNotice: 'Threat-list evidence provided by Google Safe Browsing. Accuracy and reliability cannot be guaranteed; false positives and false negatives are possible.',
      expired: 'This threat-list result has expired. Run the optional check again for current evidence.',
      changed: 'The input changed. Run the optional check again for the new address.',
      types: { MALWARE: 'Malware', SOCIAL_ENGINEERING: 'Phishing / social engineering', UNWANTED_SOFTWARE: 'Unwanted software', POTENTIALLY_HARMFUL_APPLICATION: 'Potentially harmful application' }
    },
    hi: {
      working: 'खतरा-सूची की वर्तमान जानकारी जाँची जा रही है…',
      oneUrl: 'इस वैकल्पिक जाँच के लिए केवल एक HTTP या HTTPS वेब पता दर्ज करें। संदेश की जाँच इसी डिवाइस पर होती है।',
      unsupported: 'इस पते के प्रारूप की भरोसेमंद जाँच नहीं हो सकी। यह अप्रमाणित है; स्थानीय चेतावनियाँ देखें और आधिकारिक माध्यम स्वयं खोलकर पुष्टि करें।',
      unavailable: 'खतरा-सूची की वर्तमान जानकारी उपलब्ध नहीं है। सुरक्षा का कोई निष्कर्ष नहीं दिया गया है। स्थानीय जाँच की चेतावनियाँ अभी भी लागू हैं।',
      noMatch: 'इस पते के लिए कोई वर्तमान खतरा-सूची चेतावनी नहीं लौटी।',
      caveat: 'मेल न मिलना सुरक्षित होने का प्रमाण नहीं है। नए हमले, समझौता किए गए पृष्ठ और छूटे हुए खतरे संभव हैं।',
      reported: 'Google Safe Browsing के अनुसार असुरक्षित सूचीबद्ध',
      providerNotice: 'खतरा-सूची की जानकारी Google Safe Browsing से प्राप्त हुई है। सटीकता और भरोसेमंद परिणाम की गारंटी नहीं है; गलत चेतावनी और छूटे हुए खतरे संभव हैं।',
      expired: 'खतरा-सूची का यह परिणाम पुराना हो चुका है। वर्तमान जानकारी के लिए वैकल्पिक जाँच फिर चलाएँ।',
      changed: 'दर्ज जानकारी बदल गई है। नए पते के लिए वैकल्पिक जाँच फिर चलाएँ।',
      types: { MALWARE: 'मैलवेयर', SOCIAL_ENGINEERING: 'फ़िशिंग / सोशल इंजीनियरिंग', UNWANTED_SOFTWARE: 'अवांछित सॉफ़्टवेयर', POTENTIALLY_HARMFUL_APPLICATION: 'संभावित हानिकारक ऐप्लिकेशन' }
    },
    te: {
      working: 'ప్రస్తుత ముప్పుల జాబితా సమాచారాన్ని తనిఖీ చేస్తున్నాము…',
      oneUrl: 'ఈ ఐచ్ఛిక తనిఖీ కోసం ఒక HTTP లేదా HTTPS వెబ్ చిరునామాను మాత్రమే నమోదు చేయండి. సందేశ పరిశీలన ఈ పరికరంలోనే జరుగుతుంది.',
      unsupported: 'ఈ చిరునామా ఆకృతిని నమ్మదగిన విధంగా తనిఖీ చేయలేకపోయాము. ఇది ధృవీకరించబడలేదు; స్థానిక హెచ్చరికలను పరిశీలించి, అధికారిక మార్గాన్ని స్వయంగా తెరిచి నిర్ధారించుకోండి.',
      unavailable: 'ప్రస్తుత ముప్పుల జాబితా సమాచారం అందుబాటులో లేదు. భద్రతపై ఏ నిర్ణయమూ ఇవ్వలేదు. స్థానిక తనిఖీ హెచ్చరికలు ఇంకా వర్తిస్తాయి.',
      noMatch: 'ఈ చిరునామాకు ప్రస్తుత ముప్పుల జాబితా హెచ్చరిక ఏదీ రాలేదు.',
      caveat: 'సరిపోలిక లేకపోవడం భద్రతకు రుజువు కాదు. కొత్త దాడులు, దాడికి గురైన పేజీలు, గుర్తించని ముప్పులు ఉండవచ్చు.',
      reported: 'Google Safe Browsing జాబితాలో అసురక్షితంగా నమోదైంది',
      providerNotice: 'ముప్పుల జాబితా సమాచారం Google Safe Browsing అందించింది. ఖచ్చితత్వానికి, విశ్వసనీయతకు హామీ లేదు; పొరపాటు హెచ్చరికలు, గుర్తించని ముప్పులు ఉండవచ్చు.',
      expired: 'ముప్పుల జాబితా ఫలితం పాతబడింది. ప్రస్తుత సమాచారం కోసం ఐచ్ఛిక తనిఖీని మళ్లీ చేయండి.',
      changed: 'నమోదు చేసిన సమాచారం మారింది. కొత్త చిరునామాకు ఐచ్ఛిక తనిఖీని మళ్లీ చేయండి.',
      types: { MALWARE: 'మాల్‌వేర్', SOCIAL_ENGINEERING: 'ఫిషింగ్ / సోషల్ ఇంజినీరింగ్', UNWANTED_SOFTWARE: 'అవాంఛిత సాఫ్ట్‌వేర్', POTENTIALLY_HARMFUL_APPLICATION: 'హానికరమయ్యే అవకాశం ఉన్న అప్లికేషన్' }
    }
  };

  function invalid() { return new Error('unsupported_url'); }

  function bytesToLatin(bytes) {
    let value = '';
    for (const byte of bytes) value += String.fromCharCode(byte);
    return value;
  }

  function unescapeBytes(value) {
    let result = bytesToLatin(new TextEncoder().encode(value));
    // Every successful pass shortens the byte string; the input cap bounds work.
    for (let pass = 0; pass <= LIMIT; pass += 1) {
      const decoded = result.replace(/%([a-f\d]{2})/gi, (_, pair) => String.fromCharCode(parseInt(pair, 16)));
      if (decoded === result) return result;
      result = decoded;
    }
    throw invalid();
  }

  function escapeBytes(value) {
    let result = '';
    for (let index = 0; index < value.length; index += 1) {
      const byte = value.charCodeAt(index);
      result += byte <= 32 || byte >= 127 || byte === 35 || byte === 37
        ? '%' + byte.toString(16).toUpperCase().padStart(2, '0') : value[index];
    }
    return result;
  }

  function canonicalPath(value) {
    const path = unescapeBytes(value || '/').replace(/\/{2,}/g, '/');
    // Decoded delimiters in authority/path are ambiguous across URL parsers.
    // Never submit a partial set and describe such an address as checked.
    if (path.includes('?') || path.includes('\\')) throw invalid();
    const terminal = path.endsWith('/') || /\/(?:\.|\.\.)$/.test(path);
    const segments = [];
    for (const segment of path.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') segments.pop();
      else segments.push(segment);
    }
    return escapeBytes('/' + segments.join('/') + (terminal && segments.length ? '/' : ''));
  }

  function canonicalize(input) {
    if (typeof input !== 'string' || Array.from(input).length > LIMIT) throw invalid();
    let value = input.replace(/[\t\r\n]/g, '').trim();
    if (!value || /\s/.test(value.split(/[/?]/, 1)[0])) throw invalid();
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = 'http://' + value;
    const match = /^(https?):\/\/([^/?#]*)([^#]*)(?:#.*)?$/i.exec(value);
    if (!match) throw invalid();
    const scheme = match[1].toLowerCase();
    let authority = match[2].slice(match[2].lastIndexOf('@') + 1);
    if (!authority || authority.startsWith('[') || authority.includes('\\')) throw invalid();
    const port = authority.lastIndexOf(':');
    if (port >= 0) {
      const number = authority.slice(port + 1);
      if (!/^\d*$/.test(number) || Number(number || 0) > 65535) throw invalid();
      authority = authority.slice(0, port);
    }
    const hostBytes = unescapeBytes(authority).replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.');
    if (!hostBytes || /[\x00-\x20\x7f/#?@:\\]/.test(hostBytes)) throw invalid();
    let decodedHost;
    try { decodedHost = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(hostBytes, character => character.charCodeAt(0))); }
    catch (_) { throw invalid(); }
    let parsed;
    try { parsed = new URL('http://' + decodedHost + '/'); } catch (_) { throw invalid(); }
    const host = parsed.hostname.toLowerCase().replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.');
    if (!host || host.includes(':') || !/^[a-z\d._-]+$/.test(host)) throw invalid();
    const tail = match[3] || '/';
    const queryIndex = tail.indexOf('?');
    const hasQuery = queryIndex >= 0;
    const rawPath = hasQuery ? tail.slice(0, queryIndex) : tail;
    const query = hasQuery ? escapeBytes(unescapeBytes(tail.slice(queryIndex + 1))) : '';
    const path = canonicalPath(rawPath || '/');
    return { scheme, host, path, query, hasQuery,
      canonical: scheme + '://' + host + path + (hasQuery ? '?' + query : '') };
  }

  function expressions(input) {
    const url = typeof input === 'string' ? canonicalize(input) : input;
    const hosts = [url.host];
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.host)) {
      const labels = url.host.split('.');
      for (let start = Math.max(1, labels.length - 5); start < labels.length - 1; start += 1) {
        const suffix = labels.slice(start).join('.');
        if (!hosts.includes(suffix)) hosts.push(suffix);
      }
    }
    const paths = [];
    if (url.hasQuery) paths.push(url.path + '?' + url.query);
    if (!paths.includes(url.path)) paths.push(url.path);
    const directories = ['/'];
    for (let index = 1; index < url.path.length && directories.length < 4; index += 1) {
      if (url.path[index] === '/') directories.push(url.path.slice(0, index + 1));
    }
    for (const path of directories) if (!paths.includes(path)) paths.push(path);
    return hosts.flatMap(host => paths.map(path => host + path));
  }

  function base64(bytes) {
    let encoded = '';
    for (let index = 0; index < bytes.length; index += 3) {
      const value = (bytes[index] << 16) | ((bytes[index + 1] || 0) << 8) | (bytes[index + 2] || 0);
      encoded += ALPHABET[(value >>> 18) & 63] + ALPHABET[(value >>> 12) & 63];
      encoded += index + 1 < bytes.length ? ALPHABET[(value >>> 6) & 63] : '=';
      encoded += index + 2 < bytes.length ? ALPHABET[value & 63] : '=';
    }
    return encoded;
  }

  async function hashExpressions(input, cryptoSource) {
    const cryptoObject = cryptoSource || globalThis.crypto;
    if (!cryptoObject?.subtle) throw invalid();
    const values = expressions(input);
    if (!values.length || values.length > 30) throw invalid();
    const hashes = await Promise.all(values.map(async value => new Uint8Array(await cryptoObject.subtle.digest('SHA-256', new TextEncoder().encode(value)))));
    return { fullHashes: hashes.map(base64), prefixes: [...new Set(hashes.map(value => base64(value.slice(0, 4))))] };
  }

  function matchesFor(response, expectedHashes) {
    const expected = new Set(expectedHashes);
    if (!response || response.provider !== 'google_safe_browsing_v5' || !Array.isArray(response.fullHashes)) throw invalid();
    const matches = new Set();
    for (const row of response.fullHashes) {
      if (!row || !expected.has(row.fullHash) || !Array.isArray(row.fullHashDetails)) continue;
      for (const detail of row.fullHashDetails) {
        if (detail && THREATS.has(detail.threatType) && Array.isArray(detail.attributes) && detail.attributes.length === 0) matches.add(detail.threatType);
      }
    }
    return [...matches];
  }

  function mount() {
    const button = document.getElementById('reputation-check');
    const output = document.getElementById('reputation-result');
    const input = document.getElementById('checker-input');
    if (!button || !output || !input) return;
    const language = document.documentElement.lang.split('-')[0];
    const copy = COPY[language] || COPY.en;
    let generation = 0, controller = null, expiry = null, expiresAt = 0;
    const disclosure = document.createElement('p');
    disclosure.className = 'field-hint'; disclosure.textContent = copy.providerNotice;
    button.insertAdjacentElement('beforebegin', disclosure);
    function render(heading, paragraphs, warning) {
      output.replaceChildren();
      const title = document.createElement('h3'); title.textContent = heading; output.append(title);
      for (const value of paragraphs) { const line = document.createElement('p'); line.textContent = value; output.append(line); }
      output.dataset.level = warning ? 'high' : 'unverified';
      output.hidden = false;
    }
    function invalidate() {
      generation += 1;
      controller?.abort(); clearTimeout(expiry);
      if (!output.hidden) render(copy.changed, [], false);
      button.disabled = false; expiresAt = 0;
    }
    input.addEventListener('input', invalidate);
    document.getElementById('checker-clear')?.addEventListener('click', () => {
      invalidate(); output.replaceChildren(); output.hidden = true;
    });
    document.querySelectorAll('[data-checker-example]').forEach(example => example.addEventListener('click', invalidate));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && expiresAt && Date.now() >= expiresAt) {
        clearTimeout(expiry); expiresAt = 0; render(copy.expired, [], false);
      }
    });
    button.addEventListener('click', async () => {
      const value = input.value.trim();
      if (!/^(?:https?:\/\/|www\.)\S+$/i.test(value)) { render(copy.oneUrl, [], false); return; }
      const token = document.querySelector('meta[name="csrf-token"]')?.content;
      if (!token) { render(copy.unavailable, [], false); return; }
      const current = ++generation;
      button.disabled = true;
      render(copy.working, [], false);
      const activeController = new AbortController();
      controller = activeController;
      const timeout = setTimeout(() => activeController.abort(), 12000);
      try {
        let local;
        try { local = await hashExpressions(value); }
        catch (_) { if (current === generation) render(copy.unsupported, [], false); return; }
        if (current !== generation) return;
        // The only outgoing input is a bounded array of four-byte fingerprints.
        const result = await fetch('/api/reputation', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token, Accept: 'application/json' },
          body: JSON.stringify({ prefixes: local.prefixes }), signal: activeController.signal,
          referrerPolicy: 'no-referrer'
        });
        if (!result.ok) throw invalid();
        const response = await result.json();
        const kinds = matchesFor(response, local.fullHashes);
        if (current !== generation) return;
        if (kinds.length) {
          const observed = Number(response.observedAt);
          const remaining = Math.min(1800000, observed * 1000 + 1800000 - Date.now());
          if (!Number.isFinite(remaining) || remaining <= 0) throw invalid();
          render(copy.reported, [kinds.map(kind => copy.types[kind]).join(', '), copy.providerNotice], true);
          clearTimeout(expiry); expiresAt = Date.now() + remaining;
          expiry = setTimeout(() => { expiresAt = 0; render(copy.expired, [], false); }, remaining);
        } else render(copy.noMatch, [copy.caveat], false);
      } catch (_) {
        if (current === generation) render(copy.unavailable, [], false);
      } finally {
        clearTimeout(timeout);
        if (current === generation) button.disabled = false;
        if (controller === activeController) controller = null;
      }
    });
    window.addEventListener('pagehide', () => {
      generation += 1; controller?.abort(); clearTimeout(expiry);
      output.replaceChildren(); output.hidden = true;
    });
  }

  return { canonicalize, expressions, hashExpressions, matchesFor, base64, COPY, mount };
}));
