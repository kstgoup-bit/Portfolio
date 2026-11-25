'use strict';
// 지피 GPT-REVIEW-postmerge-queue-20261125-1030 CR-A1·CR-A2 (D4 범위): 판단 보류 중에는 차트 관문의
// 실제 단계 문구('정찰병(목표의 10%) 가능', '30% 더 가능')와 행동 색이 카드에 다시 나오지 않아야 하고,
// 보유 현황 띠는 매수 쪽 건수를 숨기되 다른 판단 건수는 유지한다. 실제 has/chart-gate.js 를 그대로 사용(합성 자료, 네트워크 없음).
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const SRC = fs.readFileSync(path.join(__dirname, '../has/review-cards.js'), 'utf8');
const GATE = fs.readFileSync(path.join(__dirname, '../has/chart-gate.js'), 'utf8');
const ACTION = /정찰병|10%|30%|가능|예외 정찰|5%|매수 대기/;
const card = (o) => Object.assign({ market: 'KR', headline: '지금이 저점, 반드시 사야 할 기회', reasons: ['r'], risks: ['k'], sources: [] }, o);
const CARDS = [
  card({ ticker: 'SYNA', name: '합성A', verdict: 'buy-review', rank: 1 }),
  card({ ticker: 'SYNB', name: '합성B', verdict: 'add-review', rank: 2 }),
  card({ ticker: 'SYNC', name: '합성C', verdict: 'hold-long' }),
  card({ ticker: 'SYND', name: '합성D', verdict: 'buy-review', market: 'US', rank: 3 }),
  card({ ticker: 'SYNE', name: '합성E', verdict: 'wait', headline: '관망' }),
  card({ ticker: 'SYNF', name: '합성F', verdict: 'trim-review', headline: '비중 축소 검토' })
];
const doc = (cards) => ({ v: 1, reviewedAt: '2026-11-25T07:00:00+09:00', reviewer: 'Claude', notice: '투자 자문이 아닙니다.', cards: JSON.parse(JSON.stringify(cards)) });
function setup(stage, cards, holdCards) {
  const dom = new JSDOM('<!doctype html><body><div id="hasBriefStrip"><div class="hdb-head">머리줄</div></div><section id="m"></section></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = (u) => {
    if (/holdings/.test(u)) return Promise.resolve({ ok: !!holdCards, json: () => Promise.resolve(holdCards ? doc(holdCards) : null) });
    if (/fear-us/.test(u)) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(doc(cards)) });
  };
  w.eval(GATE); // 실제 STAGE·describe 계약
  const real = w.HASChartGate;
  // 실제 describe를 쓰되 캐시만 합성 단계로 채운다(조회 없음).
  w.HASChartGate = Object.assign({}, real, { cached: () => ({ stage, asOf: '2026-11-24', price: 100, ma20: 95, ma60: 90, slope20: 1, slope60: 1, higherLow: true }), fresh: () => true, load: () => Promise.resolve() });
  w.eval(SRC);
  return { w, real };
}
const tick = () => new Promise(r => setTimeout(r, 20));

for (const stage of ['falling', 'basing', 'stage2', 'stage3', 'unknown']) {
  test('CR-A1: ' + stage + ' — 실제 describe 문구에 행동 안내가 있어도 카드에는 중립 단계명·#333만', async () => {
    const { w, real } = setup(stage, CARDS);
    if (stage === 'basing') a.match(real.describe({ stage }).label, /정찰병/); // 계약 확인: 원래 문구엔 행동 안내가 있다
    w.HASReviewCards.mount(w.document.getElementById('m')); await tick(); await tick();
    const gates = [...w.document.querySelectorAll('[data-testid=review-gate]')];
    a.equal(gates.length, 4); // buy·add·hold-long(국내) + buy(미국 시장값) — wait·trim은 관문 없음
    for (const g of gates) { a.doesNotMatch(g.textContent, ACTION); a.match(g.textContent, /타이밍 참고\(판단 보류\)/); a.equal(g.style.color, 'rgb(51, 51, 51)'); }
    const t = w.document.getElementById('m').textContent;
    a.doesNotMatch(t, /정찰병|30% 더|예외 정찰/);
    if (stage !== 'unknown') a.match(t, /2026-11-24 종가 기준/); // 차트 숫자 참고는 남김
  });
}
test('CR-A1: 다시 확인(재렌더) 후에도 중립 문구 유지, 빈 목록·관문 없는 목록은 관문 줄 없음', async () => {
  const { w } = setup('stage3', CARDS); const m = w.document.getElementById('m');
  w.HASReviewCards.mount(m); await tick(); m.querySelector('button').click(); await tick(); await tick();
  a.doesNotMatch(m.textContent, /3차|30% 더/);
  const e = setup('stage3', [card({ ticker: 'SYNE', name: '합성E', verdict: 'wait' })]); e.w.HASReviewCards.mount(e.w.document.getElementById('m')); await tick(); await tick();
  a.equal(e.w.document.querySelectorAll('[data-testid=review-gate]').length, 0);
});
test('CR-A2: 매수 쪽 카드의 단정적 헤드라인은 원문 인용·매수 권유 아님으로 구분, 다른 판단은 그대로', async () => {
  const { w } = setup('basing', CARDS); w.HASReviewCards.mount(w.document.getElementById('m')); await tick(); await tick();
  const hs = [...w.document.querySelectorAll('[data-testid=review-headline]')];
  const buyH = hs.filter(h => /매수 권유 아님/.test(h.textContent)); a.equal(buyH.length, 3); // buy·add·buy(미국)
  for (const h of buyH) a.match(h.textContent, /^📝 클로 조사 의견\(원문 인용 · 매수 권유 아님\): 지금이 저점, 반드시 사야 할 기회$/);
  // CR-B3: 합의 기록 없는 비매수 카드도 원문 인용·합의 전 참고로 구분
  a.equal(hs.filter(h => h.textContent === '📝 클로 조사 의견(원문 인용 · 합의 전 참고): 지금이 저점, 반드시 사야 할 기회').length, 1);
  a.ok(hs.some(h => /합의 전 참고\): 관망$/.test(h.textContent))); a.ok(hs.some(h => /합의 전 참고\): 비중 축소 검토$/.test(h.textContent)));
});
test('CR-A2: 보유 현황 띠 — 추가 매수 후보 건수 숨김, 다른 판단 건수 유지', async () => {
  const hold = [card({ ticker: 'H1', name: 'h1', verdict: 'add-review' }), card({ ticker: 'H2', name: 'h2', verdict: 'add-review' }), card({ ticker: 'H3', name: 'h3', verdict: 'hold-long' }), card({ ticker: 'H4', name: 'h4', verdict: 'trim-review' })];
  const { w } = setup('basing', CARDS, hold); w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick(); await tick();
  const b = w.document.querySelector('[data-testid=hdb-ai-hold]'); a.ok(b);
  a.doesNotMatch(b.textContent, /추가 매수 후보|매수 검토 \d|후보\(판단 보류\) \d/);
  a.match(b.textContent, /매수 쪽 판단 보류/); a.match(b.textContent, /클로 단독 의견 2/); a.doesNotMatch(b.textContent, /장기보유|비중 축소/); // CR-B3: 합의 전 판단은 상태 건수로만
  const only = setup('basing', CARDS, [card({ ticker: 'H3', name: 'h3', verdict: 'hold-long' })]); only.w.document.dispatchEvent(new only.w.Event('DOMContentLoaded')); await tick(); await tick();
  a.doesNotMatch(only.w.document.querySelector('[data-testid=hdb-ai-hold]').textContent, /매수 쪽 판단 보류/);
});
