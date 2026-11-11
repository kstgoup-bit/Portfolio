'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../has');
function setup() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'kis-comparison-lab.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://offline.invalid/' });
  const w = dom.window;
  const forbidden = () => { throw new Error('Forbidden side effect'); };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open']) w[name] = forbidden;
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(w, name, { get: forbidden });
  for (const file of ['kis-comparison.js', 'kis-comparison-fixtures.js', 'close-evidence-sources.js', 'close-comparison.js', 'close-comparison-fixtures.js', 'close-evidence.js', 'close-evidence-fixtures.js', 'kis-comparison-lab.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const e = id => w.document.getElementById(id);
  return { dom, w, e, click: id => e(id).click(), text: () => e('result').textContent,
    mode(value) { e('comparison-mode').value = value; e('comparison-mode').dispatchEvent(new w.Event('change')); } };
}
test('mode switching clears input/results and chooses separate sample and primitive JSON engine', () => {
  const h = setup();
  assert.equal(h.e('comparison-mode').value, 'exacttime');
  h.click('example'); h.click('analyze'); assert.match(h.text(), /가격 비교만 일치/);
  h.mode('officialclose'); assert.equal(h.text(), ''); assert.equal(h.e('comparison-input').value, '');
  assert.match(h.e('mode-help').textContent, /공식성 인증·실시간 확인·출처 독립성·최신성 검증·투자 조언이 아닙니다/);
  h.click('example');
  assert.deepEqual(JSON.parse(h.e('comparison-input').value), JSON.parse(JSON.stringify(h.w.HASCloseEvidenceFixtures.create('agree'))));
  const original = h.w.HASCloseEvidence;
  let calls = 0;
  h.w.HASCloseEvidence = { compareJSON(value) { calls++; assert.equal(typeof value, 'string'); return original.compareJSON(value); } };
  h.click('analyze'); assert.equal(calls, 1); assert.match(h.text(), /합성 시뮬레이션 숫자만 일치/);
  assert.match(h.text(), /독립성·최신성·정확성: 미검증/); assert.match(h.text(), /투자 신호 사용: 불가/);
  h.mode('exacttime'); assert.equal(h.text(), ''); assert.equal(h.e('comparison-input').value, '');
  assert.match(h.e('mode-help').textContent, /시각 오차는 허용하지 않습니다/);
  h.click('example'); h.click('analyze'); assert.equal(calls, 1); assert.match(h.text(), /가격 비교만 일치/);
  h.dom.window.close();
});
test('officialclose invalid input and engine failures never echo values or revive prior success', () => {
  const h = setup(); h.mode('officialclose');
  for (const value of ['null', '{}', '{"secret":"DO_NOT_ECHO"}', '<img src=x onerror=DO_NOT_ECHO>', 'x'.repeat(13000)]) {
    h.click('example'); h.click('analyze'); h.e('comparison-input').value = value; h.click('analyze');
    assert.match(h.text(), /입력 거부/); assert.doesNotMatch(h.text(), /DO_NOT_ECHO|숫자만 일치/);
    assert.equal(h.e('result').querySelectorAll('img,script,a').length, 0);
  }
  h.w.HASCloseEvidence = { compareJSON() { throw new Error('DO_NOT_ECHO'); } };
  h.click('analyze'); assert.equal(h.text(), ''); assert.match(h.e('status').textContent, /분석할 수 없습니다/);
  assert.doesNotMatch(h.e('status').textContent, /DO_NOT_ECHO/); h.dom.window.close();
});
test('close edits, samples, resets and lifecycle invalidate results', () => {
  const h = setup(); h.mode('officialclose');
  for (const event of ['input', 'change']) {
    h.click('example'); h.click('analyze'); h.e('comparison-input').dispatchEvent(new h.w.Event(event)); assert.equal(h.text(), '');
  }
  for (const event of ['pageshow', 'pagehide']) {
    h.click('example'); h.click('analyze'); h.w.dispatchEvent(new h.w.Event(event)); assert.equal(h.text(), ''); assert.equal(h.e('comparison-input').value, '');
  }
  h.click('example'); h.click('analyze'); h.click('example'); assert.equal(h.text(), '');
  h.click('analyze'); h.click('reset'); assert.equal(h.text(), ''); assert.equal(h.e('comparison-input').value, '');
  assert.equal(globalThis.__hasNoNetworkInstalled.attempts.length, 0); h.dom.window.close();
});
test('mode selector is labelled, local-only, and has mobile touch and focus styles', () => {
  const h = setup();
  assert.ok(h.w.document.querySelector('label[for="comparison-mode"]'));
  assert.equal(h.e('comparison-mode').getAttribute('aria-describedby'), 'mode-help');
  assert.deepEqual(Array.from(h.e('comparison-mode').options).map(o => o.value), ['exacttime', 'officialclose']);
  const css = fs.readFileSync(path.join(root, 'kis-comparison-lab.css'), 'utf8');
  assert.match(css, /select \{[^}]*min-height: 48px/); assert.match(css, /select:focus-visible/);
  assert.match(h.w.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, /connect-src 'none'/);
  h.dom.window.close();
});
test('same-session comparison tolerates differing publication times but withholds unmet close conditions', () => {
  const h = setup(); h.mode('officialclose'); h.click('example');
  const sample = JSON.parse(h.e('comparison-input').value);
  assert.notEqual(sample.comparison.gas.publishedAt, sample.comparison.kis.publishedAt);
  h.click('analyze'); assert.match(h.text(), /합성 시뮬레이션 숫자만 일치/);
  for (const scenario of ['missing-source', 'different-venue', 'adjusted', 'pre-close', 'closed', 'early-close']) {
    h.e('comparison-input').value = JSON.stringify(h.w.HASCloseEvidenceFixtures.create(scenario));
    h.click('analyze'); assert.match(h.text(), /비교 보류/); assert.doesNotMatch(h.text(), /숫자만 일치/);
  }
  sample.comparison.kis.price = 10050.000001;
  h.e('comparison-input').value = JSON.stringify(sample);
  const outcome = h.w.HASCloseEvidence.compareJSON(h.e('comparison-input').value);
  h.click('analyze'); assert.equal(outcome.status, 'conflict'); assert.ok(outcome.spreadPct > 0.5);
  assert.ok(h.text().includes('가격 차이: ' + String(outcome.spreadPct) + '%'));
  h.dom.window.close();
});
