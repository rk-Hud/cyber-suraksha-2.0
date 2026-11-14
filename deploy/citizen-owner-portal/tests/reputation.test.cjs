'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const api = require('../static/js/reputation.js');

test('supported canonical URLs follow Google reference examples', () => {
  const vectors = [
    ['http://host/%25%32%35', 'http://host/%25'],
    ['http://host/%25%32%35%25%32%35', 'http://host/%25%25'],
    ['http://host/%2525252525252525', 'http://host/%25'],
    ['http://host/asdf%25%32%35asd', 'http://host/asdf%25asd'],
    ['http://host/%%%25%32%35asd%%', 'http://host/%25%25%25asd%25%25'],
    ['http://%31%36%38%2e%31%38%38%2e%39%39%2e%32%36/%2E%73%65%63%75%72%65/%77%77%77%2E%65%62%61%79%2E%63%6F%6D/', 'http://168.188.99.26/.secure/www.ebay.com/'],
    ['http://3279880203/blah', 'http://195.127.0.11/blah'],
    ['http://www.google.com/blah/..', 'http://www.google.com/'],
    ['www.google.com', 'http://www.google.com/'],
    ['http://www.evil.com/blah#frag', 'http://www.evil.com/blah'],
    ['http://www.GOOgle.com/', 'http://www.google.com/'],
    ['http://www.google.com.../', 'http://www.google.com/'],
    ['http://www.google.com/foo\tbar\rbaz\n2', 'http://www.google.com/foobarbaz2'],
    ['http://www.google.com/q?', 'http://www.google.com/q?'],
    ['http://www.google.com/q?r?s', 'http://www.google.com/q?r?s'],
    ['http://evil.com/foo#bar#baz', 'http://evil.com/foo'],
    ['http://evil.com/foo?bar;', 'http://evil.com/foo?bar;'],
    ['http://www.gotaport.com:1234/', 'http://www.gotaport.com/'],
    ['  http://www.google.com/  ', 'http://www.google.com/'],
    ['https://www.securesite.com/', 'https://www.securesite.com/'],
    ['http://host.com/ab%23cd', 'http://host.com/ab%23cd'],
    ['http://host.com//twoslashes?more//slashes', 'http://host.com/twoslashes?more//slashes']
  ];
  for (const [input, expected] of vectors) assert.equal(api.canonicalize(input).canonical, expected, input);
});

test('suffix/path expressions match the official protocol example and stay bounded', () => {
  assert.deepEqual(api.expressions('http://a.b.c/1/2.html?param=1'), [
    'a.b.c/1/2.html?param=1', 'a.b.c/1/2.html', 'a.b.c/', 'a.b.c/1/',
    'b.c/1/2.html?param=1', 'b.c/1/2.html', 'b.c/', 'b.c/1/'
  ]);
  const variants = api.expressions('http://a.b.c.d.e.f.g/one/two/three/four/file?q=1');
  assert.equal(variants.length, 30);
  assert.ok(variants.some(value => value.startsWith('c.d.e.f.g/')));
  assert.ok(!variants.some(value => value.startsWith('b.c.d.e.f.g/')));
  assert.deepEqual(api.expressions('http://1.2.3.4/1/'), ['1.2.3.4/1/', '1.2.3.4/']);
});

test('IDNs use punycode and query content is not path-normalized', () => {
  assert.equal(api.canonicalize('https://bücher.example/a').host, 'xn--bcher-kva.example');
  assert.equal(api.canonicalize('https://example.com/a/../b?q=/../x//').canonical, 'https://example.com/b?q=/../x//');
  assert.equal(api.canonicalize('https://example.com/అ').path, '/%E0%B0%85');
});

test('unsupported or ambiguous formats never receive a partial provider check', () => {
  for (const value of ['https://[2001:db8::1]/', 'https://host%23.example/',
    'http:// leadingspace.example/', 'https://example.com/a%3Fsecret',
    'https://example.com/a\\b', 'javascript:alert(1)', 'https://example.com:99999/',
    'https://' + 'a'.repeat(2048)]) assert.throws(() => api.canonicalize(value), /unsupported_url/, value);
});

test('hashes match Node SHA-256 while only four-byte prefixes are submitted', async () => {
  const result = await api.hashExpressions('https://example.com/path?q=1', webcrypto);
  const expected = api.expressions('https://example.com/path?q=1').map(value => createHash('sha256').update(value).digest());
  assert.deepEqual(result.fullHashes, expected.map(value => value.toString('base64')));
  assert.deepEqual(result.prefixes, [...new Set(expected.map(value => value.subarray(0, 4).toString('base64')))]);
  assert.ok(result.prefixes.every(value => Buffer.from(value, 'base64').length === 4));
  assert.ok(!JSON.stringify({ prefixes: result.prefixes }).includes('example.com'));
  assert.equal(api.base64(Uint8Array.from([0xba, 0x78, 0x16, 0xbf])), Buffer.from([0xba, 0x78, 0x16, 0xbf]).toString('base64'));
});

test('full-hash matching rejects prefix collisions, unknown types and non-enforceable attributes', () => {
  const digest = createHash('sha256').update('example.com/').digest('base64');
  const response = { provider: 'google_safe_browsing_v5', fullHashes: [
    { fullHash: digest, fullHashDetails: [
      { threatType: 'MALWARE', attributes: [] },
      { threatType: 'SOCIAL_ENGINEERING', attributes: ['CANARY'] },
      { threatType: 'FUTURE_THREAT', attributes: [] }
    ] },
    { fullHash: 'different-full-hash', fullHashDetails: [{ threatType: 'SOCIAL_ENGINEERING', attributes: [] }] }
  ] };
  assert.deepEqual(api.matchesFor(response, [digest]), ['MALWARE']);
  assert.deepEqual(api.matchesFor({ provider: 'google_safe_browsing_v5', fullHashes: [] }, [digest]), []);
});

test('all runtime warnings and threat labels exist in English, Hindi and Telugu', () => {
  for (const language of ['en', 'hi', 'te']) {
    assert.deepEqual(Object.keys(api.COPY[language]).sort(), Object.keys(api.COPY.en).sort());
    assert.ok(Object.values(api.COPY[language]).every(value => typeof value === 'object' || value.trim()));
    assert.deepEqual(Object.keys(api.COPY[language].types).sort(), Object.keys(api.COPY.en.types).sort());
  }
});
