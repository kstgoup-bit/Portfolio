/* HAS 24단계 — 포폴앱 보유자료 "읽기 전용" 추출기(순수 함수).
   입력은 저장소 객체가 아니라 getter 함수(key→문자열|null) 또는 {key:값} 사본이다. 그래서 쓰기·삭제를 할 수 없다(구조적 보장).
   출력은 깊게 동결된 사본이며, 원본 배열·객체를 변경하지 않는다. 앱의 현재가는 사용자가 입력했거나 미검증이므로
   '시세'로 취급하지 않고 비중 계산용 평가액으로만 쓰며(basis 표기), AI 판단에는 종목·비중·현금만 전달한다(minimalForAdvisor). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASPortfolioReader = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ACCOUNTS = Object.freeze([['v5_gen', 'gen', '일반'], ['v5_dom', 'dom', 'ISA'], ['v5_ov', 'ov', '해외'], ['v5_pen', 'pen', '연금']]);
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { deepFreeze(o[k]); }); } return o; }
  function get(src, key) { var v = typeof src === 'function' ? src(key) : (src ? src[key] : undefined); return v === undefined ? null : v; }
  function parseJson(v) { if (v === null) return { ok: true, value: null }; if (typeof v !== 'string') return { ok: true, value: v }; try { return { ok: true, value: JSON.parse(v) }; } catch (e) { return { ok: false, value: null }; } }

  /* opts: {basis:'real'|'synthetic'(필수 아님, 기본 'real' 로 가정하지 않고 'unspecified'), asOf:ISO} */
  function read(src, opts) {
    var o = opts || {}, issues = [], basis = o.basis === 'synthetic' ? 'synthetic' : (o.basis === 'real' ? 'real' : 'unspecified');
    var fxRaw = Number(get(src, 'v5_fx')), fx = fin(fxRaw) && fxRaw >= 300 && fxRaw <= 5000 ? fxRaw : null; if (!fx) issues.push('환율이 없거나 비정상(' + (get(src, 'v5_fx') === null ? '없음' : '값 확인 필요') + ') — 해외 평가액은 계산하지 않음');
    var holdings = [], accounts = [], cashKRW = 0, total = 0, missingFields = 0, zeroQty = 0, noAvg = 0, cashRecorded = false, cashMissing = [], spearKRW = 0, shieldKRW = 0;
    ACCOUNTS.forEach(function (a) {
      var p = parseJson(get(src, a[0])), list = p.value;
      if (!p.ok || (list !== null && !Array.isArray(list))) { issues.push(a[2] + ' 계좌 자료 손상 — 제외'); accounts.push({ id: a[1], label: a[2], ok: false, valueKRW: null, cashKRW: null }); return; }
      if (list === null) { accounts.push({ id: a[1], label: a[2], ok: true, empty: true, valueKRW: 0, cashKRW: 0 }); return; }
      var av = 0, ac = 0, usd = a[1] === 'ov', hasDep = false, hasHold = false;
      list.forEach(function (s) {
        var isCash = !!s && typeof s.ticker === 'string' && /^DEP_/.test(s.ticker);
        if (!s || typeof s.ticker !== 'string' || !fin(s.quantity) || !fin(s.currentPrice) || s.quantity < 0 || s.currentPrice < 0) { missingFields++; return; }
        if (s.quantity === 0 && !isCash) { zeroQty++; return; }
        var raw = s.quantity * s.currentPrice, krw = usd ? (fx ? raw * fx : null) : raw;
        if (krw === null) { missingFields++; return; }
        var role = s.role === 'shield' || isCash ? 'shield' : 'spear'; av += krw; if (role === 'shield') shieldKRW += krw; else spearKRW += krw;
        if (isCash) { ac += krw; cashRecorded = true; hasDep = true; }
        else { hasHold = true; var avg = fin(s.avgPrice) && s.avgPrice > 0 ? s.avgPrice : null; if (avg === null) noAvg++; holdings.push({ account: a[1], ticker: s.ticker, market: usd ? 'US' : 'KR', quantity: s.quantity, avgPrice: avg, role: role, valueKRW: Math.round(krw) }); }
      });
      total += av; cashKRW += ac; if (hasHold && !hasDep) cashMissing.push(a[2]); accounts.push({ id: a[1], label: a[2], ok: true, valueKRW: Math.round(av), cashKRW: Math.round(ac), depositRecorded: hasDep });
    });
    var cma = Number(get(src, 'v5_cma_amount')); if (fin(cma) && cma > 0) { cashKRW += cma; total += cma; shieldKRW += cma; cashRecorded = true; }
    if (missingFields) issues.push('필드가 빠지거나 값이 잘못된 종목 ' + missingFields + '건 제외'); if (zeroQty) issues.push('수량 0 종목 ' + zeroQty + '건은 보유로 보지 않음'); if (noAvg) issues.push('매입단가 없는 종목 ' + noAvg + '건 — 손익 판단 불가');
    if (!cashRecorded) issues.push('예수금·CMA 기록 없음 — 현금 비중은 미확인'); else if (cashMissing.length) issues.push('예수금 기록이 없는 계좌: ' + cashMissing.join('·') + ' — 현금 비중은 기록된 금액 기준(실제는 더 클 수 있음)');
    var pct = function (v) { return total > 0 ? Math.round(v / total * 1000) / 10 : null; };
    holdings.forEach(function (h) { h.weightPct = pct(h.valueKRW); });
    var okAll = accounts.every(function (a) { return a.ok; }) && !missingFields && !!fx;
    return deepFreeze({ basis: basis, asOf: o.asOf || null, readOnly: true, priceBasis: 'app-entered-unverified', fx: fx, totalKRW: Math.round(total), cashKRW: Math.round(cashKRW), cashRecorded: cashRecorded, cashMissingAccounts: cashMissing, cashPct: cashRecorded ? pct(cashKRW) : null, spearPct: pct(spearKRW), shieldPct: pct(shieldKRW), zeroQty: zeroQty, noAvg: noAvg,
      accounts: accounts, holdings: holdings, complete: okAll, issues: issues });
  }
  /* AI에 넘기는 최소 정보: 종목코드·시장·비중·현금 비중만. 이름·수량·평단·계좌 상세·메모는 전달하지 않는다. */
  function minimalForAdvisor(p) {
    return deepFreeze({ basis: p.basis, asOf: p.asOf, complete: p.complete, cashPct: p.cashPct, weightBasis: 'app-entered',
      holdings: p.holdings.map(function (h) { return { ticker: h.ticker, market: h.market, weightPct: h.weightPct }; }) });
  }
  return Object.freeze({ read: read, minimalForAdvisor: minimalForAdvisor });
});
