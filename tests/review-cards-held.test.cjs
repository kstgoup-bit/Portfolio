'use strict';
// 지피 사후 검토 CR-4 · 순태씨 D4 승인(2026-11-25): 재무·시세 검증과 합의 전 AI 카드는 '클로 단독 의견 · 판단 보류'로만 보인다.
// D1: KIS 대조 화면 문구는 실제(백업 포함)와 같아야 한다. 합성 자료만 사용, 네트워크·저장소 없음.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(path.join(__dirname, '../has/review-cards.js'), 'utf8');
const card = (o) => Object.assign({ ticker: 'SYN1', market: 'KR', name: '합성1', verdict: 'buy-review', headline: 'h', reasons: ['r'], risks: ['k'], sources: [] }, o);
const DOC = { v: 1, reviewedAt: '2026-11-25T07:00:00+09:00', reviewer: 'Claude', notice: '투자 자문이 아닙니다.', cards: [card({ rank: 1 }), card({ ticker: 'SYN2', name: '합성2', verdict: 'wait' })] };
function setup(withGate) {
  const dom = new JSDOM('<!doctype html><body><div id="hasBriefStrip"><div class="hdb-head">머리줄</div></div><section id="m"></section></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = (u) => Promise.resolve({ ok: /latest\.json$/.test(u) && !/holdings/.test(u), json: () => Promise.resolve(/fear-us/.test(u) ? null : JSON.parse(JSON.stringify(DOC))) });
  if (withGate) w.HASChartGate = { cached: () => ({ stage: 'falling' }), describe: () => ({ label: '하락 추세', color: '#8b2020', detail: '' }), fresh: () => true, load: () => Promise.resolve() };
  w.eval(SRC);
  return w;
}
const tick = () => new Promise(r => setTimeout(r, 20));
test('D4: buy-review는 녹색 매수 검토가 아니라 단독 의견·판단 보류, 경고문 표시, 5% 예외 정찰·분할 금액 안내 없음', async () => {
  const w = setup(true); w.HASReviewCards.mount(w.document.getElementById('m')); await tick(); await tick();
  const t = w.document.getElementById('m').textContent;
  a.doesNotMatch(t, /🟢 매수 검토/); a.match(t, /매수 후보 · 판단 보류\(재무·시세 검증 전\)/);
  a.ok(w.document.querySelector('[data-testid=review-held-note]'));
  a.doesNotMatch(t, /예외 정찰/); a.doesNotMatch(t, /정찰병\(목표 금액의 10%\)/); a.match(t, /분할매수 금액 안내는 보류/);
  a.match(t, /차트 관문: 하락 추세/); // 타이밍 참고 정보는 그대로
  a.match(t, /🟡 관망·보류/); // 다른 판단 라벨은 그대로
  const head = [...w.document.querySelectorAll('#m article div')].find(d => /합성1/.test(d.textContent));
  a.equal(head.style.color, 'rgb(51, 51, 51)');
});
test('D4: 현황 띠는 매수 건수 없이 카드로 가는 길만(클로 단독·판단 보류)', async () => {
  const w = setup(false); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick(); await tick();
  const b = w.document.querySelector('[data-testid=hdb-ai-fear]'); a.ok(b);
  a.doesNotMatch(b.textContent, /매수 검토|\d+건/); a.match(b.textContent, /판단 보류/);
  const s = w.HASReviewCards.summary(); a.equal(s.held, true); a.equal(s.cards, 2);
});
test('D4: 원본 판단 값(JSON verdict)은 바꾸지 않음 — 성적표 채점용 verdict 유지', () => {
  const R = require('../has/review-cards.js'); const v = R.validate(JSON.parse(JSON.stringify(DOC)));
  a.equal(v.cards[0].verdict, 'buy-review'); a.equal(R.VERDICT['buy-review'][0], '🟢 매수 검토'); a.match(R.shown('buy-review')[0], /판단 보류/); a.equal(R.shown('wait'), R.VERDICT.wait);
});
test('D1: KIS 대조 화면 문구가 백업 포함과 일치(백업 미포함 문구 없음)', () => {
  const k = fs.readFileSync(path.join(__dirname, '../has/kis-crosscheck.js'), 'utf8');
  a.doesNotMatch(k, /백업 미포함/); a.match(k, /백업에 포함/);
  a.match(fs.readFileSync(path.join(__dirname, '../backup/core.js'), 'utf8'), /has_kisCrossLog_v1/);
});
