'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../source/static/js/ui.js'), 'utf8');

function mount(hash = '') {
  const controls = { 'resources-details': { open: false } };
  const events = {}, browserEvents = {};
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById(id) { return controls[id] || null; },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { events[name] = callback; }
  };
  const window = {
    location: { hash },
    addEventListener(name, callback) { browserEvents[name] = callback; }
  };
  vm.runInNewContext(source, { document, window });
  return { controls, events, browserEvents, window };
}

test('the resource directory starts collapsed on an ordinary visit', () => {
  const state = mount();
  assert.equal(state.controls['resources-details'].open, false);
});

test('resource navigation opens the official directory', () => {
  const state = mount();
  state.events.click({ target: { closest: () => ({ getAttribute: () => '#resources' }) } });
  assert.equal(state.controls['resources-details'].open, true);
});

test('direct links and browser hash changes reveal the requested directory', () => {
  assert.equal(mount('#resources').controls['resources-details'].open, true);
  const state = mount();
  state.window.location.hash = '#resources';
  state.browserEvents.hashchange();
  assert.equal(state.controls['resources-details'].open, true);
});

test('citizen links and non-link clicks do not reveal the resource directory', () => {
  const state = mount('#checker');
  state.events.click({ target: { closest: () => null } });
  state.events.click({ target: { closest: () => ({ getAttribute: () => '#citizen' }) } });
  assert.equal(state.controls['resources-details'].open, false);
});

test('language switching stays inside the GitHub Pages project path', () => {
  let changed;
  const location = { hash: '', assign(path) { changed = path; } };
  const controls = {};
  const languageControl = { addEventListener(name, callback) { controls[name] = callback; } };
  const document = {
    documentElement: { classList: { add() {} }, dataset: { basePath: '/cyber-suraksha-2.0' } },
    getElementById(id) { return id === 'language-select' ? languageControl : null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  vm.runInNewContext(source, { document, window: { location, addEventListener() {} } });
  controls.change({ target: { value: 'te' } });
  assert.equal(changed, '/cyber-suraksha-2.0/te/');
  controls.change({ target: { value: '//external.invalid' } });
  assert.equal(changed, '/cyber-suraksha-2.0/te/');
});


test('project-prefixed resource navigation reopens a manually collapsed directory', () => {
  const state = mount('#resources');
  state.controls['resources-details'].open = false;
  state.events.click({ target: { closest: () => ({ hash: '#resources', getAttribute: () => '/cyber-suraksha-2.0/en/#resources' }) } });
  assert.equal(state.controls['resources-details'].open, true);
});
