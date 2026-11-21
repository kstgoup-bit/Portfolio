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
// 종가를 바꾸면 교차검증 원시 시세도 같이 바꾼다(합성).
const setClose = (d, c) => { d.price.close = c; d.price.crossCheck.quotes.forEach(q => { q.close = c; }); };

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
  const hi = run(d => { setClose(d, 52); });
  assert.equal(hi.valuation.marginPct, 35); assert.equal(hi.state, S.HIGH); assert.match(hi.disclaimer, /수익 보장이 아닙니다/);
  const trap = run(d => { setClose(d, 40); });
  assert.equal(trap.valuation.band, 'value-trap-check'); assert.equal(trap.state, S.HOLD); assert.equal(gateOf(trap, 'D').status, 'UNKNOWN');
  const checked = run(d => { setClose(d, 40); d.valueTrapReview = { status: 'PASS', evidence: F.ev('가치함정 재검증(합성)') }; });
  assert.equal(checked.state, S.HIGH);
  const low = run(d => { setClose(d, 68); });
  assert.equal(low.valuation.marginPct, 15); assert.equal(gateOf(low, 'D').status, 'FAIL'); assert.equal(low.state, S.OBSERVE);
});
test('가격 하락률은 안전마진이 아니다: 본질가치 없으면 하락 50%여도 판단 보류', () => {
  const r = run(d => { setClose(d, 50); delete d.valuation; });
  assert.equal(r.price.drawdownPct, 50); assert.equal(r.valuation.status, 'not-computed'); assert.equal(r.valuation.marginPct, null);
  assert.equal(r.state, S.HOLD); assert.equal(r.buyReview, false);
  const fake = run(d => { d.valuation.fromDrawdown = true; });
  assert.equal(fake.state, S.HOLD);
});
test('누락·충돌·오래된 가격 자료 → fail-closed 판단 보류', () => {
  const cases = {
    missingSource: d => { delete d.price.source; },
    crossMismatch: d => { d.price.crossCheck.quotes[1].close = 62; },
    crossMissing: d => { delete d.price.crossCheck; },
    stale: d => { d.price.asOf = '2026-11-10'; d.price.high52wAsOf = '2026-11-10'; d.price.benchmark.period.end = '2026-11-10'; d.price.crossCheck.quotes.forEach(q => { q.asOf = '2026-11-10'; }); },
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
  assert.equal(run(d => { setClose(d, 78); d.valuation.scenarios.conservative = F.sc(100); d.valuation.scenarios.base = F.sc(110); }).price.band, 20);
  assert.equal(run(d => { setClose(d, 68); }).price.band, 30);
  const nf = run(d => { setClose(d, 85); });
  assert.equal(nf.price.status, 'not-fear'); assert.equal(nf.state, S.OBSERVE);
});
test('게이트 UNKNOWN / 증거 미검증·오래됨 → 매수 검토 금지', () => {
  for (const id of ['A', 'B', 'C', 'E']) {
    const r = run(d => { d.gates[id] = { status: 'UNKNOWN' }; });
    assert.equal(r.state, S.HOLD, id);
  }
  const unv = run(d => { d.gates.A.evidence[0].verification = 'independent-verified'; });
  assert.equal(gateOf(unv, 'A').status, 'UNKNOWN'); assert.equal(unv.state, S.HOLD);
  const old = run(d => { const e = d.gates.C.evidence[0]; e.publishedAt = '2026-01-01'; e.retrievedAt = '2026-01-02T00:00:00Z'; e.verification.checkedAt = '2026-01-02T01:00:00Z'; });
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
  assert.equal(run(d => { d.valuation.scenarios.conservative = F.sc(120); }).valuation.status, 'not-computed');
  assert.equal(run(d => { d.valuation.currency = 'KRW'; }).valuation.status, 'not-computed');
  assert.equal(run(d => { d.valuation.verification = 'independent-verified'; delete d.valuation.lineage.shares; }).state, S.HOLD);  // v2: 자기선언 verification 문자열은 무시, 산출 계보 필요
});
test('4단계 조사·반론·무효화 조건 없으면 판단 보류, E PASS도 반론 없으면 미확인', () => {
  for (const k of ['filings', 'news', 'consensus', 'community']) assert.equal(run(d => { delete d.research[k]; }).state, S.HOLD, k);
  assert.equal(run(d => { const e = d.research.news.evidence[0]; e.publishedAt = '2026-09-01'; e.retrievedAt = '2026-09-01T12:00:00Z'; e.verification.checkedAt = '2026-09-01T13:00:00Z'; }).state, S.HOLD);
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
  const conv = run(d => { d.context.weightPct = 10; d.context.convictionList = F.convictionList(['SYN-A']); });
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
  for (let i = 0; i < 8; i++) rs.push(run(d => { F.withTicker(d, 'SYN-' + i); setClose(d, 50 + i * 2); }));
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
  const up = G.notifyPlan([run(d => { setClose(d, 52); })], p2.ledger);
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

/* ---- 지피 GPT-REVIEW-buy-review-gate-20261121-1031 CR-1~4 음성시험 ---- */
const holdPrice = (name, f) => { const r = run(f); assert.equal(r.price.status, 'fail-closed', name); assert.equal(r.state, S.HOLD, name); assert.equal(r.buyReview, false, name); return r; };
test('CR-1 교차검증: 호출자 match 선언·중복 공급자·통화/시각/기준 불일치·장중 미확정·분할 전후 혼용 → fail-closed', () => {
  holdPrice('legacyDeclaredMatch', d => { d.price.crossCheck = { status: 'match', diffPct: 0, sources: ['X', 'Y'] }; });
  holdPrice('duplicateProvider', d => { d.price.crossCheck.quotes[1].provider = 'SYNTHETIC-1'; });
  holdPrice('duplicateCase', d => { d.price.crossCheck.quotes[1].provider = ' synthetic-1 '; });
  holdPrice('singleQuote', d => { d.price.crossCheck.quotes.pop(); });
  holdPrice('primaryNotInQuotes', d => { d.price.source = 'OTHER'; });
  holdPrice('quoteCurrency', d => { d.price.crossCheck.quotes[1].currency = 'KRW'; });
  holdPrice('quoteExchange', d => { d.price.crossCheck.quotes[1].exchange = 'OTHER-EX'; });
  holdPrice('quoteDate', d => { d.price.crossCheck.quotes[1].asOf = '2026-11-19'; });
  holdPrice('quoteIntraday', d => { d.price.crossCheck.quotes[1].priceType = 'intraday'; });
  holdPrice('quoteOpenSession', d => { d.price.crossCheck.quotes[1].sessionStatus = 'open'; });
  holdPrice('quoteAdjBasis', d => { d.price.crossCheck.quotes[1].adjustmentAsOf = '2026-10-01'; });
  holdPrice('quoteNoRetrieved', d => { delete d.price.crossCheck.quotes[1].retrievedAt; });
  holdPrice('declaredCloseButSessionOpen', d => { d.price.sessionStatus = 'open'; });
  holdPrice('noCloseConfirmation', d => { delete d.price.closeConfirmedAt; });
  holdPrice('closeConfirmedBeforeDay', d => { d.price.closeConfirmedAt = '2026-11-19T21:00:00Z'; });
  holdPrice('closeConfirmedFuture', d => { d.price.closeConfirmedAt = '2026-11-22T21:00:00Z'; });
  // 분할 전후 혼용: 한 공급자는 분할 전 고점(10배) — 기준 표시를 같게 위장해도 수치 대조로 차단.
  const split = holdPrice('splitMixedHigh', d => { d.price.crossCheck.quotes[1].high52w = 1000; });
  assert.ok(split.price.reasons.some(x => /분할 전후 혼용 의심/.test(x)));
  holdPrice('highAdjMismatch', d => { d.price.high52wAdjustment = 'none'; });
  holdPrice('highAdjAsOfMismatch', d => { d.price.high52wAdjustmentAsOf = '2026-01-01'; });
  holdPrice('pendingCorporateAction', d => { d.price.pendingCorporateAction = true; });
  // 1% 이내 차이는 통과
  assert.equal(run(d => { d.price.crossCheck.quotes[1].close = 60.5; }).state, S.CONDITIONAL);
});
test('CR-2 본질가치: 비경제적 가정·단위 누락·재계산 불일치·출처 없는 평가액은 안전마진 미산정', () => {
  const nc = (name, f) => { const r = run(f); assert.equal(r.valuation.status, 'not-computed', name); assert.equal(r.buyReview, false, name); assert.equal(gateOf(r, 'D').status, 'UNKNOWN', name); return r; };
  nc('negDiscount', d => { d.valuation.scenarios.conservative.discountRatePct = -20; });
  nc('hugeGrowth', d => { d.valuation.scenarios.base.growthPct = 500; });
  nc('growthNearDiscount', d => { Object.assign(d.valuation.scenarios.optimistic, { discountRatePct: 6, growthPct: 5.5 }); });
  nc('negDilution', d => { d.valuation.scenarios.conservative.dilutionPct = -10; });
  nc('negSbc', d => { d.valuation.scenarios.conservative.stockCompensation = -5; });
  nc('sharesDiffer', d => { d.valuation.scenarios.base.shares = 120; });
  nc('noUnits', d => { delete d.valuation.units; });
  nc('unitCurrency', d => { d.valuation.units.currency = 'KRW'; });
  nc('unitScaleZero', d => { d.valuation.units.moneyScale = 0; });
  nc('wrongScale', d => { d.valuation.units.moneyScale = 1000; });  // 단위 다르면 재계산이 맞지 않음
  const free = nc('freeValuePerShare', d => { d.valuation.scenarios.conservative.valuePerShare = 79.99 * 2; d.valuation.scenarios.base = F.sc(170); d.valuation.scenarios.optimistic = F.sc(200); });
  assert.ok(free.valuation.reasons.some(x => /재계산과 다름/.test(x)));
  nc('unsupportedMethod', d => { d.valuation.scenarios.base.method = 'DCF(합성)'; });
  nc('noLineage', d => { delete d.valuation.lineage; });
  nc('lineageSelfMemo', d => { d.valuation.lineage.netDebt = [{ text: '내 메모', source: '내 메모', asOf: '2026-11-10', verification: 'independent-verified' }]; });
  nc('lineageNotFiling', d => { d.valuation.lineage.shares = F.ev('발행주식수 뉴스(합성)', 'news'); });
  nc('lineageOtherTicker', d => { d.valuation.lineage.normalizedFcf[0].ticker = 'SYN-Z'; });
  // 올바른 재계산은 기록된다
  const ok = run();
  assert.equal(ok.valuation.status, 'computed');
  for (const a of ok.valuation.assumptions) assert.ok(Math.abs(a.recomputed - { conservative: 80, base: 100, optimistic: 130 }[a.scenario]) < 0.01);
  assert.equal(G.VAL_RANGE.status, 'unverified-sanity-range');
});
test('CR-3 조사·증빙: 완료 주장만·자체 메모·다른 종목 공시·가짜 출처·자기검증은 PASS 불가', () => {
  // 지피 예시 그대로
  const memo = run(d => { d.research.filings = { done: true, source: '내 메모', summary: '완료', asOf: '2026-11-20' }; });
  assert.equal(memo.state, S.HOLD);
  const f = memo.research.find(x => x.id === 'filings'); assert.equal(f.claimed, true); assert.equal(f.ok, false); assert.equal(f.verified, false);
  assert.match(memo.reasons.join(), /완료 주장, 근거 미검증/);
  const H = (name, fn) => { const r = run(fn); assert.equal(r.buyReview, false, name); assert.equal(r.state, S.HOLD, name); return r; };
  H('otherTickerFiling', d => { d.research.filings.evidence[0].ticker = 'SYN-Z'; });
  H('otherMarketFiling', d => { d.research.filings.evidence[0].market = 'KR'; });
  H('newsAsFiling', d => { d.research.filings.evidence[0].kind = 'news'; });
  H('gateSelfString', d => { d.gates.A.evidence = [{ text: '경쟁력 유지', source: '내 판단', asOf: '2026-11-01', verification: 'independent-verified' }]; });
  H('gateNoFiling', d => { d.gates.A.evidence[0].kind = 'analysis'; delete d.gates.A.evidence[0].docId; });
  H('selfVerifier', d => { d.gates.B.evidence[0].verification.verifier = 'claude'; });
  H('verifierIsProducer', d => { d.gates.B.evidence[0].verification.verifier = 'synthetic-collector'; });
  H('noHash', d => { d.gates.C.evidence[0].verification.contentSha256 = 'abc'; });
  H('checkedBeforeRetrieved', d => { d.gates.C.evidence[0].verification.checkedAt = '2026-10-01T00:00:00Z'; });
  H('publishedAfterRetrieved', d => { d.gates.E.evidence[0].publishedAt = '2026-11-05'; });
  H('httpUrl', d => { d.gates.E.evidence[0].url = 'http://example.invalid/x'; });
  H('badDocId', d => { d.gates.A.evidence[0].docId = '12345'; });
  // 가짜 출처: 실제 판단(synthetic=false)에서는 합성 출처·비공식 공시 도메인 불가
  const real = run(d => { d.synthetic = false; });
  assert.equal(real.state, S.HOLD); assert.ok(real.gates.every(g => g.status === 'UNKNOWN'));
  assert.ok(real.gates[0].reason.includes('합성 출처는 실제 판단에 사용 불가'));
  const fakeHost = run(d => { d.synthetic = false; d.gates.A.evidence[0].url = 'https://sec-gov.example.com/x'; });
  assert.ok(gateOf(fakeHost, 'A').reason.includes('공시 공식 출처 아님'));
  // 공식 도메인 형식 확인(접속하지 않음): sec.gov·정상 문서번호면 출처 사유는 사라지고, 남는 것은 실제 자료 신뢰 등록 잠금뿐(CR-6)
  const e = F.one('10-K(형식 시험)', 'filing', '2026-11-01'); e.url = 'https://www.sec.gov/Archives/edgar/data/0/0.htm';
  const left = G.evidenceCheck(e, { market: 'US', ticker: 'SYN-A', synthetic: false, now: Date.parse(NOW) });
  assert.ok(left.length > 0 && left.every(x => /신뢰 등록 없음.*실제 자료 잠금/.test(x)), JSON.stringify(left));
});
test('CR-4 실행 가능성: 오래된 현금·통화 불일치·계좌 미확인·하한 통화 불일치 → blocked/unconfirmed, 판단은 유지', () => {
  const ex = (f) => run(f).executability;
  const item = (e, id) => e.items.find(x => x.id === id);
  const stale = ex(d => { d.context.cash.asOf = '2026-11-18T00:00:00Z'; });
  assert.equal(stale.status, 'blocked'); assert.match(item(stale, 'cash').note, /오래됨/);
  assert.equal(ex(d => { d.context.cash.asOf = '2026-11-20'; }).status, 'blocked');  // 시각 없는 날짜만
  assert.equal(ex(d => { d.context.cash.asOf = '2026-11-25T00:00:00Z'; }).status, 'blocked');
  assert.equal(ex(d => { delete d.context.cash.currency; }).status, 'blocked');
  assert.equal(ex(d => { delete d.context.cash.accountScope; }).status, 'blocked');
  assert.equal(ex(d => { d.context.cash.accountScope.accounts = []; }).status, 'blocked');
  assert.equal(ex(d => { d.context.cash.accountScope.accounts = ['A', 'A']; }).status, 'blocked');
  assert.equal(ex(d => { d.context.cash.accountScope.status = 'assumed'; }).status, 'blocked');
  const nofx = ex(d => { delete d.context.fx; });
  assert.equal(nofx.status, 'unconfirmed'); assert.match(item(nofx, 'currency').note, /환율 증빙 없어 비교 안 함/);
  assert.equal(ex(d => { d.context.fx.asOf = '2026-11-01T00:00:00Z'; }).status, 'unconfirmed');
  assert.equal(ex(d => { d.context.fx.quote = 'JPY'; }).status, 'unconfirmed');
  const usd = ex(d => { d.context.cash.currency = 'USD'; d.context.cash.amount = 5000; d.context.emergencyFloor = { status: 'set', amount: 1000, currency: 'USD' }; delete d.context.fx; });
  assert.equal(usd.status, 'checks-ok');
  const floorCcy = ex(d => { d.context.emergencyFloor.currency = 'USD'; });
  assert.equal(item(floorCcy, 'emergency').status, 'unknown'); assert.equal(floorCcy.status, 'unconfirmed');
  assert.equal(ex(d => { delete d.context.emergencyFloor.currency; }).status, 'unconfirmed');
  assert.equal(ex().status, 'checks-ok');
  // 투자 판단은 실행 가능성과 분리
  assert.equal(run(d => { d.context.cash.asOf = '2026-11-01T00:00:00Z'; }).state, S.CONDITIONAL);
  for (const e of [stale, nofx, usd, floorCcy]) { assert.equal(e.quantity, null); assert.equal(e.order, null); }
});
test('CR-4 알림 중복 제거: 같은 실행에서 같은 market+ticker는 후보·알림 최대 1회, 대표는 상위 상태', () => {
  const a = run(), b = run(d => { setClose(d, 52); }), c = run(d => { F.withTicker(d, 'syn-a '); });
  const s = G.shortlist([a, b, c]);
  assert.equal(s.length, 1); assert.equal(s[0].state, S.HIGH);
  const p = G.notifyPlan([a, b, c], {});
  assert.equal(p.items.length, 1); assert.equal(p.items[0].key, 'US:SYN-A'); assert.equal(p.items[0].state, S.HIGH);
  assert.equal(Object.keys(p.ledger).length, 1);
  assert.equal(G.notifyPlan([a, b], p.ledger).notify, false);
  // 다른 시장 같은 티커는 별개
  const kr = run(d => { d.market = 'KR'; });
  assert.equal(G.shortlist([a, kr]).filter(r => r.ticker === 'SYN-A').length, a.buyReview && kr.buyReview ? 2 : 1);
  // 하락 후 재진입은 기존 계약대로 1회
  const down = G.notifyPlan([run(d => { delete d.valuation; }), run(d => { delete d.valuation; })], p.ledger);
  assert.equal(down.notify, false);
  assert.equal(G.notifyPlan([a, a], down.ledger).items.length, 1);
});

test('CR-5 안전마진은 엔진 재계산값만 사용: 입력 주당가치 ±5% 왜곡으로 40/30/20% 경계를 넘지 못함', () => {
  // 지피 반례: 재계산 80, 종가 48, 입력 76.5 → 재계산 기준 40%(가치함정 재검증)이며 HIGH로 우회하지 않음
  const trap = run(d => { setClose(d, 48); d.valuation.scenarios.conservative.valuePerShare = 76.5; });
  assert.equal(trap.valuation.valueBasis, 'engine-recomputed');
  assert.equal(trap.valuation.conservative, 80);
  assert.equal(trap.valuation.marginPct, 40);
  assert.notEqual(trap.state, S.HIGH); assert.equal(trap.buyReview, false); assert.equal(gateOf(trap, 'D').status, 'UNKNOWN');
  // 경계별 ±5% 이내 왜곡: 재계산 기준 구간이 유지되거나, 구간이 갈리면 경계 충돌로 보류
  const cases = [[48, 'value-trap-check'], [56, 'priority'], [64, 'conditional']];  // 재계산 80 기준 40/30/20%
  for (const [close, band] of cases) {
    for (const declared of [76.2, 77, 79, 81, 83, 84]) {
      const r = run(d => { setClose(d, close); d.valuation.scenarios.conservative.valuePerShare = declared; });
      const label = close + '/' + declared;
      assert.equal(r.valuation.marginPct, Math.round((1 - close / 80) * 1000) / 10, label);
      if (r.valuation.status === 'computed') assert.equal(r.valuation.band, band, label);
      else { assert.equal(r.valuation.status, 'boundary-conflict', label); assert.equal(r.state, S.HOLD, label); assert.equal(r.buyReview, false, label); assert.match(gateOf(r, 'D').reason, /경계 충돌/, label); }
    }
  }
  // 경계 바로 아래(재계산 39.9%)를 입력 부풀림으로 40% 위로 올려도 HIGH가 아니라 보류
  const up = run(d => { setClose(d, 48.08); d.valuation.scenarios.conservative.valuePerShare = 83; });
  assert.equal(up.valuation.status, 'boundary-conflict'); assert.equal(up.state, S.HOLD);
  // 20% 경계: 재계산 19.9%(FAIL 영역)를 입력 81로 20% 이상처럼 보여도 조건부가 되지 않음
  const c20 = run(d => { setClose(d, 64.08); d.valuation.scenarios.conservative.valuePerShare = 81; });
  assert.equal(c20.buyReview, false);
  // 후보 정렬도 재계산 안전마진 기준
  const a = G.evaluate(F.withTicker(F.base(d => { setClose(d, 58); d.valuation.scenarios.conservative.valuePerShare = 83; }), 'SYN-P'), NOW);
  const b = G.evaluate(F.withTicker(F.base(d => { setClose(d, 57); }), 'SYN-Q'), NOW);
  assert.ok(b.valuation.marginPct > a.valuation.marginPct);
});

test('CR-6 실제 자료 잠금: synthetic:false + sec.gov 형식 URL·임의 해시·검증자/공급자 별칭 → 매수 검토 금지·판단 보류', () => {
  const realish = d => {
    d.synthetic = false;
    (function walk(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.kind) { x.url = 'https://www.sec.gov/Archives/edgar/data/1/' + x.kind + '.htm'; x.producedBy = 'edgar-fetcher'; x.verification = { status: 'verified', verifier: 'independent-auditor', checkedAt: x.retrievedAt.replace('12:00', '13:00'), contentSha256: 'b'.repeat(64) }; }
      Object.keys(x).forEach(k => walk(x[k])); })(d);
    d.price.source = 'vendor-x'; d.price.crossCheck.quotes[0].provider = 'vendor-x'; d.price.crossCheck.quotes[1].provider = 'vendor-x-mirror';
  };
  const r = run(realish);
  assert.equal(r.buyReview, false); assert.equal(r.state, S.HOLD); assert.equal(r.synthetic, false);
  assert.match(r.reasons.join(' '), /실제 자료 잠금|신뢰 등록 없음/);
  // 엔진 내부가 모두 통과한다고 가정해도(합성 경로 그대로 + synthetic만 false) 최종 잠금이 걸린다
  const G2 = require('../has/buy-review-gate.js');
  assert.equal(G2.REAL_DATA_LOCK, true); assert.equal(G2.TRUST.status, 'real-data-locked');
  assert.deepEqual(Object.keys(G2.TRUST.real.verifiers), []); assert.deepEqual(Object.keys(G2.TRUST.real.providers), []);
  assert.ok(Object.isFrozen(G2.TRUST.real.verifiers));
  // 문자열 synthetic, 누락도 실제 자료로 취급
  assert.equal(run(d => { d.synthetic = 'true'; }).buyReview, false);
  assert.equal(run(d => { delete d.synthetic; }).buyReview, false);
  // producedBy 누락은 증빙 미검증
  const np = run(d => { delete d.gates.A.evidence[0].producedBy; });
  assert.equal(np.buyReview, false); assert.match(gateOf(np, 'A').reason, /producedBy/);
  // 미등록 검증자·같은 원천 별칭 공급자(합성에서도)
  assert.equal(run(d => { d.gates.B.evidence[0].verification.verifier = 'some-verifier'; }).buyReview, false);
  const alias = run(d => { d.price.crossCheck.quotes[1].provider = 'SYNTHETIC-9'; });
  assert.equal(alias.price.status, 'fail-closed'); assert.ok(alias.price.reasons.some(x => /신뢰 등록 없음/.test(x)));
  // 합성 실험실 정상 경로는 유지
  assert.equal(run().state, S.CONDITIONAL);
});

test('CR-7 확신종목 25%는 지정 목록 대조 후에만, 비중 범위·계좌 범위 검사', () => {
  const capOf = f => run(f).executability.items.find(x => x.id === 'cap');
  // 지피 반례: boolean 하나로 25%가 열리지 않음
  const flag = run(d => { d.context.weightPct = 20; d.context.conviction = true; });
  assert.equal(flag.executability.cap, 10); assert.equal(capOf(d => { d.context.weightPct = 20; d.context.conviction = true; }).status, 'blocked');
  assert.match(capOf(d => { d.context.weightPct = 20; d.context.conviction = true; }).note, /지정 목록 없음/);
  // 확인된 목록·같은 계좌·이 종목 포함일 때만 25%
  const ok = run(d => { d.context.weightPct = 20; d.context.convictionList = F.convictionList(['SYN-A']); });
  assert.equal(ok.executability.cap, 25); assert.equal(ok.executability.items.find(x => x.id === 'cap').status, 'ok');
  const no = (name, f) => { const r = run(d => { d.context.weightPct = 20; d.context.convictionList = F.convictionList(['SYN-A']); f(d); }); assert.equal(r.executability.cap, 10, name); assert.equal(r.executability.items.find(x => x.id === 'cap').status, 'blocked', name); };
  no('notInList', d => { d.context.convictionList.items = [{ market: 'US', ticker: 'SYN-B' }]; });
  no('otherMarket', d => { d.context.convictionList.items = [{ market: 'KR', ticker: 'SYN-A' }]; });
  no('unconfirmed', d => { d.context.convictionList.status = 'draft'; });
  no('aiDesignated', d => { d.context.convictionList.designatedBy = 'ai'; });
  no('stale', d => { d.context.convictionList.asOf = '2026-09-01'; });
  no('future', d => { d.context.convictionList.asOf = '2026-12-01'; });
  no('otherAccounts', d => { d.context.convictionList.accountScope.accounts = ['SYN-ACCT-2']; });
  // 비중 값 범위
  assert.equal(capOf(d => { d.context.weightPct = -1; }).status, 'blocked');
  assert.equal(capOf(d => { d.context.weightPct = 101; }).status, 'blocked');
  assert.match(capOf(d => { d.context.weightPct = 150; }).note, /0~100%/);
  // 비중 계좌 범위: 다른 계좌로 분리 계산된 비중은 혼용하지 않음
  const split = capOf(d => { d.context.weightScope = { status: 'confirmed', accounts: ['SYN-ACCT-2'] }; });
  assert.equal(split.status, 'unknown'); assert.match(split.note, /계좌 범위/);
  assert.equal(capOf(d => { delete d.context.weightScope; }).status, 'unknown');
  assert.equal(capOf(d => { d.context.weightScope = { status: 'confirmed', accounts: ['SYN-ACCT-1', 'SYN-ACCT-2'] }; }).status, 'unknown');
  assert.equal(capOf(() => {}).status, 'ok');
  // 판단은 실행 가능성과 분리
  assert.equal(flag.state, S.CONDITIONAL); assert.equal(flag.executability.quantity, null); assert.equal(flag.executability.order, null);
});

test('CR-8 경계 판정은 반올림 전 원시값: 19.96%·29.96%·39.96%는 표시 20/30/40이어도 한 단계 아래', () => {
  // 재계산 보수 주당가치 80 기준. [종가, 원시 안전마진, 기대 구간, 기대 상태]
  const cases = [
    [64.048, 19.94, 'observe', S.OBSERVE], [64.032, 19.96, 'observe', S.OBSERVE], [64, 20, 'conditional', S.CONDITIONAL],
    [56.048, 29.94, 'conditional', S.CONDITIONAL], [56.032, 29.96, 'conditional', S.CONDITIONAL], [56, 30, 'priority', S.HIGH],
    [48.048, 39.94, 'priority', S.HIGH], [48.032, 39.96, 'priority', S.HIGH], [48, 40, 'value-trap-check', S.HOLD]
  ];
  for (const [close, raw, band, state] of cases) {
    const r = run(d => { setClose(d, close); });
    const label = String(close);
    assert.equal(r.valuation.status, 'computed', label);
    assert.ok(Math.abs(r.valuation.marginRaw - raw) < 1e-6, label + ' raw ' + r.valuation.marginRaw);
    assert.equal(r.valuation.marginPct, Math.round(raw * 10) / 10, label);   // 표시는 1자리 반올림
    assert.equal(r.valuation.band, band, label); assert.equal(r.state, state, label);
  }
  // 지피 반례 그대로: 64.032 → 표시 20.0%여도 D FAIL·매수 검토 아님, 56.032 → 표시 30.0%여도 HIGH 아님
  const c = run(d => { setClose(d, 64.032); });
  assert.equal(c.valuation.marginPct, 20); assert.equal(gateOf(c, 'D').status, 'FAIL'); assert.equal(c.buyReview, false);
  const h = run(d => { setClose(d, 56.032); });
  assert.equal(h.valuation.marginPct, 30); assert.equal(h.state, S.CONDITIONAL); assert.notEqual(h.state, S.HIGH);
  // 입력값 경계 충돌도 원시값으로: 재계산 19.94%, 입력 80.1(20.04%) → 경계 충돌 보류
  const bc = run(d => { setClose(d, 64.048); d.valuation.scenarios.conservative.valuePerShare = 80.1; });
  assert.equal(bc.valuation.status, 'boundary-conflict'); assert.equal(bc.buyReview, false);
  // 후보 정렬도 원시값: 29.96(표시 30.0)과 29.97(표시 30.0) 중 큰 쪽이 먼저
  const a = G.evaluate(F.withTicker(F.base(d => { setClose(d, 56.032); }), 'SYN-R1'), NOW);
  const b = G.evaluate(F.withTicker(F.base(d => { setClose(d, 56.024); }), 'SYN-R2'), NOW);
  assert.equal(a.valuation.marginPct, b.valuation.marginPct);
  assert.deepEqual(G.shortlist([a, b]).map(r => r.ticker), ['SYN-R2', 'SYN-R1']);
  // 정책값은 확정하지 않음
  assert.equal(G.MOS_BANDS.status, 'unverified-initial-policy');
});

test('CR-9 후보·알림은 엔진 발급 결과만: 임의 객체·복사본·사후 변조·실제 자료는 0건', () => {
  const ok = run();
  assert.equal(G.shortlist([ok]).length, 1);
  // 지피 반례: 평가를 거치지 않은 실자료 플래그 객체
  const forged = { market: 'US', ticker: 'SYN-X', synthetic: false, state: S.CONDITIONAL, buyReview: true, valuation: { marginPct: 50 } };
  const forgedSyn = Object.assign({}, forged, { synthetic: true, state: S.HIGH });
  for (const [name, x] of Object.entries({ forged, forgedSyn, copy: Object.assign({}, ok), json: JSON.parse(JSON.stringify(ok)), nul: null, num: 1 })) {
    assert.equal(G.shortlist([x]).length, 0, name);
    const p = G.notifyPlan([x], {}); assert.equal(p.notify, false, name); assert.equal(p.items.length, 0, name); assert.deepEqual(p.ledger, {}, name);
  }
  // 발급된 결과를 사후 변조: 관찰 → HIGH 위조, synthetic 뒤집기, 종목 바꾸기
  const obs = run(d => { setClose(d, 68); });
  obs.state = S.HIGH; obs.buyReview = true;
  assert.equal(G.shortlist([obs]).length, 0); assert.equal(G.notifyPlan([obs], {}).notify, false);
  const flip = run(); flip.synthetic = false;
  assert.equal(G.shortlist([flip]).length, 0);
  const swap = run(); swap.ticker = 'SYN-Z';
  assert.equal(G.shortlist([swap]).length, 0);
  // 안전마진 표시값을 부풀려도 정렬은 발급 당시 원시값
  const lo = run(d => { F.withTicker(d, 'SYN-L'); setClose(d, 62); }), hi = run(d => { F.withTicker(d, 'SYN-M'); setClose(d, 58); });
  lo.valuation.marginPct = 99;
  assert.deepEqual(G.shortlist([lo, hi]).map(r => r.ticker), ['SYN-M', 'SYN-L']);
  // 실제 자료(synthetic:false/누락)는 엔진 발급이어도 후보·알림 0건
  for (const f of [d => { d.synthetic = false; }, d => { delete d.synthetic; }]) {
    const r = run(f); assert.equal(G.shortlist([r]).length, 0); assert.equal(G.notifyPlan([r], {}).notify, false);
  }
  // 위조 객체로 기존 원장을 내리거나 지우지 못함
  const p1 = G.notifyPlan([ok], {});
  const p2 = G.notifyPlan([{ market: 'US', ticker: 'SYN-A', state: S.HOLD, buyReview: false }], p1.ledger);
  assert.equal(p2.ledger['US:SYN-A'].state, S.CONDITIONAL);
  // 합성 정상 경로 유지
  assert.equal(G.notifyPlan([run()], {}).items.length, 1);
});

test('CR-10 확신종목 지정 출처는 호출자 자기기재: 실제 자료는 목록이 있어도 10%, 25%는 합성 예제 한정', () => {
  assert.equal(G.CONVICTION_TRUST, 'no-trusted-path');
  const capOf = r => r.executability.items.find(x => x.id === 'cap');
  // 실제 자료: designatedBy:'user'·confirmed·같은 계좌·종목 포함이어도 25% 불가
  const real = run(d => { d.synthetic = false; d.context.weightPct = 20; d.context.convictionList = F.convictionList(['SYN-A']); });
  assert.equal(real.executability.cap, 10); assert.equal(capOf(real).status, 'blocked'); assert.equal(capOf(real).conviction, false);
  assert.equal(capOf(real).convictionSource, 'untrusted'); assert.match(capOf(real).note, /순태씨 승인 아님/);
  const realFlag = run(d => { delete d.synthetic; d.context.weightPct = 5; d.context.conviction = true; });
  assert.equal(realFlag.executability.cap, 10); assert.match(capOf(realFlag).note, /신뢰 경로 없음/);
  const realNone = run(d => { d.synthetic = false; });
  assert.equal(realNone.executability.cap, 10);
  // 합성: 25%는 동작하되 '합성 예제 한정'임을 결과에 표시
  const syn = run(d => { d.context.weightPct = 20; d.context.convictionList = F.convictionList(['SYN-A']); });
  assert.equal(syn.executability.cap, 25); assert.equal(capOf(syn).convictionSource, 'synthetic-only'); assert.match(capOf(syn).note, /합성 예제 한정/);
  // 코드에 한계 명시
  const src = fs.readFileSync(path.join(__dirname, '..', 'has', 'buy-review-gate.js'), 'utf8');
  assert.match(src, /CR-10/); assert.match(src, /자기기재/);
});
