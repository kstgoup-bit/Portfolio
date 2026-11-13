'use strict';
/* 지시서 GPT-20261113-0024: 자본배분 비교 엔진 1단계(순수 계산·합성·읽기 전용) 시험 */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const C = require('../has/capital-allocation.js');
const SRC = fs.readFileSync(path.join(__dirname, '../has/capital-allocation.js'), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/capital-allocation-nvda-synthetic.json'), 'utf8'));
const fx = () => JSON.parse(JSON.stringify(FIX));
const alt = (r, id) => r.alternatives.find(x => x.id === id);

test('매도 산식: 20주×161 = 3220, 차익 20×(161−139.68) = 426.40, 잔여 20.01002주', () => {
  const s = C.computeSale({ soldQty: 20, sellPriceUSD: 161, averageCostUSD: 139.68, heldQty: 40.01002 });
  a.equal(s.ok, true); a.equal(s.grossSaleUSD, 3220); a.equal(s.grossProfitUSD, 426.4); a.equal(s.remainingQty, 20.01002); a.equal(s.netProceedsUSD, 3220); a.equal(s.feesReflected, false);
  const down = C.computeSale({ soldQty: 10, sellPriceUSD: 120, averageCostUSD: 139.68 });
  a.equal(down.grossProfitUSD, -196.8, '가격 하락 시 손실(음수)');
  const fee = C.computeSale({ soldQty: 20, sellPriceUSD: 161, averageCostUSD: 139.68, sellingFeesUSD: 5.5 });
  a.equal(fee.netProceedsUSD, 3214.5); a.equal(fee.feesReflected, true);
});

test('재매수 수량: 3220/140 = 23주(+3), 3220/175 = 18.4주(소수점) 또는 18주+잔여 70', () => {
  a.equal(C.computeBuy({ cashUSD: 3220, buyPriceUSD: 140, fractional: false }).qty, 23);
  const f = C.computeBuy({ cashUSD: 3220, buyPriceUSD: 175, fractional: true });
  a.equal(f.qty, 18.4); a.equal(f.residualCashUSD, 0);
  const i = C.computeBuy({ cashUSD: 3220, buyPriceUSD: 175, fractional: false });
  a.equal(i.qty, 18); a.equal(i.costUSD, 3150); a.equal(i.residualCashUSD, 70);
  const r = C.compareAlternatives(fx());
  a.equal(alt(r, 'B').soldSymbolNetShareChange, 3);
  const g = fx(); g.holdings[0].price = 175; g.fractionalAllowed = true;
  a.equal(alt(C.compareAlternatives(g), 'B').soldSymbolNetShareChange, -1.6);
});

test('수수료: 고정·비율 반영, 수수료가 배정 현금 이상이면 주문 없음, 비용이 현금을 넘지 않음', () => {
  const b = C.computeBuy({ cashUSD: 3220, buyPriceUSD: 140, buyingFeesUSD: 10, fractional: false });
  a.equal(b.qty, 22); a.equal(b.costUSD, 3090); a.equal(b.residualCashUSD, 130);
  const rate = C.computeBuy({ cashUSD: 1000, buyPriceUSD: 100, buyingFeeRate: 0.01, fractional: false });
  a.equal(rate.qty, 9); a.ok(rate.costUSD <= 1000); a.equal(rate.costUSD, 909);
  const none = C.computeBuy({ cashUSD: 5, buyPriceUSD: 100, buyingFeesUSD: 5, fractional: true });
  a.equal(none.qty, 0); a.equal(none.feeUSD, 0); a.equal(none.residualCashUSD, 5);
  const frac = C.computeBuy({ cashUSD: 100, buyPriceUSD: 3, buyingFeeRate: 0.003, fractional: true });
  a.ok(frac.costUSD <= 100, '소수점 주문도 비용이 현금 이하');
  const sale = C.computeSale({ soldQty: 1, sellPriceUSD: 10, averageCostUSD: 5, sellingFeesUSD: 11 });
  a.equal(sale.ok, false); a.equal(sale.code, 'HOLD_CONFLICT');
});

test('입력 오류·경계값: 0/음수/NaN/Infinity, 보유량 초과 매도, 통화 혼합, 분모 0', () => {
  for (const bad of [0, -1, NaN, Infinity, -Infinity, '161', null]) {
    a.equal(C.computeSale({ soldQty: 20, sellPriceUSD: bad, averageCostUSD: 139.68 }).ok, false, String(bad));
    a.equal(C.computeBuy({ cashUSD: 100, buyPriceUSD: bad }).ok, false, String(bad));
  }
  a.equal(C.computeBuy({ cashUSD: -1, buyPriceUSD: 10 }).ok, false);
  const over = C.computeSale({ soldQty: 41, sellPriceUSD: 161, averageCostUSD: 139.68, heldQty: 40.01002 });
  a.equal(over.code, 'HOLD_CONFLICT');
  const o = fx(); o.sale.qty = 40.02;
  const ro = C.compareAlternatives(o); a.equal(ro.status, 'HOLD_CONFLICT'); a.equal(ro.opinion, '판단 보류'); a.equal(ro.alternatives.length, 0);
  const cur = fx(); cur.candidates[0].currency = 'KRW';
  a.equal(C.compareAlternatives(cur).status, 'HOLD_CONFLICT');
  const cur2 = fx(); cur2.currency = 'KRW'; a.equal(C.compareAlternatives(cur2).status, 'HOLD_CONFLICT');
  for (const bad of [NaN, Infinity, -5, 0]) { const p = fx(); p.holdings[0].price = bad; a.equal(C.compareAlternatives(p).status, 'HOLD_INSUFFICIENT_DATA', String(bad)); }
  const zero = C.positionWeights([{ symbol: 'X', qty: 0, price: 10 }], 0, { kind: 'overseas-account' });
  a.equal(zero.ok, false); a.equal(zero.code, 'HOLD_INSUFFICIENT_DATA');
  const neg = fx(); neg.alternatives = [{ id: 'X', label: 'X', allocations: [{ symbol: 'NVDA', share: 0.8 }, { symbol: 'MSFT', share: 0.3 }] }];
  a.equal(C.compareAlternatives(neg).alternatives[0].ok, false, '배정 합계 100% 초과');
  a.equal(C.compareAlternatives(null).status, 'HOLD_INSUFFICIENT_DATA');
});

test('비중 분모: 해외계좌 vs 전체 투자자산(분모 표기), 확신 25%·기타 10% 한도', () => {
  const r = C.compareAlternatives(fx());
  const c2 = alt(r, 'C2');
  a.equal(c2.weights.denominatorUSD, 6021.4); a.match(c2.weights.denominatorLabel, /해외계좌/);
  const msft = c2.weights.positions.find(p => p.symbol === 'MSFT'), nv = c2.weights.positions.find(p => p.symbol === 'NVDA');
  a.equal(msft.limitPct, 25); a.equal(msft.conviction, true); a.equal(nv.limitPct, 10);
  const t = fx(); t.portfolioScope = { kind: 'total-invested', otherAssetsUSD: 100000 };
  const rt = C.compareAlternatives(t), d = alt(rt, 'D');
  a.equal(d.weights.denominatorUSD, 106021.4); a.match(d.weights.denominatorLabel, /전체 투자자산/);
  a.equal(d.opinion, '시나리오 비교 가능', '큰 분모에서는 한도 이내');
  const w = alt(rt, 'B'); a.equal(w.weights.positions[0].weightPct, 5.68); /* (43.01002×140)/106021.4 */
  const conv = C.positionWeights([{ symbol: 'MSFT', qty: 1, price: 24, conviction: true }, { symbol: 'X', qty: 1, price: 11 }], 65, { kind: 'overseas-account' });
  a.deepEqual(conv.limitWarnings.map(x => x.symbol), ['X'], 'MSFT 24% < 25%, X 11% > 10%');
  a.ok(conv.limitWarnings[0].text.includes('매도 지시 아님'));
  const miss = fx(); miss.portfolioScope = { kind: 'total-invested' };
  a.equal(C.compareAlternatives(miss).status, 'HOLD_INSUFFICIENT_DATA');
});

test('중복 종목: 같은 가격이면 합치고(가중 평균단가), 다른 가격이면 판단 보류. 다종목 조합 비중 합 = 100%', () => {
  const m = C.mergeHoldings([{ symbol: 'nvda', qty: 10, averageCost: 100, price: 140 }, { symbol: 'NVDA', qty: 30, averageCost: 140, price: 140 }]);
  a.equal(m.length, 1); a.equal(m[0].qty, 40); a.equal(m[0].averageCost, 130);
  const dup = fx(); dup.holdings = [Object.assign({}, dup.holdings[0], { qty: 20 }), Object.assign({}, dup.holdings[0], { qty: 20.01002 })];
  const rd = C.compareAlternatives(dup); a.equal(rd.status, 'OK'); a.equal(rd.sale.remainingQty, 20.01002);
  const dup2 = fx(); dup2.holdings.push(Object.assign({}, dup2.holdings[0], { qty: 1, price: 141 }));
  a.equal(C.compareAlternatives(dup2).status, 'HOLD_CONFLICT');
  const cand = fx(); cand.candidates.push({ symbol: 'NVDA', priceUSD: 150 });
  a.equal(C.compareAlternatives(cand).status, 'HOLD_CONFLICT', '보유 평가가격과 후보 가격이 다르면 보류');
  const r = C.compareAlternatives(fx());
  for (const x of r.alternatives) { const s = x.weights.positions.reduce((t, p) => t + p.weightPct, 0) + x.weights.cashWeightPct; a.ok(Math.abs(s - 100) < 0.05, x.id + ' ' + s); a.equal(x.accountValueUSD, 6021.4, '비용 0이면 모든 대안의 같은 시점 총액 동일'); }
  const comb = fx(); comb.alternatives = [{ id: 'Z', label: 'Z', allocations: [{ symbol: 'MSFT', share: 0.25 }, { symbol: 'msft', share: 0.25 }] }];
  const z = C.compareAlternatives(comb).alternatives[0]; a.equal(z.orders.length, 1); a.equal(z.orders[0].allocatedUSD, 1610);
});

test('출처·시각·합성 표기, 오래된/충돌/미입력 자료는 판단 보류·추가 정보 필요', () => {
  const r = C.compareAlternatives(fx());
  a.equal(r.header.dataMode, 'synthetic'); a.match(r.header.priceVerification, /교차검증 아님.*합성 가격, 현재 시세 아님/);
  a.deepEqual(r.header.notReflected, ['매도 수수료·세금 미반영', '매수 수수료 미반영', '환율 미반영(원화 평가 산출 보류)']);
  const st = fx(); st.freshnessStatus = 'stale'; const rs = C.compareAlternatives(st); a.equal(rs.opinion, '판단 보류');
  const cf = fx(); cf.freshnessStatus = 'conflict'; a.equal(C.compareAlternatives(cf).opinion, '판단 보류');
  const sf = fx(); sf.freshnessStatus = 'fresh'; a.equal(C.compareAlternatives(sf).status, 'HOLD_CONFLICT', '합성 자료를 최신으로 표시 금지');
  const vk = fx(); vk.dataMode = 'verified'; vk.freshnessStatus = 'fresh'; vk.holdings.push({ symbol: 'MSFT', qty: 1, price: 400, priceKind: 'extended', averageCost: 300 }); vk.holdings[0].priceKind = 'regular';
  a.equal(C.compareAlternatives(vk).status, 'HOLD_CONFLICT', '정규장·시간외 혼합');
  for (const k of ['asOf', 'quoteAsOf', 'source', 'dataMode', 'fractionalAllowed']) { const m = fx(); delete m[k]; const rm = C.compareAlternatives(m); a.notEqual(rm.status, 'OK', k); }
  const mm = fx(); delete mm.quoteAsOf; a.equal(C.compareAlternatives(mm).opinion, '추가 정보 필요');
  const tax = C.compareAlternatives(fx()).sale.taxKRW; a.equal(tax.status, '산출 보류');
  const tx = fx(); tx.fx = { usdkrw: 1400, acquisitionUsdKrw: 1300, saleUsdKrw: 1400 };
  const t2 = C.compareAlternatives(tx).sale.taxKRW; a.equal(t2.gainKRW, Math.round(20 * 161 * 1400 - 20 * 139.68 * 1300)); a.match(t2.status, /세액 산출 보류/);
});

test("'매수 검토'는 재무 미연결이면 차단, 1단계 엔진은 의견 4종만 출력", () => {
  const r = C.compareAlternatives(fx());
  a.equal(r.buyReview.allowed, false); a.ok(r.buyReview.missing.some(m => /재무/.test(m)));
  a.deepEqual([...C.OPINIONS], ['시나리오 비교 가능', '추가 정보 필요', '판단 보류', '비중 한도 주의']);
  for (const x of r.alternatives) a.ok(C.OPINIONS.includes(x.opinion), x.opinion);
  const full = fx(); full.dataMode = 'verified'; full.freshnessStatus = 'fresh';
  full.holdings[0].valuationAssessment = { status: 'verified', research: { news: { status: 'verified' }, earningsFilings: { status: 'verified' }, consensus: { status: 'verified' }, community: { status: 'verified' } } };
  const b = C.canBuyReview(full, 'NVDA'); a.equal(b.missing.length, 0); a.equal(b.allowed, false, '1단계는 조건을 갖춰도 표시 안 함');
  a.doesNotMatch(JSON.stringify(C.compareAlternatives(full).alternatives), /매수 검토/);
});

test('시나리오: 사용자 입력 수익률만 계산, 빠진 종목은 추가 정보 필요', () => {
  const s = fx(); s.scenarios = [{ horizonYears: 1, returnsPct: { NVDA: 10 } }, { horizonYears: 3, returnsPct: { NVDA: 0, MSFT: 0 } }];
  const r = C.compareAlternatives(s);
  const b1 = alt(r, 'B').scenarios[0]; a.equal(b1.valueUSD, Math.round(43.01002 * 140 * 1.1 * 100) / 100); a.match(b1.assumption, /예측 아님/);
  a.equal(alt(r, 'C1').scenarios[0].status, '추가 정보 필요'); a.deepEqual(alt(r, 'C1').scenarios[0].missing, ['GOOGL']);
  a.equal(alt(r, 'C2').scenarios[1].valueUSD, 6021.4);
  a.deepEqual(C.compareAlternatives(fx()).alternatives[0].scenarios, [], '입력 없으면 수익률을 만들지 않음');
});

test('순수성: 입력 불변, 저장소·네트워크·전역 접근 없음, 금지 단어 없음', () => {
  const inp = fx(), snap = JSON.stringify(inp); C.compareAlternatives(inp); a.equal(JSON.stringify(inp), snap);
  a.doesNotMatch(SRC, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|document\.|window\.|script\.google|navigator\./);
  a.doesNotMatch(SRC, /목표가|확정 수익|자동\s*매매\s*실행|placeOrder/);
});

test('합성 사례 손계산 표 회귀(보고서 표와 동일)', () => {
  const r = C.compareAlternatives(fx());
  const row = id => { const x = alt(r, id); return [x.orders.map(o => o.symbol + ':' + o.qty).join(','), x.cashAfterUSD, x.soldSymbolNetShareChange, x.opinion]; };
  a.deepEqual(row('A'), ['', 3220, -20, '비중 한도 주의']);
  a.deepEqual(row('B'), ['NVDA:23', 0, 3, '비중 한도 주의']);
  a.deepEqual(row('C1'), ['GOOGL:32', 20, -20, '비중 한도 주의']);
  a.deepEqual(row('C2'), ['MSFT:8', 20, -20, '비중 한도 주의']);
  a.deepEqual(row('C3'), ['AVGO:10', 220, -20, '비중 한도 주의']);
  a.deepEqual(row('D'), ['NVDA:5,GOOGL:8,MSFT:2,AVGO:2', 320, -15, '비중 한도 주의']);
  a.deepEqual(row('E'), ['NVDA:11', 1680, -9, '비중 한도 주의']);
  a.equal(alt(r, 'C3').weights.sectors[0].sector, '반도체'); a.equal(alt(r, 'C3').weights.sectors[0].weightPct, 96.35);
  a.equal(alt(r, 'D').weights.positions.find(p => p.symbol === 'NVDA').weightPct, 58.15);
});

/* ── 지피 검토 GPT-REVIEW-capital-allocation-20261113-0730 반영 ── */
test('후보 안 같은 종목: 가격·통화·시세종류·기준시각이 다르면 HOLD_CONFLICT, 모두 같으면 중복 하나로 처리', () => {
  const p = fx(); p.candidates.push({ symbol: 'googl', priceUSD: 101, currency: 'USD' });
  const rp = C.compareAlternatives(p); a.equal(rp.status, 'HOLD_CONFLICT'); a.equal(rp.alternatives.length, 0); a.ok(rp.issues.some(x => /GOOGL 후보가 두 번.*가격 100 \/ 101/.test(x)));
  const cu = fx(); cu.candidates.push({ symbol: 'GOOGL', priceUSD: 100, currency: 'KRW' }); a.equal(C.compareAlternatives(cu).status, 'HOLD_CONFLICT');
  const k = fx(); k.candidates[0].priceKind = 'regular'; k.candidates.push({ symbol: 'GOOGL', priceUSD: 100, priceKind: 'extended' });
  a.ok(C.compareAlternatives(k).issues.some(x => /시세종류 regular \/ extended/.test(x)));
  const t = fx(); t.candidates[0].quoteAsOf = '2026-11-13T00:00:00+09:00'; t.candidates.push({ symbol: 'GOOGL', priceUSD: 100, quoteAsOf: '2026-11-12T00:00:00+09:00' });
  a.equal(C.compareAlternatives(t).status, 'HOLD_CONFLICT');
  const same = fx(); same.candidates.push(Object.assign({}, same.candidates[0]));
  const rs = C.compareAlternatives(same); a.equal(rs.status, 'OK', '완전히 같은 중복은 허용');
  a.equal(rs.alternatives.filter(x => /GOOGL 전액/.test(x.label)).length, 1, '중복 후보는 대안 하나');
  const hc = fx(); hc.holdings[0].priceKind = 'regular'; hc.candidates.push({ symbol: 'NVDA', priceUSD: 140, priceKind: 'extended' });
  a.equal(C.compareAlternatives(hc).status, 'HOLD_CONFLICT', '보유·후보 시세종류 다름');
});

test('비정상 대안·시나리오·부가 입력은 예외 없이 보류(HOLD_INSUFFICIENT_DATA)', () => {
  const bads = [
    i => { i.alternatives = [null]; }, i => { i.alternatives = ['x']; }, i => { i.alternatives = 'A'; },
    i => { i.alternatives = [{ id: 'X' }]; }, i => { i.alternatives = [{ id: 'X', allocations: 'NVDA' }]; },
    i => { i.alternatives = [{ id: 'X', allocations: [null] }]; }, i => { i.alternatives = [{ id: 'X', allocations: [{ share: 1 }] }]; },
    i => { i.alternatives = [{ id: 'X', allocations: [{ symbol: 'NVDA', share: '1' }] }]; },
    i => { i.alternatives = [{ id: 'X', allocations: [{ symbol: 'NVDA', share: NaN }] }]; },
    i => { i.alternatives = [{ id: 'X', allocations: [{ symbol: 'NVDA', share: Infinity }] }]; },
    i => { i.scenarios = [null]; }, i => { i.scenarios = ['1y']; }, i => { i.scenarios = { horizonYears: 1 }; },
    i => { i.scenarios = [{ horizonYears: -1, returnsPct: { NVDA: 5 } }]; }, i => { i.scenarios = [{ horizonYears: 0, returnsPct: { NVDA: 5 } }]; },
    i => { i.scenarios = [{ horizonYears: Infinity, returnsPct: { NVDA: 5 } }]; }, i => { i.scenarios = [{ horizonYears: 1, returnsPct: null }]; },
    i => { i.scenarios = [{ horizonYears: 1, returnsPct: { NVDA: NaN } }]; }, i => { i.scenarios = [{ horizonYears: 1, returnsPct: { NVDA: -150 } }]; },
    i => { i.scenarios = [{ horizonYears: 1, returnsPct: { NVDA: 5000 } }]; }, i => { i.scenarios = [{ horizonYears: 1, returnsPct: { NVDA: '10' } }]; },
    i => { i.holdings.push(null); }, i => { i.candidates.push(null); }, i => { i.candidates = 'GOOGL'; },
    i => { i.partialReinvest = { share: 0.5, symbols: 'NVDA' }; }, i => { i.partialReinvest = { share: 2 }; }, i => { i.partialReinvest = 'half'; },
    i => { i.convictionSymbols = 'MSFT'; }, i => { i.sale = 'NVDA'; }
  ];
  bads.forEach((mut, n) => {
    const i = fx(); mut(i); let r;
    a.doesNotThrow(() => { r = C.compareAlternatives(i); }, 'case ' + n);
    a.notEqual(r.status, 'OK', 'case ' + n); a.equal(r.alternatives.length, 0, 'case ' + n);
    a.ok(['추가 정보 필요', '판단 보류'].includes(r.opinion), 'case ' + n);
  });
  const ok = fx(); ok.scenarios = [{ horizonYears: 50, returnsPct: { NVDA: -100, MSFT: 1000 } }]; a.equal(C.compareAlternatives(ok).status, 'OK', '경계값 -100%·1000%·50년 허용');
  const neg = fx(); neg.alternatives = [{ id: 'N', label: 'N', allocations: [{ symbol: 'NVDA', share: -0.1 }] }, { id: 'P', label: 'P', allocations: [{ symbol: 'NVDA', share: 0.5 }] }];
  const rn = C.compareAlternatives(neg); a.equal(rn.status, 'OK'); a.equal(rn.alternatives[0].ok, false); a.equal(rn.alternatives[0].opinion, '판단 보류'); a.equal(rn.alternatives[1].ok, true, '다른 대안은 계속 계산');
});

test('출처·시각 계약 경계: 형식 오류는 추가 정보 필요, 시각 모순·항목 기준시각 불일치는 판단 보류, 검증 주장도 교차검증 완료로 표기 안 함', () => {
  for (const [k, v] of [['asOf', '2026/11/13'], ['asOf', '2026-02-30'], ['quoteAsOf', '2026-11-13'], ['quoteAsOf', '2026-11-13T00:00:00'], ['quoteAsOf', 'yesterday'], ['timezone', 'Mars/Base'], ['source', 42], ['timezone', '  ']]) {
    const i = fx(); i[k] = v; const r = C.compareAlternatives(i); a.equal(r.status, 'HOLD_INSUFFICIENT_DATA', k + '=' + v); a.equal(r.opinion, '추가 정보 필요');
  }
  const late = fx(); late.quoteAsOf = '2026-11-14T09:00:00+09:00'; a.equal(C.compareAlternatives(late).status, 'HOLD_CONFLICT', '시세일이 기준일보다 늦음');
  const lateT = fx(); lateT.asOf = '2026-11-13T08:00:00+09:00'; lateT.quoteAsOf = '2026-11-13T09:00:00+09:00'; a.equal(C.compareAlternatives(lateT).status, 'HOLD_CONFLICT');
  const okT = fx(); okT.asOf = '2026-11-13T08:00:00+09:00'; okT.quoteAsOf = '2026-11-12T16:00:00-05:00'; a.equal(C.compareAlternatives(okT).status, 'OK', '뉴욕 16:00 = 서울 06:00, 앞뒤 정상');
  const item = fx(); item.holdings[0].quoteAsOf = '2026-11-12T00:00:00+09:00'; a.equal(C.compareAlternatives(item).status, 'HOLD_CONFLICT', '항목 기준시각이 입력 기준시각과 다름');
  const same = fx(); same.holdings[0].quoteAsOf = '2026-11-12T15:00:00Z'; a.equal(C.compareAlternatives(same).status, 'OK', '같은 순간의 다른 표기는 일치');
  const v = fx(); v.dataMode = 'verified'; v.freshnessStatus = 'fresh'; const rv = C.compareAlternatives(v);
  a.equal(rv.status, 'OK'); a.match(rv.header.priceVerification, /독립 검증하지 않음.*실시간·교차검증 완료 아님/); a.match(rv.header.engineVerification, /교차검증.*없음/);
  a.doesNotMatch(JSON.stringify(rv.header), /교차검증 완료(?! 아님)|실시간 시세(?! 아님)/);
});

test('같은 종목 두 기록 중 한쪽에만 시세종류·기준시각이 있으면 중복으로 합치지 않고 HOLD_INSUFFICIENT_DATA (GPT-REVIEW 0830 #1)', () => {
  const k = fx(); k.candidates.push({ symbol: 'GOOGL', priceUSD: 100, priceKind: 'extended' });
  const rk = C.compareAlternatives(k); a.equal(rk.status, 'HOLD_INSUFFICIENT_DATA'); a.equal(rk.alternatives.length, 0);
  a.ok(rk.issues.some(x => /GOOGL 후보가 두 번.*한쪽 기록에만 시세종류/.test(x)));
  const t = fx(); t.candidates.push({ symbol: 'GOOGL', priceUSD: 100, quoteAsOf: '2026-11-13T00:00:00+09:00' });
  const rt = C.compareAlternatives(t); a.equal(rt.status, 'HOLD_INSUFFICIENT_DATA'); a.ok(rt.issues.some(x => /한쪽 기록에만 기준시각/.test(x)));
  const h = fx(); h.holdings.push({ symbol: 'NVDA', qty: 1, averageCost: 139.68, price: 140, currency: 'USD' });
  a.equal(C.compareAlternatives(h).status, 'HOLD_INSUFFICIENT_DATA', '보유 중복도 같은 규칙');
  const hc = fx(); hc.candidates.push({ symbol: 'NVDA', priceUSD: 140 });
  a.equal(C.compareAlternatives(hc).status, 'HOLD_INSUFFICIENT_DATA', '보유(user-input)·후보(없음) 한쪽만');
  const off = fx(); off.candidates[0].quoteAsOf = '2026-11-13T00:00:00+09:00'; off.candidates.push(Object.assign({}, off.candidates[0], { quoteAsOf: '2026-11-12T15:00:00Z' }));
  const ro = C.compareAlternatives(off); a.equal(ro.status, 'OK', '같은 순간 다른 오프셋은 동일'); a.equal(ro.alternatives.filter(x => /GOOGL 전액/.test(x.label)).length, 1);
  a.equal(C.compareAlternatives(fx()).status, 'OK', '선택 필드 없는 단일 후보 기존 계약 유지');
});

test('sale 형식 결함은 HOLD_INSUFFICIENT_DATA, 형식 정상인 미보유 종목만 HOLD_CONFLICT (GPT-REVIEW 0830 #2)', () => {
  const cases = [{}, { qty: 20, priceUSD: 161 }, { symbol: 'NVDA' }, { symbol: 'NVDA', qty: 20 }, { symbol: 'NVDA', priceUSD: 161 }, { symbol: 'NVDA', qty: '20', priceUSD: 161 }, { symbol: 'NVDA', qty: 20, priceUSD: NaN }, { symbol: 12, qty: 20, priceUSD: 161 }, { symbol: 'TSLA', qty: 0, priceUSD: 161 }];
  for (const sale of cases) {
    const i = fx(); i.sale = sale; const before = JSON.stringify(i);
    let r; a.doesNotThrow(() => { r = C.compareAlternatives(i); });
    a.equal(r.status, 'HOLD_INSUFFICIENT_DATA', JSON.stringify(sale)); a.equal(r.buyReview.allowed, false); a.equal(JSON.stringify(i), before, '입력 불변');
  }
  const nh = fx(); nh.sale = { symbol: 'TSLA', qty: 1, priceUSD: 100 };
  a.equal(C.compareAlternatives(nh).status, 'HOLD_CONFLICT', '형식 정상·미보유는 판단 보류');
  const ok = C.compareAlternatives(fx()); a.equal(ok.status, 'OK'); a.equal(ok.buyReview.allowed, false);
});
