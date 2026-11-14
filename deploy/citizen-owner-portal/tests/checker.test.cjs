'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { analyze, COPY, KNOWN_DOMAINS, LIMIT } = require('../static/js/scam_checker.js');
const fixtures = require('./checker-fixtures-adversarial.json');
const has = (result, id) => result.rules.some(rule => rule.id === id);

for (const fixture of fixtures) {
  test(fixture.reason, () => {
    const result = analyze(fixture.input);
    const expected = fixture.expectations;
    if (expected.verdict) assert.equal(result.verdict, expected.verdict);
    for (const rule of expected.hasRules || []) assert.ok(has(result, rule), `Expected ${rule}`);
    for (const rule of expected.notRules || []) assert.equal(has(result, rule), false, `Unexpected ${rule}`);
    if (expected.minimumScore !== undefined) assert.ok(result.score >= expected.minimumScore);
    if (expected.maximumScore !== undefined) assert.ok(result.score <= expected.maximumScore);
  });
}

test('all reference domains and their actual subdomains have context without blanket safety claims', () => {
  for (const entry of KNOWN_DOMAINS) {
    for (const domain of entry.domains) {
      const result = analyze(`https://${domain}/ordinary-page`);
      assert.equal(result.verdict, 'known_domain', domain);
      assert.equal(result.score, 0, domain);
      assert.equal(result.domainFindings[0].knownBrand, entry.name);
      assert.equal(analyze(`https://www.${domain}/`).domainFindings[0].status, 'known_domain');
    }
  }
});

test('a genuine host does not cancel dangerous instructions or HTTP', () => {
  assert.equal(analyze('Share your OTP to confirm your account at https://amazon.in').verdict, 'suspicious');
  assert.equal(analyze('http://amazon.in').verdict, 'suspicious');
  assert.equal(analyze('https://amazon.in').liveReputationChecked, false);
});

test('all t.jio SMS URLs remain hidden destinations rather than blanket fraud labels', () => {
  const result = analyze('Want to know number of SIMs in your name? Download Sanchar Saathi to check: Android: https://t.jio/ISATHI/MWxHL9 iOS: https://t.jio/ISATHI/ios Dept of Telecom, Govt of India');
  assert.equal(result.addressCount, 2);
  assert.equal(result.domainFindings.length, 1);
  assert.equal(result.verdict, 'unverified');
  assert.equal(result.score, 18);
});

test('near spelling is a qualified warning; common brand words do not cause blanket findings', () => {
  const changed = analyze('https://micorsoft.com');
  assert.ok(has(changed, 'brand_spelling'));
  assert.equal(changed.verdict, 'suspicious');
  assert.equal(has(analyze('https://amazon-river.example'), 'brand_lookalike'), false);
  assert.equal(analyze('https://google.co.za').verdict, 'unverified');
  assert.equal(analyze('https://google.co.za').score, 0);
});

test('Unicode and ASCII-punycode lookalikes receive the same strong finding', () => {
  const unicode = analyze('https://аmazon.in');
  const encoded = analyze('https://xn--mazon-3ve.in');
  assert.equal(unicode.score, encoded.score);
  assert.deepEqual(unicode.rules, encoded.rules);
  assert.equal(analyze('https://bücher.example').verdict, 'unverified');
  assert.equal(has(analyze('https://bücher.example'), 'brand_lookalike'), false);
});


test('short reference names use visual confusables without broad typo accusations', () => {
  assert.ok(has(analyze('https://аррӏе.com'), 'brand_lookalike'));
  assert.ok(has(analyze('https://app1e.com'), 'brand_lookalike'));
  assert.equal(has(analyze('https://apples.example'), 'brand_spelling'), false);
  assert.equal(has(analyze('https://abi.example'), 'brand_lookalike'), false);
});

test('normal Indic joiners do not become a fraud warning', () => {
  assert.equal(has(analyze('మీ బ్రౌజర్\u200cలో ఈ పేజీ తెరవండి.'), 'hidden_characters'), false);
  assert.equal(has(analyze('మీ బ్రౌజర్\u200dలో ఈ పేజీ తెరవండి.'), 'hidden_characters'), false);
  assert.ok(has(analyze('https://ama\u200bzon.in'), 'hidden_characters'));
});

test('the checker does not mistake an email address for a website', () => {
  const result = analyze('Contact help@amazon.in for a receipt.');
  assert.equal(result.addressCount, 0);
  assert.equal(result.verdict, 'no_signs');
});

test('numeric, IPv6 and malformed address structures are handled without opening them', () => {
  for (const input of ['http://192.0.2.10', 'https://[2001:db8::1]', 'https://[2001:db8::1]/login', 'http://2130706433/login']) {
    assert.ok(has(analyze(input), 'ip_host'), input);
  }
  assert.ok(has(analyze('https://[bad-host'), 'malformed_address'));
  assert.ok(has(analyze('https://amazon.in..'), 'malformed_address'));
  assert.doesNotThrow(() => analyze('Malformed %E0%A4%A and https://[bad-host alongside https://amazon.in'));
});

test('an outer reference hostname does not verify a nested redirect destination', () => {
  const result = analyze('https://google.com/url?redirect=https://destination.example');
  assert.equal(result.verdict, 'unverified');
  assert.ok(has(result, 'redirect_parameter'));
  assert.equal(result.domainFindings[0].status, 'known_domain');
});

test('deduplication and the score ceiling are stable across repeated links', () => {
  assert.equal(analyze('https://arnazon.in').score, analyze('https://arnazon.in https://arnazon.in').score);
  const result = analyze('Urgent! Police digital arrest: pay now for your cashback refund. Share your OTP. Enter UPI PIN to receive. Install AnyDesk. https://arnazon.in https://bit.ly/x http://192.0.2.1');
  assert.equal(result.score, 100);
  assert.equal(new Set(result.rules.map(rule => rule.id)).size, result.rules.length);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.rules) && Object.isFrozen(result.domainFindings));
});

test('input validation uses Unicode code points before bounded analysis', () => {
  for (const input of [null, undefined, 3, {}, []]) assert.throws(() => analyze(input), error => error.code === 'INVALID_INPUT');
  assert.throws(() => analyze(' \n '), error => error.code === 'EMPTY_INPUT');
  assert.throws(() => analyze('x'.repeat(LIMIT + 1)), error => error.code === 'INPUT_TOO_LONG');
  assert.equal(analyze('🙂'.repeat(LIMIT)).score, 0);
});

test('result data contains hostnames only, without pasted paths, queries, credentials or message text', () => {
  const privateMarker = 'UNIQUE_PRIVATE_SENTINEL';
  const result = analyze(`Please see https://user:${privateMarker}@amazon.in/${privateMarker}?secret=${privateMarker}`);
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
  assert.equal(result.domainFindings[0].host, 'amazon.in');
  assert.equal(JSON.stringify(analyze(privateMarker)).includes(privateMarker), false);
});

test('warning rules, verdicts and hostname explanations are complete in all three languages', () => {
  for (const language of ['hi', 'te']) {
    for (const field of ['rules', 'verdicts', 'addressLabels', 'addressReasons']) {
      assert.deepEqual(Object.keys(COPY[language][field]).sort(), Object.keys(COPY.en[field]).sort());
    }
    assert.notEqual(COPY[language].score, COPY.en.score);
  }
  for (const fixture of fixtures) {
    const result = analyze(fixture.input);
    for (const language of ['en', 'hi', 'te']) {
      assert.ok(COPY[language].verdicts[result.verdict]);
      for (const rule of result.rules) assert.ok(COPY[language].rules[rule.id].every(text => typeof text === 'string' && text.trim()));
      for (const item of result.domainFindings) assert.ok(COPY[language].addressReasons[item.status]);
    }
  }
});

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {};
    this.attributes = {}; this.value = ''; this.hidden = false; this.textContent = '';
    this.classList = { add() {}, remove() {} };
  }
  set innerHTML(_) { throw new Error('Unsafe HTML insertion attempted'); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; this.textContent = ''; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { this.focused = true; }
  allText() { return [this.textContent, ...this.children.map(node => node.allText())].join(' '); }
}

for (const language of ['en', 'hi', 'te']) {
  test(`${language}: UI renders context and HTTP warning, then clears private input and stale results`, () => {
    const ids = Object.fromEntries(['checker-form', 'checker-input', 'checker-count', 'checker-results', 'checker-clear', 'checker-empty'].map(id => [id, new Element()]));
    const pageEvents = {};
    const document = {
      readyState: 'complete', documentElement: { lang: language },
      getElementById: id => ids[id] || null,
      querySelectorAll: () => [], createElement: tag => new Element(tag)
    };
    const context = {
      document, URL, addEventListener(name, callback) { pageEvents[name] = callback; },
      fetch() { throw new Error('A network request was attempted'); }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/js/scam_checker.js'), 'utf8'), context);
    const input = ids['checker-input'], output = ids['checker-results'];
    input.value = 'http://amazon.in/?private=SHOULD_NOT_BE_ECHOED';
    ids['checker-form'].listeners.submit({ preventDefault() {} });
    assert.equal(output.dataset.verdict, 'suspicious');
    assert.ok(output.allText().includes(COPY[language].httpWarning));
    assert.equal(output.allText().includes('SHOULD_NOT_BE_ECHOED'), false);
    input.value = 'https://arnazon.in';
    input.listeners.input();
    assert.equal(output.hidden, true);
    ids['checker-form'].listeners.submit({ preventDefault() {} });
    assert.equal(output.dataset.verdict, 'high_risk');
    assert.ok(output.allText().includes(COPY[language].verdicts.high_risk));
    pageEvents.pagehide();
    assert.equal(input.value, '');
    assert.equal(output.hidden, true);
    assert.equal(output.children.length, 0);
  });
}

test('source has no transport, telemetry, browser storage or execution primitives', () => {
  const source = fs.readFileSync(path.join(__dirname, '../static/js/scam_checker.js'), 'utf8');
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|eval)\s*\(/.test(source), false);
  assert.equal(/\b(?:localStorage|sessionStorage)\s*\./.test(source), false);
  assert.equal(/\.innerHTML\s*=/.test(source), false);
});
