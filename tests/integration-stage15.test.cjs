'use strict';
/* 15단계 통합·보호 시험: 기존 투자기록·백업 형식·운영 파일이 바뀌지 않았고, 새 모듈이 기존 기록을 읽기만 한다는 것을 확인한다. (합성 자료) */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..'), P = require('../backup/core.js'), L = require('../invest/ledger.js'), R = require('../invest/risk.js');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const PROTECTED = { // 14단계 기준 커밋(39be6e06)의 값. 15단계는 이 파일들을 바꾸지 않는다.
  'portfolio_v5.html': 'b16656a6525d9127fe3a3fb4d3ad19c8717afc58fb0fe256feb503692913ebd5', 'portfolio.html': '97235e2a02feeec84511d9b4caf4c548e47ba37eb229625438acbc15427bfa2d',
  'service-worker.js': '77d553efcfc3eb93f65a1f2901de1cf3b6b61b36febd9605053e66db6724dcd8', 'manifest.json': '79f5292b2c95dba718b453194b255f02d16a1585677b559735b9fad52f16d878', 'backup/core.js': '8a455cdc0606cce844fbb8d40551c9435d42c49b5d1bceafc8455c11a6e0eb3f' };
class Store { constructor(o) { this.m = new Map(Object.entries(o)); this.writes = 0; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.writes++; this.m.set(k, String(v)); } removeItem(k) { this.writes++; this.m.delete(k); } key(i) { return [...this.m.keys()][i] ?? null; } get length() { return this.m.size; } snapshot() { return JSON.stringify([...this.m.entries()].sort()); } }
const stock = (id, ticker, name, q, avg, cur) => ({ id, ticker, name, quantity: q, avgPrice: avg, currentPrice: cur });
const mkStore = () => new Store({ v5_gen: JSON.stringify([stock(1, 'AAA', '합성전자', 10, 100, 150)]), v5_dom: JSON.stringify([stock(2, 'BBB', '합성화학', 5, 200, 180)]), v5_ov: JSON.stringify([stock(3, 'USX', '합성미국', 2, 90, 100)]), v5_pen: '[]', v5_userThemeMap: JSON.stringify({ AAA: '반도체' }) });

test('운영 파일·백업 코드는 14단계 기준과 바이트 단위로 동일', () => { for (const [f, h] of Object.entries(PROTECTED)) a.equal(require('./lib/has-rename.cjs').legacySha(f), h, f); });
test('백업 형식 v6 상수 유지, 새 투자기록 키는 백업 허용 목록에 없음(백업 스키마 무변경)', () => {
  a.equal(P.FORMAT, 'kst-portfolio-backup'); a.equal(P.VERSION, 6); for (const k of ['kst-trade-log', 'kst-thesis-log', 'kst.trades', 'kst.theses', 'v5_trades', 'v5_theses']) a.equal(P.allowed(k), false, k);
});
test('백업 생성 → 파싱 → 위험·손익 모듈: 저장소는 읽기만 하고 한 번도 쓰지 않음', () => {
  const store = mkStore(), before = store.snapshot(), env = P.create(store), text = JSON.stringify(env), textBefore = text.slice();
  const parsed = P.parse(text); a.equal(text, textBefore);
  const h = R.holdingsFromStorage(parsed.values, { fxUsd: 1400 }); a.equal(h.holdings.length, 3);
  const res = R.analyze(h.holdings, { themeMap: { AAA: '반도체' } }); a.equal(res.ok, true); a.equal(res.complete, true); a.equal(res.totalKRW, 10 * 150 + 5 * 180 + 2 * 100 * 1400);
  const app = ['gen', 'dom', 'ov', 'pen'].flatMap(acc => L.fromAppHoldings(JSON.parse(parsed.values['v5_' + acc] || '[]'), acc, { fxUsd: 1400 }).rows); a.equal(app.length, 3); a.ok(app.every(r => r.realizedKRW === null));
  a.equal(store.writes, 0); a.equal(store.snapshot(), before);
  a.deepEqual(P.parse(JSON.stringify(P.create(store))).values, parsed.values);   // 왕복 동일
});
test('거래기록 가져오기/내보내기: 원본 입력 무변경, 누락·중복 없음, 병합 충돌은 덮어쓰지 않음', () => {
  const trades = require('./fixtures/ledger-cases.cjs').flatMap((c, i) => c.trades.map(t => ({ ...t, id: `c${i}-${t.id}` })));
  const csv = L.exportTradeCsv(trades), json = L.exportTradeJson(trades), p1 = L.parseTradeCsv(csv), p2 = L.parseTradeJson(json);
  a.equal(p1.ok, true); a.equal(p2.ok, true); a.equal(p1.trades.length, trades.length); a.equal(new Set(p1.trades.map(t => t.id)).size, trades.length); a.equal(L.exportTradeCsv(p1.trades), csv); a.equal(L.exportTradeJson(p2.trades), json);
  const again = L.mergeTrades(p1.trades, p1.trades); a.equal(again.added.length, 0); a.equal(again.duplicates.length, trades.length); a.equal(again.conflicts.length, 0);
  const changed = p1.trades.map((t, i) => (i === 0 ? { ...t, price: (t.price || 1) + 1 } : t)); const m = L.mergeTrades(p1.trades, changed); a.equal(m.conflicts.length, 1); a.equal(m.merged.length, trades.length); a.deepEqual(m.merged.find(t => t.id === p1.trades[0].id), p1.trades[0]);
});
test('가격 공급자 비활성/네트워크 없음: 새 모듈은 전부 순수 계산(전역 fetch가 있어도 호출하지 않음)', () => {
  const calls = []; const saved = globalThis.fetch; globalThis.fetch = (...x) => { calls.push(x); throw new Error('network'); };
  try { const B = require('../invest/backtest.js'); const bars = B.makeSynthetic({ seed: 1, n: 600 }); B.run({ bars, meta: { isSynthetic: true, source: 's' } }); L.compute([]); R.analyze([]); } finally { globalThis.fetch = saved; }
  a.deepEqual(calls, []);
});
test('모든 새 모듈과 실험실 UI 코드에 비밀 정보·실제 주소 없음', () => {
  const files = ['invest/format.js', 'invest/ledger.js', 'invest/risk.js', 'invest/backtest.js', 'mobile-lab/invest.js', 'mobile-lab/invest.html'];
  for (const f of files) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); a.doesNotMatch(s, /api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]|https?:\/\/(?!www\.w3)/i, f); }
});
