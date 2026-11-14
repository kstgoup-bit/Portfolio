/* HAS 자본배분 비교 엔진 1단계 (지시서 GPT-20261113-0024) — 순수 계산, 읽기 전용, 비실거래.
   계약 capitalAllocationInput.v1: 보유·현금·가상 매도대금을 여러 대안(현금 유지·재매수·타 종목·분산·일부 재투자)으로 나눴을 때의
   수량·비용·잔여현금·종목/업종 비중·한도 경고를 같은 가정에서 계산한다.
   - 투자기록·저장소·네트워크를 읽거나 쓰지 않는다(입력 객체만 받음, 입력을 바꾸지 않음).
   - 의견은 '시나리오 비교 가능' · '추가 정보 필요' · '판단 보류' · '비중 한도 주의' 네 가지뿐. '매수 검토'는 만들지 않는다
     (재무 연결 + 4단계 조사 확인 전에는 canBuyReview 가 항상 차단).
   - 합성 가격은 현재 시세가 아니며 교차검증 완료로 표시하지 않는다. 미래 수익률은 사용자가 입력한 가정만 계산한다.
   - 한도 초과는 경고일 뿐 매도 명령이 아니다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASCapitalAllocation = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var CONTRACT = 'capitalAllocationInput.v1';
  var OPINIONS = Object.freeze(['시나리오 비교 가능', '추가 정보 필요', '판단 보류', '비중 한도 주의']);
  var LIMIT_CONVICTION = 25, LIMIT_OTHER = 10; /* % */
  var QTY_DP = 6;

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function round(x, dp) { var m = Math.pow(10, dp), s = x < 0 ? -1 : 1; return s * Math.round(Math.abs(x) * m + 1e-9) / m; }
  function money(x) { return round(x, 2); }
  function floorQty(x) { var m = Math.pow(10, QTY_DP); return Math.floor(x * m + 1e-7) / m; }
  function pct(part, whole) { return whole > 0 ? round(part / whole * 100, 2) : null; }
  function sym(s) { return String(s == null ? '' : s).trim().toUpperCase(); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function isObj(x) { return x != null && typeof x === 'object' && !Array.isArray(x); }
  function isStr(x) { return typeof x === 'string' && x.trim() !== ''; }
  /* 시각 형식: asOf = YYYY-MM-DD 또는 오프셋 있는 ISO 시각, quoteAsOf = 오프셋(Z/±HH:MM) 있는 ISO 시각. 형식만 검사(실제 장 시각·출처 일치는 검증하지 않음). */
  var RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_ISO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
  function validDay(d) { var t = Date.parse(d + 'T00:00:00Z'); return isFinite(t) && new Date(t).toISOString().slice(0, 10) === d; }
  function isIsoTz(x) { return typeof x === 'string' && RE_ISO_TZ.test(x) && validDay(x.slice(0, 10)) && isFinite(Date.parse(x)); }
  function isAsOf(x) { return typeof x === 'string' && ((RE_DATE.test(x) && validDay(x)) || isIsoTz(x)); }
  function validTz(z) { if (!isStr(z)) return false; try { new Intl.DateTimeFormat('en-CA', { timeZone: z }); return true; } catch (e) { return false; } }
  function dayIn(iso, tz) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.parse(iso))); } catch (e) { return null; } }
  var SCEN_MIN = -100, SCEN_MAX = 1000, HORIZON_MAX = 50; /* 가정 수익률 % 범위, 지평선(년) 상한 */

  /* ── 1. 기본 산식(지시서 3절) ─────────────────────────────── */
  function computeSale(p) {
    var issues = [];
    ['soldQty', 'sellPriceUSD', 'averageCostUSD'].forEach(function (k) { if (!isNum(p[k]) || p[k] <= 0) issues.push(k + ' 값이 0 이하이거나 숫자가 아님'); });
    if (p.heldQty != null && !(isNum(p.heldQty) && p.heldQty >= 0)) issues.push('heldQty 값이 음수이거나 숫자가 아님');
    var fee = p.sellingFeesUSD == null ? 0 : p.sellingFeesUSD;
    if (!isNum(fee) || fee < 0) issues.push('sellingFeesUSD 값이 음수이거나 숫자가 아님');
    if (issues.length) return { ok: false, code: 'HOLD_INSUFFICIENT_DATA', issues: issues };
    if (isNum(p.heldQty) && p.soldQty > p.heldQty + 1e-9) return { ok: false, code: 'HOLD_CONFLICT', issues: ['보유량(' + p.heldQty + '주)보다 많이 매도(' + p.soldQty + '주)'] };
    var gross = money(p.soldQty * p.sellPriceUSD);
    if (fee > gross) return { ok: false, code: 'HOLD_CONFLICT', issues: ['매도 비용(' + fee + ')이 매도금액(' + gross + ')보다 큼'] };
    return {
      ok: true, grossSaleUSD: gross,
      grossProfitUSD: money(p.soldQty * (p.sellPriceUSD - p.averageCostUSD)),
      sellingFeesUSD: money(fee), netProceedsUSD: money(gross - fee),
      remainingQty: isNum(p.heldQty) ? round(p.heldQty - p.soldQty, QTY_DP) : null,
      feesReflected: p.sellingFeesUSD != null
    };
  }

  /* 주문 하나: 배정 현금으로 price 에 살 수 있는 수량. 비용 = 수량×가격×(1+rate) + 고정수수료(수량>0일 때만). */
  function computeBuy(p) {
    var cash = p.cashUSD, price = p.buyPriceUSD, fixed = p.buyingFeesUSD == null ? 0 : p.buyingFeesUSD, rate = p.buyingFeeRate == null ? 0 : p.buyingFeeRate;
    var issues = [];
    if (!isNum(cash) || cash < 0) issues.push('배정 현금이 음수이거나 숫자가 아님');
    if (!isNum(price) || price <= 0) issues.push('매수 가격이 0 이하이거나 숫자가 아님');
    if (!isNum(fixed) || fixed < 0) issues.push('매수 수수료가 음수이거나 숫자가 아님');
    if (!isNum(rate) || rate < 0 || rate >= 1) issues.push('매수 수수료율이 범위(0~1) 밖');
    if (issues.length) return { ok: false, code: 'HOLD_INSUFFICIENT_DATA', issues: issues };
    var spend = cash - fixed;
    if (spend <= 0) return { ok: true, qty: 0, costUSD: 0, feeUSD: 0, residualCashUSD: money(cash), note: cash > 0 ? '배정 현금이 수수료 이하 — 주문 없음' : '' };
    var raw = spend / (price * (1 + rate));
    var qty = p.fractional ? floorQty(raw) : Math.floor(raw + 1e-9);
    if (qty <= 0) return { ok: true, qty: 0, costUSD: 0, feeUSD: 0, residualCashUSD: money(cash), note: '1주 가격이 배정 현금보다 큼 — 주문 없음' };
    var gross = qty * price, fee = fixed + gross * rate, cost = money(gross + fee);
    if (cost > cash + 0.005) { qty = p.fractional ? floorQty(qty - Math.pow(10, -QTY_DP)) : qty - 1; gross = qty * price; fee = qty > 0 ? fixed + gross * rate : 0; cost = money(gross + fee); }
    return { ok: true, qty: qty, rawQty: round(raw, QTY_DP), costUSD: cost, feeUSD: money(fee), residualCashUSD: money(cash - cost) };
  }

  /* ── 2. 입력 검증 ─────────────────────────────────────────── */
  function validateInput(input) {
    var out = { status: 'OK', issues: [], missing: [], conflicts: [], notReflected: [] };
    function miss(m) { out.missing.push(m); }
    function conf(m) { out.conflicts.push(m); }
    if (!input || typeof input !== 'object') { miss('입력 없음'); out.status = 'HOLD_INSUFFICIENT_DATA'; out.issues = out.missing.slice(); return out; }
    if (input.contract !== CONTRACT) conf('계약 이름이 ' + CONTRACT + ' 가 아님');
    ['asOf', 'quoteAsOf', 'timezone', 'market', 'currency', 'source', 'dataMode', 'freshnessStatus'].forEach(function (k) { if (input[k] == null || input[k] === '') miss(k + ' 없음'); else if (!isStr(input[k])) miss(k + ' 가 문자열이 아님'); });
    /* 형식·시각 모순(엔진은 정규장 시각·출처 일치를 독립 검증하지 않음 — 형식과 앞뒤만 확인) */
    if (isStr(input.asOf) && !isAsOf(input.asOf)) miss('asOf 형식 오류(YYYY-MM-DD 또는 오프셋 있는 ISO 시각)');
    if (isStr(input.quoteAsOf) && !isIsoTz(input.quoteAsOf)) miss('quoteAsOf 형식 오류(오프셋 Z/±HH:MM 있는 ISO 시각)');
    if (isStr(input.timezone) && !validTz(input.timezone)) miss('timezone 이 유효한 IANA 시간대가 아님');
    if (isAsOf(input.asOf) && isIsoTz(input.quoteAsOf) && validTz(input.timezone)) {
      var asOfDay = RE_DATE.test(input.asOf) ? input.asOf : dayIn(input.asOf, input.timezone), qDay = dayIn(input.quoteAsOf, input.timezone);
      if (!RE_DATE.test(input.asOf) && Date.parse(input.quoteAsOf) > Date.parse(input.asOf)) conf('시세 기준시각(quoteAsOf)이 계산 기준시각(asOf)보다 늦음');
      else if (qDay && asOfDay && qDay > asOfDay) conf('시세 기준일(' + qDay + ')이 계산 기준일(' + asOfDay + ')보다 늦음');
    }
    if (input.dataMode != null && input.dataMode !== 'synthetic' && input.dataMode !== 'verified') conf('dataMode 는 synthetic 또는 verified 여야 함');
    if (input.currency != null && input.currency !== 'USD') conf('1단계는 USD 계산만 지원(입력 통화 ' + input.currency + ')');
    if (input.freshnessStatus === 'stale') conf('기준시각이 오래된 자료(stale)');
    if (input.freshnessStatus === 'conflict') conf('공급자 간 자료 충돌(conflict)');
    if (input.dataMode === 'verified' && input.freshnessStatus !== 'fresh') conf('verified 자료인데 신선도가 fresh 가 아님');
    if (input.dataMode === 'synthetic' && input.freshnessStatus === 'fresh') conf('합성 자료를 최신 시세(fresh)로 표시할 수 없음');
    var scope = input.portfolioScope || {};
    if (scope.kind !== 'overseas-account' && scope.kind !== 'total-invested') miss('portfolioScope.kind(overseas-account|total-invested) 없음');
    if (scope.kind === 'total-invested' && !(isNum(scope.otherAssetsUSD) && scope.otherAssetsUSD >= 0)) miss('전체 자산 분모에 필요한 otherAssetsUSD 없음');
    if (!isNum(input.cashUSD) || input.cashUSD < 0) miss('현금 잔액(cashUSD) 없음 또는 음수');
    var fees = input.fees || {};
    if (fees.sellingFeesUSD == null) out.notReflected.push('매도 수수료·세금 미반영');
    if (fees.buyingFeesUSD == null && fees.buyingFeeRate == null) out.notReflected.push('매수 수수료 미반영');
    var fx = input.fx || {};
    if (!isNum(fx.usdkrw)) out.notReflected.push('환율 미반영(원화 평가 산출 보류)');
    if (typeof input.fractionalAllowed !== 'boolean') miss('소수점 거래 가능 여부(fractionalAllowed) 없음');
    /* 보유 — 같은 종목이 두 번이면 가격이 같을 때만 합친다 */
    var seen = {}, mixedKinds = {};
    /* 같은 종목의 두 기록이 통화·시세종류·기준시각에서 서로 다르면 충돌. 시세종류·기준시각이 한쪽에만 있으면 같은 자료인지 알 수 없으므로 추가 정보 필요(missing)로 돌려준다.
       기준시각은 같은 순간이면 오프셋 표기가 달라도 같다고 본다. 통화는 계약상 생략 = USD. */
    function factClash(a, b, aPrice, bPrice) {
      var d = [];
      if (isNum(aPrice) && isNum(bPrice) && Math.abs(aPrice - bPrice) > 1e-9) d.push('가격 ' + aPrice + ' / ' + bPrice);
      if ((a.currency || 'USD') !== (b.currency || 'USD')) d.push('통화 ' + (a.currency || 'USD') + ' / ' + (b.currency || 'USD'));
      if (a.priceKind != null && b.priceKind != null && a.priceKind !== b.priceKind) d.push('시세종류 ' + a.priceKind + ' / ' + b.priceKind);
      if (a.quoteAsOf != null && b.quoteAsOf != null && a.quoteAsOf !== b.quoteAsOf && !(isIsoTz(a.quoteAsOf) && isIsoTz(b.quoteAsOf) && Date.parse(a.quoteAsOf) === Date.parse(b.quoteAsOf))) d.push('기준시각 ' + a.quoteAsOf + ' / ' + b.quoteAsOf);
      return d;
    }
    function oneSided(a, b) {
      var m = [];
      if ((a.priceKind == null) !== (b.priceKind == null)) m.push('시세종류');
      if ((a.quoteAsOf == null) !== (b.quoteAsOf == null)) m.push('기준시각');
      return m;
    }
    function pairCheck(a, b, aPrice, bPrice, label) {
      var d = factClash(a, b, aPrice, bPrice);
      if (d.length) { conf(label + ' 자료가 다름(' + d.join(', ') + ')'); return; }
      var m = oneSided(a, b);
      if (m.length) miss(label + ' 한쪽 기록에만 ' + m.join('·') + ' 있음 — 같은 자료인지 확인 불가');
    }
    function itemQuoteAsOf(x, label) {
      if (x.quoteAsOf == null) return;
      if (!isIsoTz(x.quoteAsOf)) miss(label + ' quoteAsOf 형식 오류');
      else if (isIsoTz(input.quoteAsOf) && Date.parse(x.quoteAsOf) !== Date.parse(input.quoteAsOf)) conf(label + ' 시세 기준시각(' + x.quoteAsOf + ')이 입력 기준시각(' + input.quoteAsOf + ')과 다름');
    }
    (Array.isArray(input.holdings) ? input.holdings : []).forEach(function (h, i) {
      if (!isObj(h)) { miss('holdings[' + i + '] 가 객체가 아님'); return; }
      var s = sym(h.symbol);
      if (!s) { miss('holdings[' + i + '] 종목 없음'); return; }
      itemQuoteAsOf(h, s);
      if ((h.currency || 'USD') !== 'USD') conf(s + ' 통화가 USD 가 아님(' + h.currency + ')');
      if (!isNum(h.qty) || h.qty < 0) miss(s + ' 수량이 음수이거나 숫자가 아님');
      if (!isNum(h.price) || h.price <= 0) miss(s + ' 현재 평가가격 없음 또는 0 이하');
      if (h.averageCost != null && (!isNum(h.averageCost) || h.averageCost <= 0)) miss(s + ' 평균단가가 0 이하이거나 숫자가 아님');
      if (h.priceKind) mixedKinds[h.priceKind] = 1;
      if (seen[s]) pairCheck(seen[s], h, seen[s].price, h.price, s + ' 가 두 번 입력됐고');
      else seen[s] = h;
    });
    if (!Array.isArray(input.holdings)) miss('holdings 없음');
    if (input.dataMode === 'verified' && Object.keys(mixedKinds).length > 1) conf('정규장·시간외 등 시세 종류가 섞임: ' + Object.keys(mixedKinds).join(', '));
    if (input.candidates != null && !Array.isArray(input.candidates)) miss('candidates 가 배열이 아님');
    /* 후보 안에서 같은 종목이 두 번이면: 가격·통화·시세종류·기준시각이 모두 같을 때만 중복으로 보고 하나로 취급, 하나라도 다르면 HOLD_CONFLICT */
    var candSeen = {};
    (Array.isArray(input.candidates) ? input.candidates : []).forEach(function (c, i) {
      if (!isObj(c)) { miss('candidates[' + i + '] 가 객체가 아님'); return; }
      var s = sym(c.symbol);
      if (!s) { miss('candidates[' + i + '] 종목 없음'); return; }
      itemQuoteAsOf(c, s + ' 후보');
      if ((c.currency || 'USD') !== 'USD') conf(s + ' 후보 통화가 USD 가 아님(' + c.currency + ')');
      if (!isNum(c.priceUSD) || c.priceUSD <= 0) miss(s + ' 후보 매수 가격 없음 또는 0 이하');
      else if (seen[s]) pairCheck(seen[s], c, seen[s].price, c.priceUSD, s + ' 보유 기록과 후보(같은 기준시각 가격이어야 함)');
      if (candSeen[s]) pairCheck(candSeen[s], c, candSeen[s].priceUSD, c.priceUSD, s + ' 후보가 두 번 입력됐고');
      else candSeen[s] = c;
    });
    if (input.convictionSymbols != null && !(Array.isArray(input.convictionSymbols) && input.convictionSymbols.every(isStr))) miss('convictionSymbols 가 문자열 배열이 아님');
    validateAlternatives(input, miss);
    validateScenarios(input, miss);
    var pr = input.partialReinvest;
    if (pr != null) {
      if (!isObj(pr)) miss('partialReinvest 가 객체가 아님');
      else {
        if (pr.share != null && !(isNum(pr.share) && pr.share > 0 && pr.share < 1)) miss('partialReinvest.share 는 0 초과 1 미만 숫자여야 함');
        if (pr.symbols != null && !(Array.isArray(pr.symbols) && pr.symbols.every(isStr))) miss('partialReinvest.symbols 가 문자열 배열이 아님');
      }
    }
    var sale = input.sale;
    if (sale != null && !isObj(sale)) { miss('sale 이 객체가 아님'); sale = null; }
    if (sale) {
      /* 매도 입력 형식 결함(종목·수량·가격 누락/비숫자)은 보유 여부와 관계없이 추가 정보 필요 */
      var ss = sym(sale.symbol), held = ss ? seen[ss] : null, saleBad = [];
      if (!isStr(sale.symbol) || !ss) saleBad.push('sale.symbol 없음 또는 문자열이 아님');
      if (!isNum(sale.qty) || sale.qty <= 0) saleBad.push('sale.qty 가 0 이하이거나 숫자가 아님');
      if (!isNum(sale.priceUSD) || sale.priceUSD <= 0) saleBad.push('sale.priceUSD 가 0 이하이거나 숫자가 아님');
      if (saleBad.length) miss(saleBad.join('; '));
      else if (!held) conf('매도 종목 ' + (ss || '(없음)') + ' 이 보유 목록에 없음');
      else {
        var r = computeSale({ soldQty: sale.qty, sellPriceUSD: sale.priceUSD, averageCostUSD: held.averageCost, heldQty: totalQty(input.holdings, ss), sellingFeesUSD: fees.sellingFeesUSD });
        if (!r.ok) (r.code === 'HOLD_CONFLICT' ? conf : miss)(r.issues.join('; '));
      }
    }
    out.status = out.conflicts.length ? 'HOLD_CONFLICT' : (out.missing.length ? 'HOLD_INSUFFICIENT_DATA' : 'OK');
    out.issues = out.conflicts.concat(out.missing);
    return out;
  }
  function totalQty(holdings, s) { return (holdings || []).reduce(function (t, h) { return isObj(h) && sym(h.symbol) === s && isNum(h.qty) ? t + h.qty : t; }, 0); }

  /* 사용자 지정 대안: 형식 오류(배열 아님·null 요소·allocations 아님·종목 없음·share 숫자 아님/NaN/Infinity)는 입력 전체를 HOLD_INSUFFICIENT_DATA.
     형식은 맞지만 음수·합계 100% 초과는 그 대안만 '판단 보류'(다른 대안 비교는 계속). */
  function validateAlternatives(input, miss) {
    var alts = input.alternatives;
    if (alts == null) return;
    if (!Array.isArray(alts)) { miss('alternatives 가 배열이 아님'); return; }
    alts.forEach(function (a, i) {
      var tag = 'alternatives[' + i + ']';
      if (!isObj(a)) { miss(tag + ' 가 객체가 아님'); return; }
      if (!Array.isArray(a.allocations)) { miss(tag + '.allocations 가 배열이 아님'); return; }
      a.allocations.forEach(function (x, j) {
        if (!isObj(x)) { miss(tag + '.allocations[' + j + '] 가 객체가 아님'); return; }
        if (!isStr(x.symbol)) miss(tag + '.allocations[' + j + '] 종목 없음');
        if (!isNum(x.share)) miss(tag + '.allocations[' + j + '] share 가 유한한 숫자가 아님');
      });
    });
  }
  /* 시나리오: 배열, 요소는 객체, horizonYears 0 초과 50 이하, returnsPct 객체, 각 값 -100% 이상 1000% 이하(그 밖은 입력 오류로 보류) */
  function validateScenarios(input, miss) {
    var sc = input.scenarios;
    if (sc == null) return;
    if (!Array.isArray(sc)) { miss('scenarios 가 배열이 아님'); return; }
    sc.forEach(function (x, i) {
      var tag = 'scenarios[' + i + ']';
      if (!isObj(x)) { miss(tag + ' 가 객체가 아님'); return; }
      if (!(isNum(x.horizonYears) && x.horizonYears > 0 && x.horizonYears <= HORIZON_MAX)) miss(tag + '.horizonYears 는 0 초과 ' + HORIZON_MAX + ' 이하 숫자여야 함');
      if (!isObj(x.returnsPct)) { miss(tag + '.returnsPct 가 객체가 아님'); return; }
      Object.keys(x.returnsPct).forEach(function (k) {
        var v = x.returnsPct[k];
        if (!(isNum(v) && v >= SCEN_MIN && v <= SCEN_MAX)) miss(tag + '.returnsPct.' + k + ' 는 ' + SCEN_MIN + '~' + SCEN_MAX + '% 숫자여야 함');
      });
    });
  }

  /* 같은 종목을 합친 보유 표(수량 합, 평균단가 가중) */
  function mergeHoldings(holdings) {
    var map = {}, order = [];
    (holdings || []).forEach(function (h) {
      var s = sym(h.symbol); if (!s) return;
      if (!map[s]) { map[s] = { symbol: s, qty: 0, costSum: 0, costKnown: true, price: h.price, sector: h.sector || '미분류', conviction: !!h.conviction }; order.push(s); }
      var m = map[s]; m.qty += h.qty;
      if (isNum(h.averageCost)) m.costSum += h.qty * h.averageCost; else m.costKnown = false;
      if (h.conviction) m.conviction = true;
      if (m.sector === '미분류' && h.sector) m.sector = h.sector;
    });
    return order.map(function (s) { var m = map[s]; return { symbol: s, qty: round(m.qty, QTY_DP), averageCost: m.costKnown && m.qty > 0 ? round(m.costSum / m.qty, 4) : null, price: m.price, sector: m.sector, conviction: m.conviction }; });
  }

  /* ── 3. 비중·업종 집중도 ──────────────────────────────────── */
  function positionWeights(positions, cashUSD, scope, convictionList) {
    var conv = {}; (convictionList || []).forEach(function (s) { conv[sym(s)] = 1; });
    var invested = positions.reduce(function (t, p) { return t + p.qty * p.price; }, 0);
    var accountTotal = invested + (cashUSD || 0);
    var other = scope && scope.kind === 'total-invested' ? (scope.otherAssetsUSD || 0) : 0;
    var denom = accountTotal + other;
    var label = scope && scope.kind === 'total-invested' ? '전체 투자자산(해외계좌 + 기타 ' + money(other) + ' USD 환산값, 사용자 입력)' : '해외계좌(보유 평가액 + 현금)';
    if (!(denom > 0)) return { ok: false, code: 'HOLD_INSUFFICIENT_DATA', issues: ['비중 분모가 0'], denominatorUSD: 0, denominatorLabel: label };
    var sectors = {}, hhi = 0, warnings = [];
    var rows = positions.filter(function (p) { return p.qty > 0; }).map(function (p) {
      var mv = money(p.qty * p.price), w = pct(p.qty * p.price, denom), isConv = !!(conv[p.symbol] || p.conviction), limit = isConv ? LIMIT_CONVICTION : LIMIT_OTHER;
      sectors[p.sector || '미분류'] = (sectors[p.sector || '미분류'] || 0) + p.qty * p.price;
      hhi += Math.pow(p.qty * p.price / denom, 2);
      if (w > limit) warnings.push({ symbol: p.symbol, weightPct: w, limitPct: limit, conviction: isConv, scope: label, text: p.symbol + ' 비중 ' + w + '% > ' + (isConv ? '확신 종목' : '일반 종목') + ' 한도 ' + limit + '% (분모: ' + label + ') — 경고일 뿐 매도 지시 아님' });
      return { symbol: p.symbol, qty: p.qty, priceUSD: p.price, marketValueUSD: mv, weightPct: w, limitPct: limit, conviction: isConv, sector: p.sector || '미분류' };
    });
    var sectorRows = Object.keys(sectors).map(function (k) { return { sector: k, valueUSD: money(sectors[k]), weightPct: pct(sectors[k], denom) }; }).sort(function (a, b) { return b.valueUSD - a.valueUSD; });
    return { ok: true, denominatorUSD: money(denom), denominatorLabel: label, cashWeightPct: pct(cashUSD || 0, denom), positions: rows, sectors: sectorRows, hhi: round(hhi, 4), limitWarnings: warnings };
  }

  /* ── 4. 대안 생성 ─────────────────────────────────────────── */
  function defaultAlternatives(input) {
    var sold = sym(input.sale && input.sale.symbol), cands = (input.candidates || []).map(function (c) { return sym(c.symbol); }).filter(function (s, i, a) { return s && s !== sold && a.indexOf(s) === i; });
    var alts = [{ id: 'A', label: 'A 전액 현금 유지', allocations: [] }];
    if (sold) alts.push({ id: 'B', label: 'B ' + sold + ' 전액 재매수', allocations: [{ symbol: sold, share: 1 }] });
    cands.forEach(function (s, i) { alts.push({ id: 'C' + (i + 1), label: 'C' + (i + 1) + ' ' + s + ' 전액 매수', allocations: [{ symbol: s, share: 1 }] }); });
    var group = (sold ? [sold] : []).concat(cands);
    if (group.length > 1) alts.push({ id: 'D', label: 'D ' + group.join('·') + ' 균등 분산', allocations: group.map(function (s) { return { symbol: s, share: 1 / group.length }; }) });
    var pr = input.partialReinvest || {}, share = isNum(pr.share) ? pr.share : 0.5, prSyms = (pr.symbols && pr.symbols.length ? pr.symbols.map(sym) : (sold ? [sold] : cands.slice(0, 1)));
    if (prSyms.length && share > 0 && share < 1) alts.push({ id: 'E', label: 'E ' + round(share * 100, 1) + '% 재투자(' + prSyms.join('·') + ') + 나머지 현금', allocations: prSyms.map(function (s) { return { symbol: s, share: share / prSyms.length }; }) });
    return alts;
  }

  function priceOf(input, s) {
    var h = (input.holdings || []).filter(function (x) { return sym(x.symbol) === s; })[0];
    if (h && isNum(h.price)) return h.price;
    var c = (input.candidates || []).filter(function (x) { return sym(x.symbol) === s; })[0];
    return c && isNum(c.priceUSD) ? c.priceUSD : null;
  }
  function metaOf(input, s) {
    var c = (input.candidates || []).filter(function (x) { return sym(x.symbol) === s; })[0] || {}, h = (input.holdings || []).filter(function (x) { return sym(x.symbol) === s; })[0] || {};
    return { sector: h.sector || c.sector || '미분류', conviction: !!(h.conviction || c.conviction) };
  }

  function runAlternative(input, alt, base, netProceeds) {
    var fees = input.fees || {}, issues = [];
    var merged = {}; (alt.allocations || []).forEach(function (a) { var s = sym(a.symbol); merged[s] = (merged[s] || 0) + (isNum(a.share) ? a.share : NaN); });
    var syms = Object.keys(merged), shareSum = syms.reduce(function (t, s) { return t + merged[s]; }, 0);
    if (syms.some(function (s) { return !isNum(merged[s]) || merged[s] < 0; }) || shareSum > 1 + 1e-9) return { id: alt.id, label: alt.label, ok: false, opinion: '판단 보류', issues: ['배정 비율이 음수·숫자 아님 또는 합계 100% 초과'] };
    var positions = base.map(function (p) { return { symbol: p.symbol, qty: p.qty, price: p.price, sector: p.sector, conviction: p.conviction, averageCost: p.averageCost }; });
    var orders = [], spent = 0, allocated = 0;
    syms.forEach(function (s) {
      var price = priceOf(input, s);
      if (!isNum(price)) { issues.push(s + ' 가격 없음'); return; }
      var cash = money(netProceeds * merged[s]); allocated += cash;
      var b = computeBuy({ cashUSD: cash, buyPriceUSD: price, buyingFeesUSD: fees.buyingFeesUSD, buyingFeeRate: fees.buyingFeeRate, fractional: !!input.fractionalAllowed });
      if (!b.ok) { issues = issues.concat(b.issues); return; }
      spent += b.costUSD;
      orders.push({ symbol: s, allocatedUSD: cash, priceUSD: price, qty: b.qty, costUSD: b.costUSD, feeUSD: b.feeUSD, residualUSD: b.residualCashUSD, note: b.note || '' });
      var pos = positions.filter(function (p) { return p.symbol === s; })[0];
      if (!pos) { var m = metaOf(input, s); pos = { symbol: s, qty: 0, price: price, sector: m.sector, conviction: m.conviction }; positions.push(pos); }
      pos.qty = round(pos.qty + b.qty, QTY_DP);
    });
    if (issues.length) return { id: alt.id, label: alt.label, ok: false, opinion: '추가 정보 필요', issues: issues };
    var saleCash = money(netProceeds - spent);
    var cashAfter = money((input.cashUSD || 0) + saleCash);
    var w = positionWeights(positions, cashAfter, input.portfolioScope, input.convictionSymbols);
    var sold = sym(input.sale && input.sale.symbol), soldQty = input.sale ? input.sale.qty : 0;
    var rebuy = orders.filter(function (o) { return o.symbol === sold; })[0];
    var investedValue = positions.reduce(function (t, p) { return t + p.qty * p.price; }, 0);
    var res = {
      id: alt.id, label: alt.label, ok: true, orders: orders,
      saleCashLeftUSD: saleCash, cashAfterUSD: cashAfter,
      investedValueUSD: money(investedValue), accountValueUSD: money(investedValue + cashAfter),
      soldSymbolNetShareChange: sold ? round((rebuy ? rebuy.qty : 0) - soldQty, QTY_DP) : null,
      weights: w,
      opinion: !w.ok ? '추가 정보 필요' : (w.limitWarnings.length ? '비중 한도 주의' : '시나리오 비교 가능'),
      risks: []
    };
    if (w.ok) {
      var top = w.positions.slice().sort(function (a, b) { return b.weightPct - a.weightPct; })[0];
      if (top) res.risks.push('가장 큰 종목 ' + top.symbol + ' ' + top.weightPct + '%');
      if (w.sectors[0]) res.risks.push('가장 큰 업종 ' + w.sectors[0].sector + ' ' + w.sectors[0].weightPct + '%');
      res.risks.push('현금 비중 ' + w.cashWeightPct + '%');
    }
    res.scenarios = scenarioValues(input, positions, cashAfter);
    return res;
  }

  /* 사용자가 직접 입력한 가정 수익률만 계산. 빠진 종목이 있으면 그 기간은 '추가 정보 필요'. */
  function scenarioValues(input, positions, cash) {
    return (Array.isArray(input.scenarios) ? input.scenarios : []).map(function (sc) {
      var r = sc && sc.returnsPct || {}, missing = [];
      var v = positions.filter(function (p) { return p.qty > 0; }).reduce(function (t, p) { var x = r[p.symbol]; if (!isNum(x)) { missing.push(p.symbol); return t; } return t + p.qty * p.price * (1 + x / 100); }, 0);
      var cr = isNum(r.CASH) ? r.CASH : 0;
      if (missing.length) return { horizonYears: sc.horizonYears, status: '추가 정보 필요', missing: missing, valueUSD: null };
      return { horizonYears: sc.horizonYears, status: '사용자 가정 계산', valueUSD: money(v + cash * (1 + cr / 100)), assumption: '사용자 입력 수익률(예측 아님)' + (isNum(r.CASH) ? '' : ', 현금 수익 0% 가정') };
    });
  }

  /* ── 5. '매수 검토' 차단 ──────────────────────────────────── */
  var RESEARCH_STEPS = ['news', 'earningsFilings', 'consensus', 'community'];
  function canBuyReview(input, symbol) {
    var s = sym(symbol), h = (input && input.holdings || []).concat(input && input.candidates || []).filter(function (x) { return sym(x.symbol) === s; })[0] || {};
    var va = h.valuationAssessment || {}, missing = [];
    if (!input || input.dataMode !== 'verified') missing.push('검증된 자료(dataMode verified) 아님');
    if (va.status !== 'verified') missing.push('재무·가치평가 미연결(valuationAssessment ' + (va.status || '없음') + ')');
    var rs = va.research || {};
    RESEARCH_STEPS.forEach(function (k) { if (!(rs[k] && rs[k].status === 'verified')) missing.push('4단계 조사 미확인: ' + k); });
    /* 1단계: 조건을 모두 갖춰도 엔진 의견 목록에는 '매수 검토'가 없다(후속 단계 범위). */
    return { allowed: false, symbol: s, missing: missing, reason: missing.length ? '재무 연결·4단계 조사 확인 전에는 매수 검토를 표시하지 않음' : '1단계 엔진은 매수 검토를 표시하지 않음(후속 단계)' };
  }

  /* ── 6. 전체 비교 ─────────────────────────────────────────── */
  function compareAlternatives(rawInput) {
    var input = clone(rawInput);
    var v = validateInput(input);
    var header = {
      contract: CONTRACT, asOf: input && input.asOf, quoteAsOf: input && input.quoteAsOf, timezone: input && input.timezone, market: input && input.market, currency: input && input.currency, source: input && input.source,
      dataMode: input && input.dataMode, freshnessStatus: input && input.freshnessStatus,
      priceVerification: input && input.dataMode === 'verified' && input.freshnessStatus === 'fresh' ? '입력이 검증됐다고 표시한 자료 — 엔진은 정규장 시각·출처 일치를 독립 검증하지 않음(실시간·교차검증 완료 아님)' : '교차검증 아님' + (input && input.dataMode === 'synthetic' ? ' — 합성 가격, 현재 시세 아님' : ''),
      engineVerification: '형식·시각 앞뒤만 확인(공급자 교차검증·정규장 시각 확인 없음)',
      notReflected: v.notReflected
    };
    if (v.status !== 'OK') return { ok: false, status: v.status, opinion: v.status === 'HOLD_CONFLICT' ? '판단 보류' : '추가 정보 필요', issues: v.issues, header: header, alternatives: [], buyReview: { allowed: false, reason: '판단 보류 상태' } };
    var fees = input.fees || {};
    var base = mergeHoldings(input.holdings);
    var sale = null, netProceeds = 0;
    if (input.sale) {
      var ss = sym(input.sale.symbol), held = base.filter(function (p) { return p.symbol === ss; })[0];
      sale = computeSale({ soldQty: input.sale.qty, sellPriceUSD: input.sale.priceUSD, averageCostUSD: held.averageCost, heldQty: held.qty, sellingFeesUSD: fees.sellingFeesUSD });
      sale.symbol = ss; sale.soldQty = input.sale.qty; sale.sellPriceUSD = input.sale.priceUSD; sale.averageCostUSD = held.averageCost;
      held.qty = sale.remainingQty; netProceeds = sale.netProceedsUSD;
      sale.taxKRW = taxBlock(input, sale);
    }
    var before = positionWeights(base, input.cashUSD + netProceeds, input.portfolioScope, input.convictionSymbols);
    var alts = (Array.isArray(input.alternatives) && input.alternatives.length ? input.alternatives : defaultAlternatives(input)).map(function (a) {
      try { return runAlternative(input, a, base, netProceeds); }
      catch (e) { return { id: a && a.id, label: a && a.label, ok: false, opinion: '판단 보류', issues: ['계산 중 예외 — 입력 형식 확인 필요'] }; }
    });
    return {
      ok: true, status: 'OK', header: header, sale: sale, afterSaleBeforeReinvest: before, alternatives: alts,
      opinions: OPINIONS.slice(),
      buyReview: canBuyReview(input, input.sale && input.sale.symbol),
      disclaimer: '비교 계산일 뿐 매매 권유가 아닙니다. 합성·사용자 입력 가격이며 결과·수익을 보장하지 않습니다. 최종 결정은 사용자.'
    };
  }

  /* USD 투자이익과 원화 세무상 양도소득은 분리. 취득·매도 시점 환율이 모두 있어야 원화 차익만 계산하고, 세액은 항상 보류. */
  function taxBlock(input, sale) {
    var fx = input.fx || {};
    if (!isNum(fx.acquisitionUsdKrw) || !isNum(fx.saleUsdKrw) || fx.acquisitionUsdKrw <= 0 || fx.saleUsdKrw <= 0) return { status: '산출 보류', reason: '취득·매도 시점 원화환산 근거(환율) 없음' };
    var gainKrw = Math.round(sale.soldQty * sale.sellPriceUSD * fx.saleUsdKrw - sale.soldQty * sale.averageCostUSD * fx.acquisitionUsdKrw);
    return { status: '원화 차익만 계산(세액 산출 보류)', gainKRW: gainKrw, reason: '세율·기본공제·비용 반영 규칙 미연결' };
  }

  return Object.freeze({ CONTRACT: CONTRACT, OPINIONS: OPINIONS, LIMIT_CONVICTION: LIMIT_CONVICTION, LIMIT_OTHER: LIMIT_OTHER, computeSale: computeSale, computeBuy: computeBuy, validateInput: validateInput, mergeHoldings: mergeHoldings, positionWeights: positionWeights, defaultAlternatives: defaultAlternatives, canBuyReview: canBuyReview, compareAlternatives: compareAlternatives });
});
