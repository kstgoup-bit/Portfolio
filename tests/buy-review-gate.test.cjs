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
  // 공식 도메인 형식 확인(접속하지 않음): sec.gov·정상 문서번호면 해당 증빙 사유는 사라진다
  const e = F.one('10-K(형식 시험)', 'filing', '2026-11-01'); e.url = 'https://www.sec.gov/Archives/edgar/data/0/0.htm';
  assert.deepEqual(G.evidenceCheck(e, { market: 'US', ticker: 'SYN-A', synthetic: false, now: Date.parse(NOW) }), []);
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
