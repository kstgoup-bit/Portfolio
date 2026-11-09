'use strict';
// Independent audit regressions: synthetic strings and pure/mock execution only.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const R = require('../has/gas-redact'), M = require('../has/market-data'), F = require('../has/market-fixtures');
const tail = 'tail' + 'Secret123', deployment = 'AKfycbx' + 'A'.repeat(33);
function safe(source, marker) {
  const out = R.redact(source);
  if (!out.ok) a.equal(out.text, '');
  else a.ok(!out.text.includes(marker), 'Sensitive synthetic fragment retained');
  return out;
}
test('independent: decoded API prefix and escaped deployment URL cannot leak', () => {
  const api = 'SyA1234567890' + 'abcdefghijklmnopqrstuv';
  safe('const x = "' + String.raw`\x41` + 'Iza' + api + '";', api);
  safe('const x = "https:' + String.raw`\/\/script.google.com\/macros\/s\/` + deployment + String.raw`\/exec";`, deployment);
});
test('independent: escaped identifiers, codepoint keys and brackets cannot leak', () => {
  for (const source of [
    String.raw`const pass\u0077ord = '` + tail + "';",
    String.raw`const cfg={"pass\u{77}ord":"` + tail + '"};',
    "cfg['password']='" + tail + "';"
  ]) safe(source, tail);
});
test('independent: zero-prefixed octal URL escapes withhold all output', () => {
  const source = String.raw`const x="https:\057\057script.google.com\057macros\057s\057` + deployment + String.raw`\057exec";`;
  const out = R.redact(source); a.equal(out.ok, false); a.equal(out.text, '');
});
function calendar(p, through = '2026-11-08') {
  const from = '2026-11-06';
  p.sessionCalendar = { market: 'US', timeZone: 'America/New_York', source: 'Declared sample calendar',
    reference: 'https://example.invalid/calendar', reviewStatus: 'declared', reviewedAt: '2026-11-06T22:00:00Z', from, through, sessions: [] };
  for (let t = Date.parse(from); t <= Date.parse(through); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    p.sessionCalendar.sessions.push(date === from || date === '2026-11-16'
      ? { date, status: 'regular', closeAt: date + 'T21:00:00Z' }
      : { date, status: 'closed', reason: 'Invented audit closure' });
  }
  return p;
}
test('independent: admitted synthetic calendar cannot establish imported freshness', () => {
  const p = calendar(F.create()); p.mode = 'imported'; delete p.history; delete p.secFacts; delete p.valuationDocument;
  p.quotes.forEach(q => { q.synthetic = false; q.source = 'Declared provider'; q.rights.synthetic = false; q.rights.reference = 'https://example.invalid/rights'; });
  a.notEqual(M.analyzePack(p, F.NOW).quote.status, 'invalid');
  for (const mutate of [c => c.source = 'Invented test schedule', c => c.reference = 'SYNTHETIC: test calendar', c => c.synthetic = true]) {
    const copy = JSON.parse(JSON.stringify(p)); mutate(copy.sessionCalendar);
    const result = M.analyzePack(copy, F.NOW); a.equal(result.quote.status, 'invalid'); a.equal(result.quote.selected, null);
  }
});
test('independent: long-holiday preview explicitly withholds legacy valuation without rewriting evidence', () => {
  const p = calendar(F.create(), '2026-11-16'), before = JSON.stringify(p);
  const r = M.analyzePack(p, '2026-11-16T19:00:00Z');
  a.equal(r.quote.status, 'consistent-unverified'); a.equal(r.quote.selected.freshness.status, 'current-declared');
  a.equal(r.quote.selected.classification.stale, false); a.equal(r.quote.selected.verification, 'unverified');
  a.equal(r.valuation, null); a.ok(r.issues.some(x => x.includes('기존 가치평가의 4일 정책')));
  a.equal(JSON.stringify(p), before);
  a.ok(M.analyzePack(F.create(), F.NOW).valuation);
});
test('independent: failed legacy copy cannot report success or replace original clipboard', () => {
  const elements = {}; let clipboard = 'synthetic original', calls = 0;
  for (const id of ['in', 'out', 'run', 'copy', 'reset', 'status', 'summary']) elements[id] = {
    value: '', textContent: '', disabled: false, listeners: {},
    addEventListener(event, fn) { this.listeners[event] = fn; }, replaceChildren() {}, appendChild() {}, select() {}
  };
  const context = { window: { HASGasRedact: R, addEventListener() {} }, document: {
    getElementById(id) { return elements[id]; }, createElement() { return {}; },
    execCommand(command) { a.equal(command, 'copy'); calls++; return false; }
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../has/gas-redactor.js'), 'utf8'), context);
  elements.in.value = 'const password="' + tail + '";'; elements.run.listeners.click(); elements.copy.listeners.click();
  a.equal(calls, 1); a.equal(clipboard, 'synthetic original'); a.equal(elements.copy.disabled, false);
  a.match(elements.status.textContent, /복사하지 못했습니다/); a.match(elements.status.textContent, /원본이 남아/);
  a.doesNotMatch(elements.status.textContent, /결과를 복사했습니다/);
});

// --- 클로 통합 검토(2026-11-09): 호출자 코드 실행 방지 ---
test('접근자(getter)·Map·Date·Proxy·심볼·비유한 수가 든 입력은 거절하고 getter 를 실행하지 않는다(함정을 단 Proxy 포함. 함정 없는 Proxy 는 일반 객체와 구별 불가라 허용)', () => {
  const M = require('../has/market-data.js'), F = require('../has/market-fixtures.js'); const base = () => JSON.parse(JSON.stringify(F.create()));
  let hit = 0; const g = base(); Object.defineProperty(g, 'evil', { enumerable: true, get() { hit++; return 1; } }); require('node:assert/strict').equal(M.analyzePack(g, F.NOW).status, 'invalid'); require('node:assert/strict').equal(hit, 0);
  for (const mut of [p => { p.x = new Map(); }, p => { p.x = new Date(); }, p => { p.x = new Proxy({}, { get() { throw new Error('trap'); } }); }, p => { p[Symbol('s')] = 1; }, p => { p.x = NaN; }, p => { p.x = Infinity; }, p => { p.x = () => 1; }, p => { p.x = 1n; }, p => { const a = {}; a.a = a; p.x = a; }]) { const p = base(); mut(p); require('node:assert/strict').equal(M.analyzePack(p, F.NOW).status, 'invalid'); }
  require('node:assert/strict').notEqual(M.analyzePack(Object.assign(Object.create(null), base()), F.NOW).status, 'invalid'); // 프로토타입 없는 일반 객체는 허용
  for (let i = 0; i < 3; i++) { const p = base(), s = JSON.stringify(p); M.analyzePack(p, F.NOW); require('node:assert/strict').equal(JSON.stringify(p), s); }
});
