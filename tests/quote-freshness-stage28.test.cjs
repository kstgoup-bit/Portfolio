'use strict';
/* 28단계: GAS 시세 갱신 시각 표시 — 읽기 전용, 미검증 유지, 의견 규칙 불변 */
const test = require('node:test'), a = require('node:assert/strict'), R = require('../has/portfolio-reader.js'), B = require('../has/briefing-model.js');
const S = (id, t, q, avg, cur) => ({ id, name: t, ticker: t, quantity: q, avgPrice: avg, currentPrice: cur });
const src = o => k => (k in o ? (typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k])) : null);
const T = Date.parse('2026-11-06T00:05:00Z'), base = () => ({ v5_fx: '1400', v5_cma_amount: '1000000', v5_gen: [S(1, 'AAA', 10, 100, 120), S(9, 'DEP_GEN', 1, 1, 100000)], v5_dom: [S(2, 'BBB', 5, 100, 100)], v5_ov: [S(3, 'USX', 2, 10, 12)], v5_pen: [] });
const NOW = '2026-11-06T00:10:00Z', risk = (d) => { const p = R.read(src(d), { basis: 'real', asOf: NOW }), b = B.build(p, { advices: [], portfolioSignals: [], portfolioMissing: [] }, NOW); return { p, b }; };
test('갱신 기록이 없으면 전부 저장값으로 표시', () => { const { p, b } = risk(base()); a.ok(/이번 접속에서 갱신되지 않은 저장값/.test(JSON.stringify(b.risks))); a.equal(p.priceFreshness.fresh, 0); a.equal(p.priceFreshness.total, 3); a.deepEqual([...p.priceFreshness.staleTickers], ['AAA', 'BBB', 'USX']); a.equal(p.priceFreshness.verification, 'unverified'); a.equal(p.priceBasis, 'app-entered-unverified'); });
test('전부 갱신: 시각(KST)·GAS·미검증·대조불가를 문구에 표시', () => {
  const d = base(); d.v5_quote_meta = { 'KR:BBB': T, 'KR:AAA': T, 'US:USX': T + 60000, FX: T + 1000 }; d.v5_gen[0]; // AAA 는 gen(KR)
  const { p, b } = risk(d); a.equal(p.priceFreshness.fresh, 3); a.equal(p.priceFreshness.newestAt, new Date(T + 60000).toISOString()); a.ok(p.priceFreshness.fxAt);
  const text = JSON.stringify(b.risks);
  a.ok(/구글 시트\(GAS\)로 갱신\(09:05~09:06 KST\)/.test(text), text.slice(0, 400)); a.ok(/독립 대조 불가/.test(text)); a.ok(/환율은 이번 접속 갱신/.test(text));
});
test('일부만 갱신: 갱신 안 된 종목을 이름으로 알림', () => { const d = base(); d.v5_quote_meta = { 'KR:AAA': T }; const { p, b } = risk(d); a.equal(p.priceFreshness.fresh, 1); a.deepEqual([...p.priceFreshness.staleTickers], ['BBB', 'USX']); a.ok(/3종목 중 1종목만 이번 접속에서 갱신.*BBB·USX/.test(JSON.stringify(b.risks))); });
test('비정상 메타(문자·음수·배열·깨진 JSON)는 무시하고 저장값 처리', () => { for (const m of ['not json', '[1,2]', '{"KR:AAA":"x"}', '{"KR:AAA":-5}', '{"KR:AAA":1e999}', 'null']) { const d = base(); d.v5_quote_meta = m; const { p } = risk(d); a.equal(p.priceFreshness.fresh, 0, m); } });
test('시세 시각이 있어도 가격은 미검증 — 입력 자료를 바꾸지 않고 요청 키 1개 추가뿐', () => {
  const d = base(); d.v5_quote_meta = { 'KR:AAA': T }; const before = JSON.stringify(d), asked = new Set(); R.read(k => { asked.add(k); return src(d)(k); }); a.equal(JSON.stringify(d), before); a.ok(asked.has('v5_quote_meta'));
});
