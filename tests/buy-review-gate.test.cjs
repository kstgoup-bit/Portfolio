'use strict';
/* GPT-20261121-0911 곡소리 매수 검토 게이트 — 합성 자료만. 네트워크·저장소·실제 기록 없음. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../has/buy-review-gate.js');
const F = require('../has/buy-review-fixtures.js');
const CA = require('../has/capital-allocation.js');
const NOW = F.NOW, S = G.STATES;
const run = over => G.evaluate(F.base(over), NOW);
const gateOf = (r, id) => r.gates.find(g => g.id === id);

test('정상: 5게이트 PASS + 가격 증거 + 4단계 조사 + 안전마진 25% → 조건부 분할매수 검토', () => {
  const r = run();
  assert.equal(r.state, S.CONDITIONAL); assert.equal(r.buyReview, true);
  assert.equal(r.price.status, 'fear'); assert.equal(r.price.band, 35); assert.equal(r.price.drawdownPct, 40); assert.equal(r.price.relativePp, -25);
  assert.equal(r.valuation.marginPct, 25); assert.equal(r.valuation.band, 'conditional'); assert.equal(r.valuation.policy, 'unverified-initial-policy');
  assert.equal(r.valuation.assumptions.length, 3);
  assert.ok(r.counterArguments.length && r.invalidation.length);
  assert.equal(r.executability.quantity, null); assert.equal(r.executability.order, null);
  assert.match(r.disclaimer, /최종 결정은 순태씨/);
});
test('안전마진 30~40% → 높은 확신(보장 아님 문구), 40% 이상은 가치함정 재검증 전 판단 보류', () => {
  const hi = run(d => { d.price.close = 52; });
  assert.equal(hi.valuation.marginPct, 35); assert.equal(hi.state, S.HIGH); assert.match(hi.disclaimer, /수익 보장이 아닙니다/);
  const trap = run(d => { d.price.close = 40; });
  assert.equal(trap.valuation.band, 'value-trap-check'); assert.equal(trap.state, S.HOLD); assert.equal(gateOf(trap, 'D').status, 'UNKNOWN');
  const checked = run(d => { d.price.close = 40; d.valueTrapReview = { status: 'PASS', evidence: F.ev('가치함정 재검증(합성)') }; });
  assert.equal(checked.state, S.HIGH);
  const low = run(d => { d.price.close = 68; });
  assert.equal(low.valuation.marginPct, 15); assert.equal(gateOf(low, 'D').status, 'FAIL'); assert.equal(low.state, S.OBSERVE);
});
test('가격 하락률은 안전마진이 아니다: 본질가치 없으면 하락 50%여도 판단 보류', () => {
  const r = run(d => { d.price.close = 50; delete d.valuation; });
  assert.equal(r.price.drawdownPct, 50); assert.equal(r.valuation.status, 'not-computed'); assert.equal(r.valuation.marginPct, null);
  assert.equal(r.state, S.HOLD); assert.equal(r.buyReview, false);
  const fake = run(d => { d.valuation.fromDrawdown = true; });
  assert.equal(fake.state, S.HOLD);
});
test('누락·충돌·오래된 가격 자료 → fail-closed 판단 보류', () => {
  const cases = {
    missingSource: d => { delete d.price.source; },
    crossMismatch: d => { d.price.crossCheck = { status: 'mismatch', diffPct: 3, sources: ['a', 'b'] }; },
    crossMissing: d => { delete d.price.crossCheck; },
    stale: d => { d.price.asOf = '2026-11-10'; d.price.high52wAsOf = '2026-11-10'; d.price.benchmark.period.end = '2026-11-10'; },
    intraday: d => { d.price.priceType = 'intraday'; },
    currency: d => { d.price.currency = 'KRW'; },
    adjustment: d => { d.price.adjustment = 'unknown'; },
    benchmark: d => { delete d.price.benchmark; },
    benchPeriod: d => { d.price.benchmark.period.end = '2026-11-19'; },
    highDate: d => { d.price.high52wAsOf = '2026-11-19'; },
    future: d => { d.price.asOf = '2026-11-25'; d.price.high52wAsOf = '2026-11-25'; d.price.benchmark.period.end = '2026-11-25'; }
  };
  for (const [name, f] of Object.entries(cases)) {
    const r = run(f);
    assert.equal(r.price.status, 'fail-closed', name); assert.equal(r.state, S.HOLD, name); assert.equal(r.buyReview, false, name);
  }
});
test('가격 구간 -20/-30/-35 및 -20% 미만은 관찰', () => {
  assert.equal(run(d => { d.price.close = 78; d.valuation.scenarios.conservative.valuePerShare = 100; d.valuation.scenarios.base.valuePerShare = 110; }).price.band, 20);
  assert.equal(run(d => { d.price.close = 68; }).price.band, 30);
  const nf = run(d => { d.price.close = 85; });
  assert.equal(nf.price.status, 'not-fear'); assert.equal(nf.state, S.OBSERVE);
});
test('게이트 UNKNOWN / 증거 미검증·오래됨 → 매수 검토 금지', () => {
  for (const id of ['A', 'B', 'C', 'E']) {
    const r = run(d => { d.gates[id] = { status: 'UNKNOWN' }; });
    assert.equal(r.state, S.HOLD, id);
  }
  const unv = run(d => { d.gates.A.evidence[0].verification = 'self-reported'; });
  assert.equal(gateOf(unv, 'A').status, 'UNKNOWN'); assert.equal(unv.state, S.HOLD);
  const old = run(d => { d.gates.C.evidence[0].asOf = '2026-01-01'; });
  assert.equal(old.state, S.HOLD);
  const failA = run(d => { d.gates.A.status = 'FAIL'; });
  assert.equal(failA.state, S.OBSERVE);
});
test('부채·회계·구조 위험 → 위험 경고', () => {
  assert.equal(run(d => { d.riskFlags.liquidity = true; }).state, S.RISK);
  assert.equal(run(d => { d.riskFlags.accounting = true; }).state, S.RISK);
  assert.equal(run(d => { d.riskFlags.structural = true; }).state, S.RISK);
  assert.equal(run(d => { d.gates.B.status = 'FAIL'; }).state, S.RISK);
});
test('일회성 이익: 정상화 근거 없으면 C·D 미확인 → 판단 보류, 근거 있으면 진행', () => {
  const r = run(d => { d.earningsFlags = ['자산매각 차익(합성)']; });
  assert.equal(r.state, S.HOLD); assert.equal(r.valuation.status, 'not-computed');
  const ok = run(d => { d.earningsFlags = ['자산매각 차익(합성)']; d.valuation.normalizationReason = '매각차익 제외(합성)'; });
  assert.equal(ok.state, S.CONDITIONAL);
});
test('본질가치 시나리오·가정 누락, 순서 오류, 통화 불일치 → 안전마진 미산정', () => {
  assert.equal(run(d => { delete d.valuation.scenarios.optimistic; }).valuation.status, 'not-computed');
  assert.equal(run(d => { delete d.valuation.scenarios.base.stockCompensation; }).valuation.status, 'not-computed');
  assert.equal(run(d => { d.valuation.scenarios.conservative.valuePerShare = 120; }).valuation.status, 'not-computed');
  assert.equal(run(d => { d.valuation.currency = 'KRW'; }).valuation.status, 'not-computed');
  assert.equal(run(d => { d.valuation.verification = 'unverified'; }).state, S.HOLD);
});
test('4단계 조사·반론·무효화 조건 없으면 판단 보류, E PASS도 반론 없으면 미확인', () => {
  for (const k of ['filings', 'news', 'consensus', 'community']) assert.equal(run(d => { delete d.research[k]; }).state, S.HOLD, k);
  assert.equal(run(d => { d.research.news.asOf = '2026-09-01'; }).state, S.HOLD);
  const nc = run(d => { d.counterArguments = []; });
  assert.equal(gateOf(nc, 'E').status, 'UNKNOWN'); assert.equal(nc.state, S.HOLD);
  assert.equal(run(d => { d.invalidation = []; }).state, S.HOLD);
});
test('실행 가능성은 투자 판단과 분리: 현금 부족/미확인·상한 초과·업종 중복·비상현금 미확정', () => {
  const nocash = run(d => { d.context.cash = { status: 'unknown' }; });
  assert.equal(nocash.state, S.CONDITIONAL); assert.equal(nocash.executability.status, 'blocked');
  assert.match(nocash.executability.items.find(x => x.id === 'cash').note, /수량·주문 제안 없음/);
  const short = run(d => { d.context.cash.amount = 500000; });
  assert.equal(short.executability.items.find(x => x.id === 'emergency').status, 'blocked');
  const cap = run(d => { d.context.weightPct = 10; });
  assert.equal(cap.executability.items.find(x => x.id === 'cap').status, 'blocked');
  const conv = run(d => { d.context.weightPct = 10; d.context.conviction = true; });
  assert.equal(conv.executability.cap, 25); assert.equal(conv.executability.items.find(x => x.id === 'cap').status, 'ok');
  const sec = run(d => { d.context.sameSectorHoldings = ['SYN-B']; d.context.sectorWeightPct = 30; });
  assert.equal(sec.executability.items.find(x => x.id === 'sector').status, 'warn');
  const floor = run(d => { d.context.emergencyFloor = { status: 'unset' }; });
  assert.equal(floor.executability.status, 'unconfirmed');
  assert.equal(G.LIMIT_CONVICTION, CA.LIMIT_CONVICTION); assert.equal(G.LIMIT_OTHER, CA.LIMIT_OTHER);
  for (const r of [nocash, short, cap, conv, sec, floor]) { assert.equal(r.executability.quantity, null); assert.equal(r.executability.order, null); }
});
test('오늘의 후보 최대 5개·상태→안전마진 순, 매수 검토 아닌 종목 제외', () => {
  const rs = [];
  for (let i = 0; i < 8; i++) rs.push(run(d => { d.ticker = 'SYN-' + i; d.price.close = 50 + i * 2; }));
  rs.push(run(d => { d.ticker = 'SYN-H'; delete d.valuation; }));
  const s = G.shortlist(rs);
  assert.equal(s.length, 5); assert.ok(s.every(r => r.buyReview));
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].state === s[i].state ? s[i - 1].valuation.marginPct >= s[i].valuation.marginPct : true);
  assert.equal(s[0].state, S.HIGH);
});
test('중복 알림 금지: 같은 종목·같은 상태는 다시 알리지 않고, 상승·재진입만 알림, 후보 없음이면 알림 없음', () => {
  const a = run(); const p1 = G.notifyPlan([a], {});
  assert.equal(p1.notify, true); assert.equal(p1.items.length, 1);
  const p2 = G.notifyPlan([run()], p1.ledger);
  assert.equal(p2.notify, false); assert.equal(p2.items.length, 0);
  const up = G.notifyPlan([run(d => { d.price.close = 52; })], p2.ledger);
  assert.equal(up.notify, true); assert.equal(up.items[0].previousState, S.CONDITIONAL);
  const down = G.notifyPlan([run(d => { delete d.valuation; })], up.ledger);
  assert.equal(down.notify, false); assert.equal(down.ledger['US:SYN-A'].state, S.HOLD);
  const back = G.notifyPlan([run()], down.ledger);
  assert.equal(back.notify, true);
  assert.equal(G.notifyPlan([], {}).notify, false);
  assert.equal(G.notifyPlan([run(d => { delete d.valuation; })], {}).notify, false);
});
test('입력 불변·계약 오류·판정 시각 오류는 판단 보류', () => {
  const d = F.base(), copy = JSON.stringify(d);
  G.evaluate(d, NOW); assert.equal(JSON.stringify(d), copy);
  assert.equal(G.evaluate(Object.assign(F.base(), { contract: 'x' }), NOW).state, S.HOLD);
  assert.equal(G.evaluate(F.base(), '2026-11-20').state, S.HOLD);
  assert.equal(G.evaluate(null, NOW).state, S.HOLD);
  assert.equal(G.evaluate(F.base(d => { d.market = 'JP'; }), NOW).state, S.HOLD);
});
test('정적 안전: 엔진·실험실은 네트워크·저장소·주문 코드 없음, 운영 앱 미연결', () => {
  for (const f of ['buy-review-gate.js', 'buy-review-fixtures.js', 'buy-review-lab.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../has', f), 'utf8');
    assert.doesNotMatch(src, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|sendBeacon)\b/, f);
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/, f);
  }
  const html = fs.readFileSync(path.join(__dirname, '../has/buy-review-lab.html'), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['buy-review-gate.js', 'buy-review-fixtures.js', 'buy-review-lab.js']);
  const app = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
  assert.doesNotMatch(app, /buy-review-gate|HASBuyReviewGate/);
});
