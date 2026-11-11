'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const ui = fs.readFileSync(path.join(__dirname, '../has/gas-redactor.js'), 'utf8');
function setup(copy) {
  const elements = {};
  for (const id of ['in', 'out', 'run', 'copy', 'reset', 'status', 'summary']) elements[id] = {
    value: '', textContent: '', disabled: false, listeners: {}, children: [],
    addEventListener(name, fn) { this.listeners[name] = fn; },
    replaceChildren() { this.children = []; }, appendChild(p) { this.children.push(p); }, select() {}
  };
  const events = {}, writes = [];
  const context = { window: { HASGasRedact: require('../has/gas-redact.js'), addEventListener(n, fn) { events[n] = fn; } },
    document: { getElementById(id) { return elements[id]; }, createElement() { return {}; }, execCommand() { return copy(); } } };
  if (copy && copy.async) context.navigator = { clipboard: { writeText(value) { writes.push(value); return copy.async(value); } } };
  vm.runInNewContext(ui, context);
  return { e: elements, writes, events, click(id) { elements[id].listeners.click(); },
    input(value) { elements.in.value = value; elements.in.listeners.input(); },
    run(value = 'const password="synthetic-value";') { elements.in.value = value; elements.run.listeners.click(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('copy false and throw are explicit failure, never success', () => {
  for (const copy of [() => false, () => { throw new Error('denied'); }]) {
    const h = setup(copy); h.run(); h.click('copy');
    a.match(h.e.status.textContent, /복사하지 못했습니다/); a.doesNotMatch(h.e.status.textContent, /결과를 복사했습니다/);
    a.equal(h.e.copy.disabled, false);
  }
});
test('legacy copy true reports success', () => {
  const h = setup(() => true); h.run(); h.click('copy'); a.match(h.e.status.textContent, /결과를 복사했습니다/);
});
test('clipboard rejection cannot report success or trigger a second copy', async () => {
  const h = setup({ async: () => Promise.reject(new Error('denied')) }); h.run(); h.click('copy');
  await tick(); a.match(h.e.status.textContent, /복사하지 못했습니다/); a.equal(h.writes.length, 1); a.equal(h.e.copy.disabled, false);
});
test('clipboard resolves before success, repeated clicks do not race', async () => {
  let resolve; const h = setup({ async: () => new Promise(r => { resolve = r; }) });
  h.run(); h.click('copy'); h.click('copy'); a.equal(h.writes.length, 1); a.equal(h.e.copy.disabled, true);
  a.doesNotMatch(h.e.status.textContent, /결과를 복사했습니다/);
  resolve(); await tick(); a.match(h.e.status.textContent, /결과를 복사했습니다/); a.equal(h.e.copy.disabled, false);
});
test('input edits immediately clear stale output and block copying', () => {
  let calls = 0; const h = setup(() => { calls++; return true; }); h.run();
  h.input('const password="different-value";'); a.equal(h.e.out.value, ''); a.equal(h.e.summary.children.length, 0);
  h.click('copy'); a.equal(calls, 0);
  h.run(); h.e.in.value = 'programmatic change'; h.click('copy'); a.equal(calls, 0); a.equal(h.e.out.value, '');
});
test('pending copy after edit, rerun, reset or pageshow warns about old clipboard', async () => {
  for (const change of [h => h.input('new input'), h => h.run('new input'), h => h.click('reset'), h => h.events.pageshow()]) {
    let resolve; const h = setup({ async: () => new Promise(r => { resolve = r; }) });
    h.run(); h.click('copy'); change(h); resolve(); await tick();
    a.match(h.e.status.textContent, /이전 결과/); a.doesNotMatch(h.e.status.textContent, /결과를 복사했습니다/); a.equal(h.e.copy.disabled, false);
  }
});
test('failed redaction clears previous output and is not copyable', () => {
  let calls = 0; const h = setup(() => { calls++; return true; }); h.run(); h.run("const secret = 'first' + 'tail';");
  a.equal(h.e.out.value, ''); h.click('copy'); a.equal(calls, 0);
});
