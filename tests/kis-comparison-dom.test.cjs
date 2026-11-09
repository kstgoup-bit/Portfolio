'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../has');
const html = fs.readFileSync(path.join(root, 'kis-comparison-lab.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'kis-comparison-lab.css'), 'utf8');
const sources = ['kis-comparison.js', 'kis-comparison-fixtures.js', 'close-evidence-sources.js', 'close-comparison.js', 'close-comparison-fixtures.js', 'close-evidence.js', 'close-evidence-fixtures.js', 'kis-comparison-lab.js'];
function setup() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://offline.invalid/' });
  const w = dom.window;
  const forbidden = () => { throw new Error('Forbidden side effect'); };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open']) w[name] = forbidden;
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(w, name, { get: forbidden });
  sources.forEach(name => w.eval(fs.readFileSync(path.join(root, name), 'utf8')));
  const e = id => w.document.getElementById(id);
  return { dom, w, e, click: id => e(id).click(), example() { e('example').click(); }, text: () => e('result').textContent };
}
test('synthetic fixture compares without network or storage; repeat analysis has one result', () => {
  const h = setup(); h.example(); h.click('analyze');
  assert.match(h.text(), /가격 비교만 일치/);
  assert.match(h.text(), /독립성·최신성·정확성: 미검증/);
  assert.match(h.text(), /투자 신호 사용: 불가/);
  h.click('analyze'); assert.equal(h.e('result').children.length, 1);
  h.dom.window.close();
});
test('edits, example replacement, resets and page lifecycle discard stale results', () => {
  const h = setup();
  for (const event of ['input', 'change']) {
    h.example(); h.click('analyze'); h.e('comparison-input').value = '{}';
    h.e('comparison-input').dispatchEvent(new h.w.Event(event)); assert.equal(h.text(), '');
  }
  h.example(); h.click('analyze'); h.example(); assert.equal(h.text(), '');
  for (const event of ['pageshow', 'pagehide']) {
    h.example(); h.click('analyze'); h.w.dispatchEvent(new h.w.Event(event));
    assert.equal(h.text(), ''); assert.equal(h.e('comparison-input').value, '');
  }
  h.example(); h.click('analyze'); h.click('reset'); h.click('reset');
  assert.equal(h.text(), ''); assert.equal(h.e('comparison-input').value, ''); h.dom.window.close();
});
test('invalid, hostile and oversized inputs never echo content; prior success is replaced', () => {
  const h = setup();
  for (const input of ['<img src=x onerror=alert(1)>', '{"secret":"DO_NOT_ECHO"}', 'x'.repeat(9000), '{}', 'null']) {
    h.example(); h.click('analyze'); h.e('comparison-input').value = input; h.click('analyze');
    assert.match(h.text(), /입력 거부/); assert.doesNotMatch(h.text(), /DO_NOT_ECHO|onerror|가격 비교만 일치/);
    assert.equal(h.e('result').querySelectorAll('img,script,a').length, 0);
  }
  h.dom.window.close();
});
test('missing metadata, venue differences and shared origin cannot imply independent verification', () => {
  const h = setup();
  for (const scenario of ['missing-time', 'different-venue', 'missing-source']) {
    h.e('comparison-input').value = JSON.stringify(h.w.HASKISComparisonFixtures.create(scenario)); h.click('analyze');
    assert.match(h.text(), /비교 보류/); assert.doesNotMatch(h.text(), /가격 비교만 일치/);
  }
  h.e('comparison-input').value = JSON.stringify(h.w.HASKISComparisonFixtures.create('shared-origin')); h.click('analyze');
  assert.match(h.text(), /동일 원천/); assert.match(h.text(), /독립 검증이 아닙니다/);
  h.dom.window.close();
});
test('above-threshold conflict keeps unrounded spread so the boundary is not disguised', () => {
  const h = setup();
  const fixture = h.w.HASKISComparisonFixtures.create('agree');
  fixture.gas.price = 100; fixture.kis.price = 100.5000001;
  const input = JSON.stringify(fixture);
  const outcome = h.w.HASKISComparison.compareJSON(input);
  h.e('comparison-input').value = input; h.click('analyze');
  assert.equal(outcome.status, 'conflict'); assert.ok(outcome.spreadPct > 0.5);
  assert.match(h.text(), /가격 불일치/);
  assert.ok(h.text().includes('가격 차이: ' + String(outcome.spreadPct) + '%'));
  assert.doesNotMatch(h.text(), /가격 차이: 0\.500000%/);
  h.dom.window.close();
});
test('module failure is fixed message with no exception detail or previous results', () => {
  const h = setup(); h.example(); h.click('analyze');
  h.w.HASKISComparison = { compareJSON() { throw new Error('DO_NOT_ECHO'); } };
  h.click('analyze'); assert.equal(h.text(), '');
  assert.match(h.e('status').textContent, /분석할 수 없습니다/);
  assert.doesNotMatch(h.e('status').textContent, /DO_NOT_ECHO/); h.dom.window.close();
});
test('static 360/390/430 mobile and accessibility constraints (not actual layout verification)', () => {
  const h = setup();
  assert.match(html, /width=device-width, initial-scale=1/);
  assert.equal(h.w.document.querySelector('label[for="comparison-input"]').textContent, 'GAS + KIS 비교 JSON');
  assert.equal(h.e('status').getAttribute('role'), 'status');
  assert.match(css, /min-height: 48px/); assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /min-width: 600px/); assert.match(css, /max-width: 100%/);
  for (const width of [360, 390, 430]) assert.ok(width - 32 - 34 > 0);
  assert.match(html, /실제 모바일 화면 검증은 아직 하지 않았습니다/);
  h.dom.window.close();
});
test('page is self contained and has no connection, export, storage, order or upload controls', () => {
  const h = setup();
  const csp = h.w.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  for (const clause of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "object-src 'none'"]) assert.ok(csp.includes(clause));
  assert.equal(h.w.document.querySelectorAll('form,a,iframe,input,[download]').length, 0);
  assert.equal(h.w.document.querySelectorAll('textarea').length, 1);
  assert.deepEqual(Array.from(h.w.document.querySelectorAll('button')).map(x => x.id), ['example', 'analyze', 'reset']);
  for (const el of h.w.document.querySelectorAll('[src],[href]')) assert.match(el.getAttribute('src') || el.getAttribute('href'), /^(?:kis-comparison|close-(?:comparison|evidence))[\w.-]*\.(js|css)$/);
  const js = fs.readFileSync(path.join(root, 'kis-comparison-lab.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|fetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon|serviceWorker|clipboard|createObjectURL/);
  assert.equal(globalThis.__hasNoNetworkInstalled.attempts.length, 0); h.dom.window.close();
});
