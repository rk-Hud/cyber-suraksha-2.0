const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../source/static/js/tools.js'), 'utf8');
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  dispatch(name) { this.listeners[name]?.({ preventDefault() {} }); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute() {}
  remove() {}
  click() { this.dispatch('click'); }
  querySelectorAll(selector) { return this.children.flatMap(node => [node, ...node.querySelectorAll(selector)]).filter(node => node.tag === 'input'); }
  querySelector(selector) { return this.querySelectorAll('input').find(node => node.checked) || null; }
  allText() { return [this.textContent, ...this.children.map(node => node.allText())].join(' '); }
}
const ids = ['planner-form', 'planner-situation', 'planner-access', 'planner-loss', 'planner-results', 'planner-download', 'assistant-form', 'assistant-topic', 'assistant-results', 'quiz-form', 'quiz-question', 'quiz-options', 'quiz-feedback', 'quiz-submit', 'quiz-next'];
for (const lang of ['en', 'hi', 'te']) {
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const created = [];
  const document = { documentElement: { lang }, body: new Element('body'), getElementById: id => elements[id], createElement: tag => { const node = new Element(tag); created.push(node); return node; } };
  let blob = null, revoked = false;
  vm.runInNewContext(source, { document, Object, Blob: class { constructor(contents) { blob = contents.join(''); } }, URL: { createObjectURL: () => 'blob:local', revokeObjectURL: () => { revoked = true; } }, window: { setTimeout(fn) { fn(); } } });
  assert.equal(elements['planner-download'].disabled, true);
  for (const situation of ['money','credentials','message','account','malware']) {
    elements['planner-situation'].value = situation;
    elements['planner-access'].value = 'yes';
    elements['planner-loss'].value = 'yes';
    elements['planner-form'].dispatch('submit');
    assert.equal(elements['planner-results'].hidden, false);
    const list = elements['planner-results'].children.find(node => node.tag === 'ol');
    assert.ok(list.children.length >= 4);
    assert.equal(elements['planner-download'].disabled, false);
    elements['planner-download'].dispatch('click');
    assert.ok(blob.includes('CYBER SURAKSHA 2.0'));
    assert.ok(revoked);
    elements['planner-form'].dispatch('change');
    assert.equal(elements['planner-download'].disabled, true);
    assert.equal(elements['planner-results'].hidden, true);
  }
  for (const topic of ['payment','otp','device','report']) {
    elements['assistant-topic'].value = topic;
    elements['assistant-form'].dispatch('submit');
    assert.equal(elements['assistant-results'].children[1].children.length, 2);
  }
  for (const [index, answer] of [1,2,0,1,0].entries()) {
    const inputs = elements['quiz-options'].querySelectorAll('input');
    assert.equal(inputs.length, 3);
    inputs.forEach((node, i) => { node.checked = i === answer; });
    elements['quiz-form'].dispatch('submit');
    assert.equal(elements['quiz-feedback'].hidden, false);
    assert.equal(elements['quiz-submit'].disabled, true);
    elements['quiz-next'].dispatch('click');
  }
  assert.ok(elements['quiz-question'].allText().includes('5'));
  assert.equal(elements['quiz-submit'].hidden, true);
  elements['quiz-next'].dispatch('click');
  assert.equal(elements['quiz-options'].querySelectorAll('input').length, 3);
  assert.equal(elements['quiz-submit'].hidden, false);
  console.log(lang + ': 5 planner categories, loss flag, local downloads and invalidation, removed SOC form tolerated, assistant4, quiz5+restart passed');
}
