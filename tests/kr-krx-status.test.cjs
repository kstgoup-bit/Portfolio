'use strict';
/* 12단계 A2: 73개 후보 4상태 체계. 합성 응답만 사용 — 통과가 공식 검증을 뜻하지 않는다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const K = require('../kr-radar/krx-api.js'), ST = require('../kr-radar/krx-status.js'), RUN = require('../kr-radar/krx-run.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
const stocks = data.securities.filter(s => s.group !== 'etf'), etfs = data.securities.filter(s => s.group === 'etf');
const T = '2026-10-29', SHA = 'e'.repeat(64);
const isinOf = code => { const body = 'KR7' + code + '00'; const d = [...body].map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join(''); for (let k = 0; k < 10; k++) { const s = d + k; let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let n = s.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; } if (sum % 10 === 0) return body + k; } };
const item = (s, o = {}) => ({ basDt: '20261028', srtnCd: 'A' + s.code, isinCd: isinOf(s.code), mrktCtg: s.market, itmsNm: s.name, ...o });
const xml = items => `<response><header><resultCode>00</resultCode><resultMsg>x</resultMsg></header><body><numOfRows>${Math.max(items.length, 1)}</numOfRows><pageNo>1</pageNo><totalCount>${items.length}</totalCount><items>${items.map(i => '<item>' + Object.entries(i).map(([k, v]) => `<${k}>${v}</${k}>`).join('') + '</item>').join('')}</items></body></response>`;
const listing = (items, origin) => { const p = K.parseResponse(xml(items), { origin, responseSha256: SHA }); return { ...p, baseDate: p.rows[0] && p.rows[0].baseDate }; };
const states = (items, origin = 'user-supplied-official', o = {}) => ST.toStates(K.compareCandidates(data, listing(items, origin), { today: T, ...o }));
const sum = b => b.VERIFIED + b.MISMATCH + b.PENDING + b.EXCLUDED;

test('no response at all: 73 stocks PENDING, 5 ETF PENDING, VERIFIED 0, price-checked 0, active 0', () => {
  const r = ST.toStates(K.compareCandidates(data, null, { today: T }));
  a.deepEqual(r.totals.stock, { VERIFIED: 0, MISMATCH: 0, PENDING: 73, EXCLUDED: 0, total: 73 }); a.deepEqual(r.totals.etf, { VERIFIED: 0, MISMATCH: 0, PENDING: 5, EXCLUDED: 0, total: 5 });
  a.equal(r.totals.preferred.total, 0); a.equal(r.realPriceVerifiedCount, 0); a.equal(r.actualActiveMonitoredCount, 0); a.ok(r.entries.every(e => e.signalsEnabled === false && e.decision === 'HOLD' && e.priceStatus === 'DATA_UNAVAILABLE'));
});
test('four states are derived only from evidence: exact=VERIFIED, wrong name/market/ISIN=MISMATCH, absent=PENDING, confirmed exclusion=EXCLUDED', () => {
  const d = JSON.parse(JSON.stringify(data)); d.securities[3].isin = 'KR7000000000'; // 후보가 ISIN 을 기록한 경우
  const items = [item(stocks[0]), item(stocks[1], { itmsNm: stocks[1].name + 'X' }), item(stocks[2], { mrktCtg: stocks[2].market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI' }), item(stocks[4])];
  const cmp = K.compareCandidates(d, listing(items, 'user-supplied-official'), { today: T, exclusions: [{ code: stocks[5].code, reason: '상장폐지 공시 확인', confirmedBy: '순태', confirmedAt: T }] }), r = ST.toStates(cmp), by = c => r.entries.find(e => e.code === c);
  a.equal(by(stocks[0].code).state, 'VERIFIED'); a.equal(by(stocks[1].code).state, 'MISMATCH'); a.equal(by(stocks[2].code).state, 'MISMATCH'); a.equal(by(stocks[3].code).state, 'PENDING'); a.equal(by(stocks[5].code).state, 'EXCLUDED');
  a.match(by(stocks[1].code).note, /개명\/기업행위를 확인할 수 없음/); a.equal(sum(r.totals.stock), 73);
  a.equal(by(stocks[0].code).evidenceHash, SHA); a.equal(by(stocks[1].code).evidenceHash, null);
});
test('ISIN recorded on a candidate that differs from the response is MISMATCH', () => {
  const d = JSON.parse(JSON.stringify(data)); d.securities[0].isin = isinOf('ZZ0001');
  const r = ST.toStates(K.compareCandidates(d, listing([item(stocks[0])], 'user-supplied-official'), { today: T })); a.equal(r.entries[0].state, 'MISMATCH'); a.equal(r.entries[0].rule, 'isin-mismatch');
});
test('fixture/example responses leave everything PENDING (never VERIFIED)', () => {
  const r = states(stocks.slice(0, 10).map(s => item(s)), 'fixture'); a.equal(r.totals.stock.VERIFIED, 0); a.equal(r.totals.stock.PENDING, 73); a.ok(r.entries.filter(e => /fixture-only/.test(e.rule)).length === 10);
});
test('evidence completeness: a VERIFIED needs base date and a 64-hex response hash, otherwise PENDING', () => {
  const l = listing([item(stocks[0])], 'user-supplied-official'); l.responseSha256 = null;
  const r = ST.toStates(K.compareCandidates(data, l, { today: T })); a.equal(r.totals.stock.VERIFIED, 0);
  a.equal(ST.stateOf({ status: 'verified', baseDate: null, responseSha256Present: true })[0], 'PENDING'); a.equal(ST.stateOf({ status: 'verified', baseDate: '2026-10-28', responseSha256Present: false })[1], 'verified-evidence-incomplete');
});
test('preferred shares are counted separately and never VERIFIED; ETF separate and not in the 73', () => {
  const d = JSON.parse(JSON.stringify(data)); d.securities.push({ ...stocks[0], code: 'ZZ9101', name: '합성전자우', group: 'stock' });
  const r = ST.toStates(K.compareCandidates(d, listing([item(stocks[0]), item({ code: 'ZZ9101', market: 'KOSPI', name: '합성전자우' }), item(etfs[0])], 'user-supplied-official'), { today: T }));
  a.equal(r.totals.preferred.total, 1); a.equal(r.totals.preferred.VERIFIED, 0); a.equal(r.totals.stock.total, 73); a.equal(r.totals.etf.total, 5);
});
test('stale / future / date-mismatched responses block all states to PENDING', () => {
  for (const [bd, o] of [['20261001', {}], ['20271231', {}], ['20261028', { expectedBaseDate: '2026-10-27' }]]) { const r = states(stocks.slice(0, 5).map(s => item(s, { basDt: bd })), 'user-supplied-official', o); a.equal(r.totals.stock.VERIFIED, 0, bd); }
});
test('signal gate: unverified or price-unverified instruments can never open buy/sell signals; policy blocks even a verified one', () => {
  for (const e of [null, { state: 'PENDING', priceVerified: false }, { state: 'MISMATCH', priceVerified: true }, { state: 'EXCLUDED' }]) { const g = ST.signalGate(e); a.equal(g.allowed, false); a.equal(g.decision, 'HOLD'); }
  const g = ST.signalGate({ state: 'VERIFIED', priceVerified: true }); a.equal(g.allowed, false); a.ok(g.reasons.some(x => /별도 명시 승인/.test(x)));
});
test('verified count is a different number from real-price-verified and active-monitored (both stay 0)', () => {
  const r = states(stocks.slice(0, 20).map(s => item(s))); a.equal(r.totals.stock.VERIFIED, 20); a.equal(r.realPriceVerifiedCount, 0); a.equal(r.actualActiveMonitoredCount, 0); a.match(r.note, /별개/);
});
test('a candidate list change cannot sneak in: the 73/5 universe is pinned', () => { a.equal(stocks.length, 73); a.equal(etfs.length, 5); a.equal(data.securities.length, 78); a.equal(RUN.VERIFIER_VERSION.startsWith('krx-verify-'), true); });
test('name-hint regression: 메리츠금융지주 is a common stock, real REIT names are still suspected', () => {
  const L = require('../kr-radar/listing.js'); a.equal(L.classifyByName('메리츠금융지주'), 'common-presumed'); a.equal(L.classifyByName('메리츠화재'), 'common-presumed');
  a.equal(L.classifyByName('신한알파리츠'), 'reit-suspected'); a.equal(L.classifyByName('ESR켄달스퀘어리츠'), 'reit-suspected'); a.equal(L.classifyByName('가상 REIT'), 'reit-suspected');
  const m = stocks.find(s => s.name === '메리츠금융지주'); if (m) { const r = states([item(m)]); a.equal(r.entries.find(e => e.code === m.code).state, 'VERIFIED'); }
});
