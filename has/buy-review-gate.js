/* HAS 곡소리 매수 검토 게이트 1단계 (지시서 GPT-20261121-0911) — 순수 판정, 읽기 전용, 비실거래.
   계약 buyReviewInput.v1: 호출자가 준 가격 증거·5게이트 증거·본질가치 시나리오·4단계 조사·실행 맥락만 판정한다.
   - 네트워크·저장소·투자기록·백업을 읽거나 쓰지 않는다. 입력 객체를 바꾸지 않는다.
   - 가격 하락률은 안전마진이 아니다. 안전마진은 '검증된 보수적 본질가치' 대비로만 계산한다.
   - 하나라도 UNKNOWN/FAIL·불일치·지연·누락이면 '매수 검토'를 만들지 않는다(fail-closed).
   - 안전마진 구간(10/20/30/40%)은 검증되지 않은 초기 정책 가정이며 확정 투자규칙이 아니다.
   - 투자 판단과 실행 가능성을 분리한다. 매수 수량·주문·자동매매를 만들지 않는다. 최종 결정은 순태씨. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASBuyReviewGate = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var CONTRACT = 'buyReviewInput.v1', DAY = 86400000;
  var STATES = Object.freeze({ OBSERVE: '관찰', HOLD: '판단 보류', RISK: '위험 경고', CONDITIONAL: '조건부 분할매수 검토', HIGH: '높은 확신의 분할매수 검토' });
  var RANK = { '관찰': 1, '판단 보류': 0, '위험 경고': 0, '조건부 분할매수 검토': 2, '높은 확신의 분할매수 검토': 3 };
  var GATES = Object.freeze([
    ['A', '경쟁력 유지'], ['B', '유동성·차입 위험 수용 가능'], ['C', '정상화 잉여현금흐름 지속성'],
    ['D', '보수적 본질가치 대비 안전마진'], ['E', '회계·구조적 악화·악재의 일시성 및 반론 검증']
  ]);
  // 초기 정책 가정(미검증). 업종·불확실성별 조정과 백테스트 전에는 확정 규칙이 아니다.
  var MOS_BANDS = Object.freeze({ OBSERVE: 10, CONDITIONAL: 20, PRIORITY: 30, TRAP: 40, status: 'unverified-initial-policy' });
  var PRICE_BANDS = Object.freeze([35, 30, 20]);
  var LIMIT_CONVICTION = 25, LIMIT_OTHER = 10, SHORTLIST = 5;
  var MAX_AGE = { price: 4, evidence: 120, valuation: 90, research: 30 };
  var CCY = { KR: 'KRW', US: 'USD' };
  var RESEARCH = Object.freeze([['filings', '최신 공시'], ['news', '뉴스'], ['consensus', '컨센서스'], ['community', '커뮤니티']]);

  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function text(x) { return typeof x === 'string' && x.trim().length > 0; }
  function isoDay(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) && Number.isFinite(Date.parse(x)); }
  function round(x, n) { if (!finite(x)) return null; var p = Math.pow(10, n == null ? 1 : n); return Math.round(x * p) / p; }
  function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } }
  function age(asOf, now) { return (now - Date.parse(asOf)) / DAY; }
  function fresh(asOf, now, maxDays) { return isoDay(asOf) && Date.parse(asOf) <= now + 60000 && age(asOf, now) <= maxDays; }

  /* 1. 가격 선별: 검증된 정규장 종가·52주 고점·동일 기간 벤치마크. 하나라도 어긋나면 fail-closed. */
  function screenPrice(p, market, now) {
    var reasons = [], out = { status: 'fail-closed', band: null, drawdownPct: null, relativePp: null, reasons: reasons, provenance: null };
    if (!p || typeof p !== 'object') { reasons.push('가격 증거 없음'); return out; }
    out.provenance = { source: p.source || null, exchange: p.exchange || null, currency: p.currency || null, priceType: p.priceType || null, asOf: p.asOf || null, adjustment: p.adjustment || null };
    if (!text(p.source)) reasons.push('출처 없음');
    if (!text(p.exchange)) reasons.push('거래소 없음');
    if (p.currency !== CCY[market]) reasons.push('통화 불일치 또는 없음(' + (p.currency || '없음') + ')');
    if (p.priceType !== 'regular-close') reasons.push('정규장 확정 종가가 아님(' + (p.priceType || '종류 없음') + ')');
    if (!['split-adjusted', 'split-dividend-adjusted'].includes(p.adjustment)) reasons.push('조정 여부 미확인');
    if (!fresh(p.asOf, now, MAX_AGE.price)) reasons.push('기준시각 없음·미래·지연(허용 ' + MAX_AGE.price + '일)');
    if (!finite(p.close) || p.close <= 0) reasons.push('종가 값 오류');
    if (!finite(p.high52w) || p.high52w <= 0 || finite(p.close) && p.high52w < p.close) reasons.push('52주 고점 값 오류');
    if (p.high52wAsOf !== p.asOf) reasons.push('종가와 52주 고점 기준일 불일치');
    var cc = p.crossCheck;
    if (!cc || cc.status !== 'match' || !finite(cc.diffPct) || Math.abs(cc.diffPct) > 1 || !Array.isArray(cc.sources) || cc.sources.length < 2) reasons.push('교차검증 불일치·누락(G0 미완료)');
    var b = p.benchmark;
    if (!b || !text(b.id) || !finite(b.returnPct) || !finite(b.stockReturnPct) || !b.period || !isoDay(b.period.start) || !isoDay(b.period.end) || b.period.end !== String(p.asOf).slice(0, 10)) reasons.push('동일 기간 벤치마크 상대수익률 없음');
    if (reasons.length) return out;
    out.drawdownPct = round((1 - p.close / p.high52w) * 100, 2);
    out.relativePp = round(b.stockReturnPct - b.returnPct, 2);
    out.band = PRICE_BANDS.find(function (x) { return out.drawdownPct >= x; }) || null;
    out.status = out.band ? 'fear' : 'not-fear';
    if (!out.band) reasons.push('52주 고점 대비 -20% 미만: 곡소리 가격 구간 아님');
    return out;
  }

  /* 2. 증거 검사: PASS는 검증된 증거가 있을 때만 PASS로 인정. */
  function evidenceOK(list, now) {
    return Array.isArray(list) && list.length > 0 && list.every(function (e) {
      return e && text(e.text) && text(e.source) && fresh(e.asOf, now, MAX_AGE.evidence) && e.verification === 'independent-verified';
    });
  }
  function gate(id, label, g, now) {
    var r = { id: id, label: label, status: 'UNKNOWN', claimed: g && g.status || null, reason: '', evidence: g && Array.isArray(g.evidence) ? clone(g.evidence) : [] };
    if (!g || !['PASS', 'FAIL', 'UNKNOWN'].includes(g.status)) { r.reason = '판정·증거 없음'; return r; }
    if (g.status === 'UNKNOWN') { r.reason = g.reason || '근거 미확인'; return r; }
    if (!evidenceOK(g.evidence, now)) { r.reason = '증거의 출처·기준일·검증 표시 누락 또는 오래됨(허용 ' + MAX_AGE.evidence + '일)'; return r; }
    r.status = g.status; r.reason = g.reason || '';
    return r;
  }

  /* 3. 본질가치: 보수/기준/낙관 시나리오와 가정 공개가 모두 있어야 계산. */
  var SC_FIELDS = ['valuePerShare', 'discountRatePct', 'growthPct', 'normalizedFcf', 'stockCompensation', 'dilutionPct', 'netDebt', 'shares'];
  function valuation(v, price, currency, now, flags) {
    var out = { status: 'not-computed', conservative: null, base: null, optimistic: null, marginPct: null, band: null, currency: currency, reasons: [], assumptions: null, policy: MOS_BANDS.status };
    if (!v || typeof v !== 'object') { out.reasons.push('검증된 본질가치 추정 없음: 안전마진 미산정'); return out; }
    var s = v.scenarios || {}, names = ['conservative', 'base', 'optimistic'];
    var bad = names.filter(function (n) { var x = s[n]; return !x || SC_FIELDS.some(function (f) { return !finite(x[f]); }) || x.valuePerShare <= 0 || x.shares <= 0 || !text(x.method); });
    if (bad.length) out.reasons.push('시나리오 가정 누락: ' + bad.join(', '));
    if (v.currency !== currency) out.reasons.push('본질가치 통화가 가격 통화와 다름');
    if (!text(v.source) || !fresh(v.asOf, now, MAX_AGE.valuation)) out.reasons.push('본질가치 출처·기준일 누락 또는 오래됨(허용 ' + MAX_AGE.valuation + '일)');
    if (v.verification !== 'independent-verified') out.reasons.push('본질가치 추정 출처 대조 미확인');
    if (!bad.length && !(s.conservative.valuePerShare <= s.base.valuePerShare && s.base.valuePerShare <= s.optimistic.valuePerShare)) out.reasons.push('보수 ≤ 기준 ≤ 낙관 순서가 아님');
    if (Array.isArray(flags) && flags.length && !text(v.normalizationReason)) out.reasons.push('일회성 손익 존재: 정상화 근거 없음');
    if (v.fromDrawdown === true) out.reasons.push('가격 하락률을 본질가치로 대체할 수 없음');
    if (out.reasons.length) return out;
    out.assumptions = names.map(function (n) { var x = s[n]; return { scenario: n, method: x.method, discountRatePct: x.discountRatePct, growthPct: x.growthPct, normalizedFcf: x.normalizedFcf, stockCompensation: x.stockCompensation, dilutionPct: x.dilutionPct, netDebt: x.netDebt, shares: x.shares }; });
    out.conservative = s.conservative.valuePerShare; out.base = s.base.valuePerShare; out.optimistic = s.optimistic.valuePerShare;
    if (!finite(price)) { out.reasons.push('검증된 가격 없음: 안전마진 미산정'); return out; }
    out.status = 'computed';
    out.marginPct = round((1 - price / out.conservative) * 100, 1);
    var m = out.marginPct;
    out.band = m >= MOS_BANDS.TRAP ? 'value-trap-check' : m >= MOS_BANDS.PRIORITY ? 'priority' : m >= MOS_BANDS.CONDITIONAL ? 'conditional' : m >= MOS_BANDS.OBSERVE ? 'observe' : 'none';
    return out;
  }

  function research(r, now) {
    return RESEARCH.map(function (x) {
      var o = r && r[x[0]], ok = !!o && o.done === true && text(o.source) && text(o.summary) && fresh(o.asOf, now, MAX_AGE.research);
      return { id: x[0], label: x[1], ok: ok, asOf: o && o.asOf || null, source: o && o.source || null };
    });
  }

  /* 6. 실행 가능성(투자 판단과 별도). 수량·주문은 만들지 않는다. */
  function executability(ctx, sector) {
    ctx = ctx || {};
    var items = [], cap = ctx.conviction === true ? LIMIT_CONVICTION : LIMIT_OTHER;
    var cash = ctx.cash || {}, cashOK = cash.status === 'verified' && finite(cash.amount) && cash.amount > 0 && text(cash.asOf);
    items.push({ id: 'cash', label: '현금', status: cashOK ? 'ok' : 'blocked', note: cashOK ? '현금 확인 ' + cash.asOf : cash.status === 'verified' ? '현금 부족' : '현금 미확인: 수량·주문 제안 없음' });
    var floor = ctx.emergencyFloor || {};
    var floorSet = floor.status === 'set' && finite(floor.amount) && floor.amount >= 0;
    items.push({ id: 'emergency', label: '비상현금 하한', status: !floorSet ? 'unknown' : cashOK && cash.amount > floor.amount ? 'ok' : 'blocked', note: !floorSet ? '하한 미확정(순태씨 결정 필요)' : cashOK && cash.amount > floor.amount ? '하한 위 여유 있음' : '현금이 하한 이하' });
    var w = ctx.weightPct;
    items.push({ id: 'cap', label: '보유비중 상한 ' + cap + '%', status: !finite(w) ? 'unknown' : w >= cap ? 'blocked' : 'ok', note: !finite(w) ? '현재 비중 미확인' : w >= cap ? '상한 도달·초과(' + round(w) + '%)' : '여유 ' + round(cap - w) + '%p(수량 아님)' });
    var sw = ctx.sectorWeightPct, overlap = Array.isArray(ctx.sameSectorHoldings) ? ctx.sameSectorHoldings.filter(text) : [];
    items.push({ id: 'sector', label: '업종 중복', status: !text(sector) || !finite(sw) ? 'unknown' : overlap.length ? 'warn' : 'ok', note: !text(sector) || !finite(sw) ? '업종·업종 비중 미확인' : overlap.length ? sector + ' 기존 보유 ' + overlap.join(', ') + ' · 업종 ' + round(sw) + '%' : '같은 업종 보유 없음' });
    var blocked = items.some(function (x) { return x.status === 'blocked'; }), unknown = items.some(function (x) { return x.status === 'unknown'; });
    return { status: blocked ? 'blocked' : unknown ? 'unconfirmed' : 'checks-ok', cap: cap, items: items, quantity: null, order: null };
  }

  function evaluate(input, nowISO) {
    var d = clone(input) || {}, now = Date.parse(nowISO), reasons = [];
    var validNow = typeof nowISO === 'string' && /T/.test(nowISO) && finite(now);
    var schemaOK = validNow && d.contract === CONTRACT && ['KR', 'US'].includes(d.market) && text(d.ticker);
    if (!schemaOK) reasons.push('입력 계약·시장·종목·판정 시각 확인 필요');
    var nowV = validNow ? now : 0;
    var price = screenPrice(d.price, d.market, nowV);
    var currency = CCY[d.market] || null;
    var flags = Array.isArray(d.earningsFlags) ? d.earningsFlags.filter(text) : [];
    var val = valuation(d.valuation, price.status === 'fail-closed' ? null : d.price.close, currency, nowV, flags);
    var g = d.gates || {};
    var gates = GATES.map(function (x) { return gate(x[0], x[1], g[x[0]], nowV); });
    // D는 엔진이 계산한 안전마진과 일치해야 한다. 호출자의 PASS만으로 통과하지 않는다.
    var D = gates[3];
    if (val.status !== 'computed') { D.status = 'UNKNOWN'; D.reason = '안전마진 미산정: ' + val.reasons.join(' / '); }
    else if (val.marginPct < MOS_BANDS.CONDITIONAL) { D.status = 'FAIL'; D.reason = '보수적 가치 대비 안전마진 ' + val.marginPct + '% (< ' + MOS_BANDS.CONDITIONAL + '%)'; }
    else if (val.band === 'value-trap-check' && !(d.valueTrapReview && evidenceOK(d.valueTrapReview.evidence, nowV) && d.valueTrapReview.status === 'PASS')) { D.status = 'UNKNOWN'; D.reason = '안전마진 ' + val.marginPct + '%: 40% 이상은 가치함정 재검증 필요'; }
    else if (D.status !== 'PASS') { D.reason = D.reason || '안전마진 가정 근거 미확인'; }
    // C: 일회성 손익이 있으면 정상화 근거가 필요.
    if (flags.length && gates[2].status === 'PASS' && !(d.valuation && text(d.valuation.normalizationReason))) { gates[2].status = 'UNKNOWN'; gates[2].reason = '일회성 손익(' + flags.join(', ') + ') 정상화 근거 없음'; }
    // E: 반론이 없으면 PASS 불가.
    var counter = Array.isArray(d.counterArguments) ? d.counterArguments.filter(text) : [];
    var invalidation = Array.isArray(d.invalidation) ? d.invalidation.filter(text) : [];
    if (gates[4].status === 'PASS' && !counter.length) { gates[4].status = 'UNKNOWN'; gates[4].reason = '반론 검증 기록 없음'; }
    var rf = d.riskFlags || {}, riskList = ['accounting', 'liquidity', 'structural'].filter(function (k) { return rf[k] === true; });
    var riskLabels = { accounting: '회계 악화', liquidity: '유동성·차입 위험', structural: '구조적 악화' };
    var res = research(d.research, nowV), researchOK = res.every(function (x) { return x.ok; });

    var state = STATES.HOLD;
    if (!schemaOK) reasons.push('기본 정보 오류: 판단 보류');
    else if (riskList.length || gates[1].status === 'FAIL') { state = STATES.RISK; reasons.push('위험: ' + (riskList.map(function (k) { return riskLabels[k]; }).join(', ') || '유동성·차입 게이트 FAIL')); }
    else if (price.status === 'fail-closed') reasons.push('가격 증거 fail-closed: ' + price.reasons.join(' / '));
    else if (price.status === 'not-fear') { state = STATES.OBSERVE; reasons.push(price.reasons[price.reasons.length - 1]); }
    else if (gates.some(function (x) { return x.status === 'UNKNOWN'; })) reasons.push('미확인 게이트: ' + gates.filter(function (x) { return x.status === 'UNKNOWN'; }).map(function (x) { return x.id; }).join(', '));
    else if (gates.some(function (x) { return x.status === 'FAIL'; })) { state = STATES.OBSERVE; reasons.push('FAIL 게이트: ' + gates.filter(function (x) { return x.status === 'FAIL'; }).map(function (x) { return x.id + ' ' + x.label; }).join(', ')); }
    else if (!researchOK) reasons.push('4단계 조사 미완료: ' + res.filter(function (x) { return !x.ok; }).map(function (x) { return x.label; }).join(', '));
    else if (!counter.length || !invalidation.length) reasons.push('반론·무효화 조건 없음');
    else { state = val.band === 'conditional' ? STATES.CONDITIONAL : STATES.HIGH; reasons.push('5게이트 PASS · 가격 증거 · 4단계 조사 완료 · 안전마진 ' + val.marginPct + '%'); }

    var buyState = state === STATES.CONDITIONAL || state === STATES.HIGH;
    var exec = executability(d.context, d.sector);
    var freshness = [d.price && d.price.asOf].concat(gates.map(function (x) { return x.evidence.map(function (e) { return e && e.asOf; }); }).reduce(function (a, b) { return a.concat(b); }, []), res.map(function (x) { return x.asOf; }), [d.valuation && d.valuation.asOf]).filter(isoDay).sort();
    return {
      contract: CONTRACT, market: d.market || null, ticker: d.ticker || null, name: text(d.name) ? d.name : null, sector: text(d.sector) ? d.sector : null,
      synthetic: d.synthetic === true, evaluatedAt: validNow ? nowISO : null,
      state: state, buyReview: buyState, reasons: reasons,
      price: price, gates: gates, valuation: val, research: res,
      counterArguments: counter, invalidation: invalidation, riskFlags: riskList,
      executability: exec, evidenceOldest: freshness[0] || null, evidenceNewest: freshness[freshness.length - 1] || null,
      disclaimer: (state === STATES.HIGH ? "'높은 확신'은 수익 보장이 아닙니다. " : '') + '자동주문이 아닌 정보 제공이며 최종 결정은 순태씨가 합니다.'
    };
  }

  /* 7. 오늘의 매수 검토 후보(최대 5개): 매수 검토 상태만, 상태 순위 → 안전마진 순. */
  function shortlist(results) {
    return (Array.isArray(results) ? results : []).filter(function (r) { return r && r.buyReview; })
      .slice().sort(function (a, b) { return RANK[b.state] - RANK[a.state] || b.valuation.marginPct - a.valuation.marginPct || String(a.ticker).localeCompare(String(b.ticker)); })
      .slice(0, SHORTLIST);
  }

  /* 8. 알림: 처음 매수 검토가 되었거나 상태가 올라간 종목만. 같은 종목·같은 상태를 매일 새로 포장하지 않는다. */
  function key(r) { return r.market + ':' + r.ticker; }
  function notifyPlan(current, previous) {
    var prev = previous && typeof previous === 'object' ? previous : {}, fresh = [];
    shortlist(current).forEach(function (r) {
      var p = prev[key(r)];
      if (!p || !(RANK[p.state] >= RANK[r.state])) fresh.push({ key: key(r), state: r.state, previousState: p ? p.state : null, marginPct: r.valuation.marginPct });
    });
    var next = {};
    Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
    // 매수 검토에서 내려간 종목은 낮아진 상태로 기록해, 나중에 다시 조건을 충족하면 그때 한 번 알린다.
    (Array.isArray(current) ? current : []).forEach(function (r) { if (r && !r.buyReview && next[key(r)]) next[key(r)] = { state: r.state, evaluatedAt: r.evaluatedAt }; });
    shortlist(current).forEach(function (r) { next[key(r)] = { state: r.state, evaluatedAt: r.evaluatedAt }; });
    return { notify: fresh.length > 0, items: fresh, ledger: next };
  }

  return Object.freeze({ CONTRACT: CONTRACT, STATES: STATES, GATES: GATES, MOS_BANDS: MOS_BANDS, PRICE_BANDS: PRICE_BANDS, LIMIT_CONVICTION: LIMIT_CONVICTION, LIMIT_OTHER: LIMIT_OTHER, SHORTLIST: SHORTLIST, MAX_AGE: MAX_AGE,
    screenPrice: screenPrice, evaluate: evaluate, shortlist: shortlist, notifyPlan: notifyPlan });
});
