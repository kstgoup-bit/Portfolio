/* 생성 파일 — 직접 고치지 말 것. node tools/build-invest-lab.cjs 로 재생성. 원본: invest/format.js, invest/ledger.js, invest/risk.js, invest/backtest.js, backup/core.js */
/* ---- invest/format.js ---- */
/* KST (stage15): 휴대폰 화면용 숫자 표기. 순수. 값이 없으면 "자료 부족"(0 으로 보이게 하지 않는다). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTFormat = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fin = x => typeof x === 'number' && Number.isFinite(x), NA = '자료 부족';
  const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function krw(x) { if (!fin(x)) return NA; const r = Math.round(Math.abs(x)); return (x < 0 && r !== 0 ? '-' : '') + group(r) + '원'; }
  /* 1억 이상은 "3억 2,150만원" 처럼 읽기 쉽게. 만 단위 미만은 반올림(표시용). */
  function krwCompact(x) {
    if (!fin(x)) return NA; const neg = x < 0, v = Math.round(Math.abs(x)); if (v < 10000) return krw(x);
    const eok = Math.floor(v / 100000000), man = Math.round((v % 100000000) / 10000); let e = eok, m = man; if (m === 10000) { e += 1; m = 0; }
    const body = (e ? group(e) + '억' + (m ? ' ' + group(m) + '만' : '') : group(m) + '만') + '원'; return (neg ? '-' : '') + body;
  }
  function pct(x, d = 1, { sign = false } = {}) { if (!fin(x)) return NA; const s = x.toFixed(d); const z = Number(s) === 0; return (sign && x > 0 && !z ? '+' : '') + (z && s[0] === '-' ? s.slice(1) : s) + '%'; }
  function pp(x, d = 1) { if (!fin(x)) return NA; return (x > 0 ? '+' : '') + x.toFixed(d) + '%p'; }
  function qty(x) { if (!fin(x)) return NA; return Number.isInteger(x) ? group(x) : String(Number(x.toFixed(6))); }
  return { NA, krw, krwCompact, pct, pp, qty };
});
/* ---- invest/ledger.js ---- */
/* KST (stage15) A: 투자기록 손익 계산 엔진. 순수 함수 — 저장소·네트워크·타이머·앱 연결 없음. 입력은 변경하지 않는다.
   방식: 이동평균법(원화 기준 취득원가). 수수료·세금은 "기록된 실제 금액"만 사용하고 추정하지 않는다. 자료가 모자라면 값을 만들지 않고 null/계산 불가로 둔다.
   앱은 종목별 합계(수량·평균단가·현재가)만 저장하고 개별 거래 이력을 저장하지 않으므로, 실현손익은 거래기록(이 모듈의 trades)이 있어야만 계산된다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTLedger = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ACCOUNTS = Object.freeze(['gen', 'dom', 'ov', 'pen']);
  const ACCOUNT_LABEL = Object.freeze({ gen: '일반', dom: '국내', ov: '해외', pen: '연금' });
  const TYPES = Object.freeze(['buy', 'sell', 'split', 'dividend', 'rename', 'deposit', 'withdrawal']);
  const EPS = 1e-9;
  const fin = x => typeof x === 'number' && Number.isFinite(x);
  const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  const key = (a, t) => a + '|' + t;
  const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

  /* 세금 처리 구분: 사실로 확정하지 않는 항목은 문구로만 남긴다. */
  function taxTreatment(account, market) {
    if (account === 'pen') return { kind: 'deferred', text: '연금계좌: 매매차익 과세이연(인출 시 과세). 인출 세금은 추정하지 않음' };
    if (account === 'ov' || market === 'US') return { kind: 'overseas-cgt', text: '해외주식 양도차익은 연 단위 손익통산 후 과세 대상 — 세율·공제는 사용자 확인 필요(추정치로만 표시)' };
    return { kind: 'domestic', text: '국내 상장주식: 과세 여부가 대주주 요건 등에 따라 다름 — 확정하지 않음. 기록된 세금(거래세 등)만 사용' };
  }

  function validateEvent(e, i, seen) {
    const bad = (code, message) => ({ index: i, id: e && e.id, code, message });
    if (!e || typeof e !== 'object') return bad('shape', '기록 형식 오류');
    if (typeof e.id !== 'string' || !e.id.trim()) return bad('id', 'id 필요');
    if (seen.has(e.id)) return bad('duplicate-id', '중복 id: ' + e.id);
    if (!TYPES.includes(e.type)) return bad('type', '지원하지 않는 유형: ' + e.type);
    if (!day(e.date)) return bad('date', '날짜 형식 오류');
    if (!ACCOUNTS.includes(e.account)) return bad('account', '계좌 오류(gen|dom|ov|pen)');
    if (e.type === 'deposit' || e.type === 'withdrawal') return fin(e.amount) && e.amount > 0 ? null : bad('amount', '금액은 0보다 커야 함');
    if (typeof e.ticker !== 'string' || !e.ticker.trim()) return bad('ticker', '종목코드 필요');
    if (e.type === 'rename') return typeof e.newTicker === 'string' && e.newTicker.trim() && e.newTicker !== e.ticker ? null : bad('rename', '새 종목코드 필요');
    if (e.type === 'split') return fin(e.ratio) && e.ratio > 0 && e.ratio !== 1 ? null : bad('ratio', '분할 비율은 0보다 커야 하며 1이 아님');
    if (!['KRW', 'USD'].includes(e.currency)) return bad('currency', '통화(KRW|USD)');
    if (e.currency === 'USD' ? !(fin(e.fx) && e.fx > 0) : (e.fx !== undefined && e.fx !== null && e.fx !== 1)) return bad('fx', e.currency === 'USD' ? 'USD 거래는 환율(fx>0) 필요' : 'KRW 거래의 fx는 1 또는 생략');
    if (e.type === 'dividend') { if (!(fin(e.amount) && e.amount > 0)) return bad('amount', '배당금 오류'); if (e.withholding !== undefined && !(fin(e.withholding) && e.withholding >= 0 && e.withholding <= e.amount)) return bad('withholding', '원천징수 오류'); return null; }
    if (!(fin(e.qty) && e.qty > 0)) return bad('qty', '수량은 0보다 커야 함');
    if (!(fin(e.price) && e.price > 0)) return bad('price', '가격은 0보다 커야 함');
    for (const k of ['fee', 'tax']) if (e[k] !== undefined && !(fin(e[k]) && e[k] >= 0)) return bad(k, k + ' 오류');
    return null;
  }

  function compute(events, { feeOnBuy = 'capitalize' } = {}) {
    const out = { ok: true, errors: [], warnings: [], positions: [], realized: [], dividends: [], cashFlows: [], tradeFlows: [], meta: { method: 'moving-average-krw', feeOnBuy, taxEstimated: false } };
    if (!Array.isArray(events)) { out.ok = false; out.errors.push({ index: -1, code: 'shape', message: '거래 목록이 배열이 아님' }); return out; }
    if (!['capitalize', 'expense'].includes(feeOnBuy)) { out.ok = false; out.errors.push({ index: -1, code: 'option', message: 'feeOnBuy 옵션 오류' }); return out; }
    const seen = new Set(), valid = [];
    events.forEach((e, i) => { const err = validateEvent(e, i, seen); if (err) { out.ok = false; out.errors.push(err); } else { seen.add(e.id); valid.push({ e, i }); } });
    valid.sort((x, y) => x.e.date < y.e.date ? -1 : x.e.date > y.e.date ? 1 : x.i - y.i);
    const pos = new Map(), broken = new Set(), sameDay = new Map();
    const get = (a, t, cur) => { const k = key(a, t); if (!pos.has(k)) pos.set(k, { account: a, ticker: t, currency: cur || null, qty: 0, costKRW: 0, costLocal: 0, realizedKRW: 0, realizedLocal: 0, dividendsKRW: 0, withholdingKRW: 0, feesKRW: 0, taxesKRW: 0, buyOutlayKRW: 0, sellProceedsKRW: 0, firstDate: null, lastDate: null, calculable: true, issues: [] }); return pos.get(k); };
    const fail = (p, e, i, code, message) => { out.ok = false; out.errors.push({ index: i, id: e.id, code, message }); p.calculable = false; p.issues.push(message); broken.add(key(p.account, p.ticker)); };
    for (const { e, i } of valid) {
      if (e.type === 'deposit' || e.type === 'withdrawal') { out.cashFlows.push({ id: e.id, date: e.date, account: e.account, amount: e.type === 'deposit' ? e.amount : -e.amount }); continue; }
      if (e.type === 'rename') {
        const from = key(e.account, e.ticker), to = key(e.account, e.newTicker);
        if (!pos.has(from)) { out.warnings.push({ index: i, id: e.id, code: 'rename-empty', message: '보유 없는 종목의 종목 변경은 무시됨' }); continue; }
        if (pos.has(to) && pos.get(to).qty > EPS) { fail(pos.get(from), e, i, 'rename-collision', '종목 변경 대상 코드에 이미 보유가 있음'); continue; }
        const p = pos.get(from); pos.delete(from); p.ticker = e.newTicker; pos.set(to, p); if (broken.has(from)) { broken.delete(from); broken.add(to); } p.issues.push('종목 변경 ' + e.ticker + '→' + e.newTicker + ' (' + e.date + ')'); continue;
      }
      const p = get(e.account, e.ticker, e.currency); const k = key(p.account, p.ticker);
      if (broken.has(k)) continue;   // 앞선 오류가 있는 종목은 이후 기록을 신뢰할 수 없어 계산하지 않는다
      if (p.currency && e.type !== 'split' && e.currency !== p.currency) { fail(p, e, i, 'currency-change', '같은 종목에서 통화가 바뀜'); continue; }
      if (e.type === 'split') {
        if (p.qty <= EPS) { out.warnings.push({ index: i, id: e.id, code: 'split-empty', message: '보유 없는 종목의 분할은 적용되지 않음' }); continue; }
        p.qty *= e.ratio; p.lastDate = e.date; p.issues.push('분할 x' + e.ratio + ' (' + e.date + ')'); if (e.ratio < 1 && Math.abs(p.qty - Math.round(p.qty)) > 1e-6) out.warnings.push({ index: i, id: e.id, code: 'fractional', message: '병합 후 소수 수량 — 단주 현금 정산은 반영하지 않음' }); continue;
      }
      const fx = e.currency === 'USD' ? e.fx : 1;
      if (e.type === 'dividend') {
        const w = e.withholding || 0, netKRW = (e.amount - w) * fx; p.dividendsKRW += netKRW; p.withholdingKRW += w * fx; p.lastDate = e.date;
        out.dividends.push({ id: e.id, date: e.date, account: e.account, ticker: e.ticker, netKRW, grossKRW: e.amount * fx, withholdingKRW: w * fx }); out.tradeFlows.push({ date: e.date, amount: netKRW, kind: 'dividend', account: e.account }); continue;
      }
      const fee = e.fee || 0, tax = e.tax || 0, gross = e.qty * e.price;
      if (p.firstDate === null) p.firstDate = e.date; p.lastDate = e.date;
      if (e.type === 'buy') {
        const capFee = feeOnBuy === 'capitalize' ? fee : 0;
        p.qty += e.qty; p.costLocal += gross + capFee; p.costKRW += (gross + capFee) * fx; p.feesKRW += fee * fx; p.taxesKRW += tax * fx; p.buyOutlayKRW += (gross + fee + tax) * fx;
        out.tradeFlows.push({ date: e.date, amount: -(gross + fee + tax) * fx, kind: 'buy', account: e.account }); continue;
      }
      // sell
      if (e.qty > p.qty + EPS) { fail(p, e, i, 'over-sell', '보유 수량(' + p.qty + ')보다 많이 매도: ' + e.qty); continue; }
      const avgKRW = p.costKRW / p.qty, avgLocal = p.costLocal / p.qty, removedKRW = avgKRW * e.qty, removedLocal = avgLocal * e.qty;
      const proceedsKRW = (gross - fee - tax) * fx, proceedsLocal = gross - fee - tax;
      const rk = proceedsKRW - removedKRW, rl = proceedsLocal - removedLocal;
      p.realizedKRW += rk; p.realizedLocal += rl; p.sellProceedsKRW += proceedsKRW; p.feesKRW += fee * fx; p.taxesKRW += tax * fx;
      p.qty -= e.qty; p.costKRW -= removedKRW; p.costLocal -= removedLocal; if (p.qty <= EPS) { p.qty = 0; p.costKRW = 0; p.costLocal = 0; }
      out.realized.push({ id: e.id, date: e.date, account: e.account, ticker: e.ticker, qty: e.qty, proceedsKRW, costKRW: removedKRW, realizedKRW: rk, realizedLocal: rl, currency: e.currency, taxTreatment: taxTreatment(e.account, e.currency === 'USD' ? 'US' : 'KR').kind });
      out.tradeFlows.push({ date: e.date, amount: proceedsKRW, kind: 'sell', account: e.account });
      const sk = k + '|' + e.date; sameDay.set(sk, (sameDay.get(sk) || 0) + 1);
    }
    for (const { e } of valid) if (e.type === 'buy') { const sk = key(e.account, e.ticker) + '|' + e.date; if (sameDay.has(sk)) { out.warnings.push({ id: e.id, code: 'same-day-buy-sell', message: e.ticker + ' ' + e.date + ' 같은 날 매수·매도 — 입력 순서대로 계산(체결 순서 미확인)' }); sameDay.delete(sk); } }
    out.positions = [...pos.values()].sort((a, b) => (a.account + a.ticker) < (b.account + b.ticker) ? -1 : 1).map(p => ({ ...p, avgKRW: p.qty > EPS ? p.costKRW / p.qty : null, avgLocal: p.qty > EPS ? p.costLocal / p.qty : null, open: p.qty > EPS }));
    return out;
  }

  /* 평가: 가격·환율이 없으면 해당 항목은 null(자료 부족)로 두고 합계는 complete=false 로 표시한다. */
  function valuate(result, { prices = {}, fxUsd = null } = {}) {
    const rows = []; let mv = 0, un = 0, cost = 0, missing = 0, realized = 0, divs = 0, buy = 0;
    for (const p of result.positions) {
      realized += p.realizedKRW; divs += p.dividendsKRW; buy += p.buyOutlayKRW;
      const r = { account: p.account, ticker: p.ticker, qty: p.qty, currency: p.currency, avgKRW: p.avgKRW, avgLocal: p.avgLocal, costKRW: p.costKRW, realizedKRW: p.realizedKRW, dividendsKRW: p.dividendsKRW, calculable: p.calculable, priceLocal: null, valueKRW: null, unrealizedKRW: null, unrealizedLocal: null, unrealizedPct: null, status: 'ok', issues: p.issues.slice() };
      if (!p.calculable) { r.status = '계산 불가(기록 오류)'; rows.push(r); missing++; continue; }
      if (!p.open) { rows.push(r); continue; }
      const price = prices[key(p.account, p.ticker)] ?? prices[p.ticker];
      if (!fin(price) || price <= 0) { r.status = '자료 부족(현재가 없음)'; rows.push(r); missing++; cost += p.costKRW; continue; }
      if (p.currency === 'USD' && !(fin(fxUsd) && fxUsd > 0)) { r.status = '자료 부족(환율 없음)'; rows.push(r); missing++; cost += p.costKRW; continue; }
      const fxn = p.currency === 'USD' ? fxUsd : 1; r.priceLocal = price; r.valueKRW = p.qty * price * fxn; r.unrealizedKRW = r.valueKRW - p.costKRW; r.unrealizedLocal = p.qty * price - p.costLocal; r.unrealizedPct = p.costKRW > 0 ? r.unrealizedKRW / p.costKRW * 100 : null;
      mv += r.valueKRW; un += r.unrealizedKRW; cost += p.costKRW; rows.push(r);
    }
    const complete = missing === 0 && result.ok;
    const totalPnL = complete ? un + realized + divs : null;
    return { rows, totals: { valueKRW: complete ? mv : null, costKRW: cost, unrealizedKRW: complete ? un : null, realizedKRW: realized, dividendsKRW: divs, totalPnLKRW: totalPnL, buyOutlayKRW: buy,
      simpleReturnPct: complete && buy > 0 ? totalPnL / buy * 100 : null, simpleReturnLabel: '총손익 ÷ 총 매수금액 (현금흐름·보유기간 반영 전)', complete, missingCount: missing, partialValueKRW: mv } };
  }

  /* XIRR: 매수/매도/배당 현금흐름 + 평가 시점 평가액. 수렴 못하면 null. */
  function xirr(flows, { guess = 0.1 } = {}) {
    if (!Array.isArray(flows) || flows.length < 2 || !flows.every(f => day(f.date) && fin(f.amount))) return { ok: false, reason: '현금흐름 형식 오류/부족' };
    const hasPos = flows.some(f => f.amount > 0), hasNeg = flows.some(f => f.amount < 0); if (!hasPos || !hasNeg) return { ok: false, reason: '유입·유출이 모두 있어야 계산 가능' };
    const t0 = flows.reduce((m, f) => f.date < m ? f.date : m, flows[0].date), f = r => flows.reduce((s, c) => s + c.amount / Math.pow(1 + r, daysBetween(t0, c.date) / 365), 0);
    let lo = -0.9999, hi = 10; let flo = f(lo), fhi = f(hi);
    if (!(fin(flo) && fin(fhi)) || flo * fhi > 0) return { ok: false, reason: '해가 구간(-99.99%~1000%) 밖이거나 없음' };
    for (let i = 0; i < 300; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (!fin(fm)) return { ok: false, reason: '수렴 실패' }; if (Math.abs(fm) < 1e-9 || (hi - lo) < 1e-14) return { ok: true, rate: mid, ratePct: mid * 100, iterations: i + 1, label: 'XIRR(연환산, 365일 기준)' }; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
    return { ok: true, rate: (lo + hi) / 2, ratePct: (lo + hi) * 50, iterations: 300, label: 'XIRR(연환산, 365일 기준)' };
  }
  function xirrOf(result, valuation, asOf) {
    if (!result.ok || !valuation.totals.complete) return { ok: false, reason: '기록 오류 또는 평가 자료 부족' };
    if (!day(asOf)) return { ok: false, reason: '기준일 형식 오류' };
    const last = result.tradeFlows.reduce((m, f) => f.date > m ? f.date : m, '0000-00-00'); if (asOf < last) return { ok: false, reason: '기준일이 마지막 거래일보다 이름' };
    const flows = result.tradeFlows.map(f => ({ date: f.date, amount: f.amount })); if (valuation.totals.valueKRW > 0) flows.push({ date: asOf, amount: valuation.totals.valueKRW });
    return xirr(flows);
  }
  /* TWR: 평가 시점 목록(valuations) + 외부 입출금(flows, 입금 +). 평가액 V_i 는 해당일 입출금 반영 후. r_i = (V_i - F_i)/V_{i-1} - 1 */
  function twr(valuations, flows = []) {
    if (!Array.isArray(valuations) || valuations.length < 2 || !valuations.every(v => day(v.date) && fin(v.value) && v.value >= 0)) return { ok: false, reason: '평가 시점 2개 이상 필요/형식 오류' };
    const vs = valuations.slice().sort((a, b) => a.date < b.date ? -1 : 1); for (let i = 1; i < vs.length; i++) if (vs[i].date === vs[i - 1].date) return { ok: false, reason: '같은 날 평가가 중복됨' };
    const periods = []; let g = 1;
    for (let i = 1; i < vs.length; i++) {
      const F = flows.filter(f => day(f.date) && fin(f.amount) && f.date > vs[i - 1].date && f.date <= vs[i].date).reduce((s, f) => s + f.amount, 0);
      if (vs[i - 1].value <= 0) return { ok: false, reason: vs[i - 1].date + ' 평가액이 0 이하라 하위기간 수익률 계산 불가' };
      const r = (vs[i].value - F) / vs[i - 1].value - 1; periods.push({ from: vs[i - 1].date, to: vs[i].date, flow: F, returnPct: r * 100 }); g *= 1 + r;
    }
    return { ok: true, twrPct: (g - 1) * 100, periods, label: 'TWR(시간가중, 입출금은 기간 말 발생 가정)' };
  }

  /* 해외주식 양도세 "추정": 연 단위 손익통산. 세율·공제는 사용자 입력이며 기본값은 확인되지 않은 가정이다. */
  function estimateOverseasTax(result, { rate = 0.22, deductionKRW = 2500000 } = {}) {
    if (!(fin(rate) && rate >= 0 && rate < 1) || !(fin(deductionKRW) && deductionKRW >= 0)) return { ok: false, reason: '세율/공제 입력 오류' };
    const years = {}; for (const r of result.realized) if (r.taxTreatment === 'overseas-cgt') { const y = r.date.slice(0, 4); years[y] = (years[y] || 0) + r.realizedKRW; }
    const rows = Object.entries(years).sort().map(([y, net]) => { const taxable = Math.max(0, net - deductionKRW); return { year: y, netRealizedKRW: net, taxableKRW: taxable, estimatedTaxKRW: taxable * rate }; });
    return { ok: true, estimated: true, params: { rate, deductionKRW, source: '사용자 입력/미확인 가정' }, rows, note: '추정치: 세법 개정·신고 방식·환율 적용 기준에 따라 실제와 다를 수 있음. 확정 세액 아님.' };
  }

  /* 앱 보유 현황(수량·평균단가·현재가)을 읽기 전용으로 변환. 거래 이력이 없으므로 실현손익은 "계산 불가". */
  function fromAppHoldings(stocks, account, { fxUsd = null } = {}) {
    if (!ACCOUNTS.includes(account) || !Array.isArray(stocks)) return { ok: false, rows: [], reason: '입력 오류' };
    const cur = account === 'ov' ? 'USD' : 'KRW';
    const rows = stocks.filter(s => s && fin(s.quantity) && s.quantity > 0).map(s => {
      const okAvg = fin(s.avgPrice) && s.avgPrice > 0, okCur = fin(s.currentPrice) && s.currentPrice > 0;
      const fxn = cur === 'USD' ? (fin(fxUsd) && fxUsd > 0 ? fxUsd : null) : 1;
      const r = { account, ticker: String(s.ticker), name: s.name, qty: s.quantity, currency: cur, avgLocal: okAvg ? s.avgPrice : null, priceLocal: okCur ? s.currentPrice : null, realizedKRW: null, realizedNote: '거래 이력 없음 — 계산 불가/자료 부족', valueKRW: null, costKRWApprox: null, unrealizedLocal: null, unrealizedPct: null, notes: [] };
      if (okCur && fxn) r.valueKRW = s.quantity * s.currentPrice * fxn; else r.notes.push(!okCur ? '현재가 없음' : 'USD 환율 없음');
      if (okAvg && okCur) { r.unrealizedLocal = s.quantity * (s.currentPrice - s.avgPrice); r.unrealizedPct = (s.currentPrice / s.avgPrice - 1) * 100; } else r.notes.push(!okAvg ? '평균단가 없음' : '현재가 없음');
      if (okAvg && fxn) { r.costKRWApprox = s.quantity * s.avgPrice * fxn; if (cur === 'USD') r.notes.push('원화 취득원가는 현재 환율 근사(매수 시점 환율 미보관)'); }
      return r;
    });
    return { ok: true, rows, account };
  }
  function reconcile(ledgerPositions, appRows, { qtyTol = 1e-6, avgTolPct = 0.5 } = {}) {
    const L = new Map(ledgerPositions.filter(p => p.open).map(p => [key(p.account, p.ticker), p])), A = new Map(appRows.map(r => [key(r.account, r.ticker), r])), out = [];
    for (const k of new Set([...L.keys(), ...A.keys()])) {
      const l = L.get(k), a = A.get(k);
      if (l && !a) out.push({ key: k, status: 'missing-in-app', ledgerQty: l.qty }); else if (!l && a) out.push({ key: k, status: 'missing-in-ledger', appQty: a.qty });
      else if (Math.abs(l.qty - a.qty) > qtyTol) out.push({ key: k, status: 'qty-mismatch', ledgerQty: l.qty, appQty: a.qty });
      else if (a.avgLocal && l.avgLocal && Math.abs(l.avgLocal / a.avgLocal - 1) * 100 > avgTolPct) out.push({ key: k, status: 'avg-mismatch', ledgerAvg: l.avgLocal, appAvg: a.avgLocal, diffPct: (l.avgLocal / a.avgLocal - 1) * 100 });
      else out.push({ key: k, status: 'match' });
    }
    return out.sort((x, y) => x.key < y.key ? -1 : 1);
  }

  /* 가져오기/내보내기. 원본은 변경하지 않으며 id 기준 병합 시 충돌은 덮어쓰지 않고 보고한다. */
  const CSV_COLS = Object.freeze(['id', 'type', 'date', 'account', 'ticker', 'name', 'qty', 'price', 'currency', 'fx', 'fee', 'tax', 'ratio', 'amount', 'withholding', 'newTicker']);
  const NUM_COLS = new Set(['qty', 'price', 'fx', 'fee', 'tax', 'ratio', 'amount', 'withholding']);
  function splitCsvLine(line) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; }
  function parseTradeCsv(text) {
    if (typeof text !== 'string') return { ok: false, errors: [{ row: 0, message: '텍스트 아님' }], trades: [] };
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== ''); if (!lines.length) return { ok: false, errors: [{ row: 0, message: '빈 파일' }], trades: [] };
    const head = splitCsvLine(lines[0]).map(h => h.trim()), errors = [], trades = [];
    for (const h of head) if (!CSV_COLS.includes(h)) errors.push({ row: 1, message: '알 수 없는 열: ' + h });
    for (const need of ['id', 'type', 'date', 'account']) if (!head.includes(need)) errors.push({ row: 1, message: '필수 열 없음: ' + need });
    if (errors.length) return { ok: false, errors, trades: [] };
    lines.slice(1).forEach((ln, n) => {
      const cells = splitCsvLine(ln); if (cells.length !== head.length) { errors.push({ row: n + 2, message: '열 개수 불일치' }); return; }
      const o = {}; head.forEach((h, j) => { const v = cells[j].trim(); if (v === '') return; if (NUM_COLS.has(h)) { if (!/^-?\d+(\.\d+)?$/.test(v)) { errors.push({ row: n + 2, message: h + ' 숫자 오류: ' + v }); return; } o[h] = Number(v); } else o[h] = v; });
      trades.push(o);
    });
    return { ok: errors.length === 0, errors, trades };
  }
  function exportTradeJson(trades) { return JSON.stringify({ format: 'kst-trade-log', schemaVersion: 1, trades: sorted(trades) }, null, 2); }
  function exportTradeCsv(trades) {
    const esc = v => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [CSV_COLS.join(',')].concat(sorted(trades).map(t => CSV_COLS.map(c => esc(t[c])).join(','))).join('\n') + '\n';
  }
  function sorted(trades) { return trades.map((t, i) => ({ t, i })).sort((a, b) => a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i).map(x => { const o = {}; for (const k of CSV_COLS) if (x.t[k] !== undefined) o[k] = x.t[k]; return o; }); }
  function parseTradeJson(text) {
    let o; try { o = JSON.parse(text); } catch { return { ok: false, errors: [{ row: 0, message: 'JSON 형식 오류' }], trades: [] }; }
    if (!o || o.format !== 'kst-trade-log' || o.schemaVersion !== 1 || !Array.isArray(o.trades)) return { ok: false, errors: [{ row: 0, message: '거래기록 형식/버전 불일치' }], trades: [] };
    return { ok: true, errors: [], trades: o.trades };
  }
  function mergeTrades(existing, incoming) {
    const byId = new Map(existing.map(t => [t.id, t])), added = [], duplicates = [], conflicts = [];
    for (const t of incoming) { const cur = byId.get(t.id); if (!cur) { byId.set(t.id, t); added.push(t.id); } else if (JSON.stringify(sorted([cur])[0]) === JSON.stringify(sorted([t])[0])) duplicates.push(t.id); else conflicts.push(t.id); }
    return { merged: [...existing, ...incoming.filter(t => added.includes(t.id))], added, duplicates, conflicts };
  }
  return { ACCOUNTS, ACCOUNT_LABEL, TYPES, CSV_COLS, taxTreatment, validateEvent, compute, valuate, xirr, xirrOf, twr, estimateOverseasTax, fromAppHoldings, reconcile, parseTradeCsv, parseTradeJson, exportTradeCsv, exportTradeJson, mergeTrades };
});
/* ---- invest/risk.js ---- */
/* KST (stage15) B: 집중투자 위험관리 계산. 순수 — 저장소·네트워크·앱 연결 없음, 입력 불변.
   원칙: 모르면 "미확인", 사용자가 정한 기준만 사용(기준이 없으면 경고하지 않음), 경고는 점검 참고이며 매도 지시가 아니다.
   범위: 보유 종목 평가액 기준(현금·부채·부동산 제외). 상관관계·환율 변동·레버리지·세금은 반영하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTRisk = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fin = x => typeof x === 'number' && Number.isFinite(x);
  const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  const ACCOUNTS = ['gen', 'dom', 'ov', 'pen'], ACCOUNT_LABEL = { gen: '일반', dom: '국내', ov: '해외', pen: '연금' };
  const UNMAPPED = '미분류(미확인)', LOOKTHROUGH_MAX_AGE_DAYS = 90, TEXT_MAX = 2000;
  const FORMULA_NOTE = '비중 = 종목(또는 묶음) 평가액 ÷ 평가된 보유 종목 전체 평가액';

  /* 앱 백업(v5_* 문자열 값) → 보유 목록. 읽기 전용. 해외(ov)는 USD × 환율, 환율이 없으면 평가 불가로 둔다. */
  function holdingsFromStorage(values, { fxUsd = null } = {}) {
    const out = [], notes = [];
    const arr = k => { try { const v = JSON.parse(values[k] || '[]'); return Array.isArray(v) ? v : []; } catch { notes.push(k + ' 읽기 실패'); return []; } };
    for (const [acc, key] of [['gen', 'v5_gen'], ['dom', 'v5_dom'], ['ov', 'v5_ov'], ['pen', 'v5_pen']]) {
      for (const s of arr(key)) {
        if (!s || !fin(s.quantity) || s.quantity <= 0) continue;
        const price = fin(s.currentPrice) && s.currentPrice > 0 ? s.currentPrice : null, fx = acc === 'ov' ? (fin(fxUsd) && fxUsd > 0 ? fxUsd : null) : 1;
        out.push({ account: acc, ticker: String(s.ticker), name: String(s.name || s.ticker), qty: s.quantity, valueKRW: price !== null && fx !== null ? s.quantity * price * fx : null, reason: price === null ? '현재가 없음' : fx === null ? 'USD 환율 없음' : null });
      }
    }
    return { holdings: out, notes };
  }
  function validateLookThrough(lt, today) {
    const res = {}, problems = [];
    for (const [etf, d] of Object.entries(lt || {})) {
      const w = d && Array.isArray(d.holdings) ? d.holdings : null;
      if (!w || !day(d.asOf) || typeof d.source !== 'string' || !d.source.trim()) { problems.push(etf + ': 구성종목 자료 형식/출처/기준일 오류'); continue; }
      if (!w.every(x => x && typeof x.ticker === 'string' && x.ticker && fin(x.weight) && x.weight > 0 && x.weight <= 1)) { problems.push(etf + ': 비중 값 오류'); continue; }
      const sum = w.reduce((s, x) => s + x.weight, 0); if (sum > 1.0001) { problems.push(etf + ': 비중 합이 100% 초과'); continue; }
      if (day(today) && (d.asOf > today || daysBetween(d.asOf, today) > LOOKTHROUGH_MAX_AGE_DAYS)) { problems.push(etf + ': 구성종목 기준일이 ' + (d.asOf > today ? '미래' : LOOKTHROUGH_MAX_AGE_DAYS + '일 초과로 오래됨') + ' → 미확인 처리'); continue; }
      res[etf] = { asOf: d.asOf, source: d.source, holdings: w.map(x => ({ ticker: x.ticker, weight: x.weight })), coverage: sum };
    }
    return { valid: res, problems };
  }
  function validateThresholds(th) {
    const o = {}, errors = []; for (const k of ['tickerMaxPct', 'themeMaxPct', 'accountMaxPct', 'top3MaxPct']) { const v = th ? th[k] : null; if (v === null || v === undefined || v === '') { o[k] = null; continue; } if (!(fin(v) && v > 0 && v <= 100)) { errors.push(k + ': 0 초과 100 이하'); o[k] = null; } else o[k] = v; }
    return { thresholds: o, errors };
  }
  function analyze(holdings, { themeMap = {}, lookThrough = {}, thresholds = null, today = null } = {}) {
    const out = { ok: true, errors: [], notes: [], formulaNote: FORMULA_NOTE, scope: '보유 종목 평가액 기준(현금·부채·부동산 제외). 상관관계·환율 변동·세금 미반영' };
    if (!Array.isArray(holdings)) { out.ok = false; out.errors.push('보유 목록 형식 오류'); return out; }
    const valued = [], unvalued = [];
    for (const h of holdings) { if (!h || !ACCOUNTS.includes(h.account) || typeof h.ticker !== 'string' || !h.ticker) { out.ok = false; out.errors.push('보유 항목 형식 오류'); continue; } (fin(h.valueKRW) && h.valueKRW > 0 ? valued : unvalued).push(h); }
    out.unvalued = unvalued.map(h => ({ account: h.account, ticker: h.ticker, name: h.name, reason: h.reason || '평가액 없음' })); out.complete = unvalued.length === 0 && out.ok;
    const total = valued.reduce((s, h) => s + h.valueKRW, 0); out.totalKRW = total; if (!(total > 0)) { out.byAccount = []; out.byTicker = []; out.byTheme = []; out.alerts = []; out.metrics = null; out.th = validateThresholds(thresholds).thresholds; return out; }
    const w = v => v / total * 100;
    out.byAccount = ACCOUNTS.map(a => { const v = valued.filter(h => h.account === a).reduce((s, h) => s + h.valueKRW, 0); return { account: a, label: ACCOUNT_LABEL[a], valueKRW: v, weightPct: w(v) }; }).filter(x => x.valueKRW > 0);
    const tk = new Map(); for (const h of valued) { const t = tk.get(h.ticker) || { ticker: h.ticker, name: h.name, valueKRW: 0, accounts: [] }; t.valueKRW += h.valueKRW; t.accounts.push(h.account); tk.set(h.ticker, t); }
    out.byTicker = [...tk.values()].map(t => ({ ...t, weightPct: w(t.valueKRW) })).sort((a, b) => b.valueKRW - a.valueKRW);
    const th = new Map(); for (const h of valued) { const name = themeMap && typeof themeMap[h.ticker] === 'string' && themeMap[h.ticker].trim() ? themeMap[h.ticker].trim() : UNMAPPED; const t = th.get(name) || { theme: name, valueKRW: 0, tickers: new Set() }; t.valueKRW += h.valueKRW; t.tickers.add(h.ticker); th.set(name, t); }
    out.byTheme = [...th.values()].map(t => ({ theme: t.theme, valueKRW: t.valueKRW, weightPct: w(t.valueKRW), tickers: [...t.tickers], unknown: t.theme === UNMAPPED })).sort((a, b) => b.valueKRW - a.valueKRW);
    out.unmappedThemeKRW = out.byTheme.filter(t => t.unknown).reduce((s, t) => s + t.valueKRW, 0);
    const ws = out.byTicker.map(t => t.weightPct / 100), hhi = ws.reduce((s, x) => s + x * x, 0);
    out.metrics = { top1Pct: out.byTicker[0].weightPct, top3Pct: out.byTicker.slice(0, 3).reduce((s, t) => s + t.weightPct, 0), top5Pct: out.byTicker.slice(0, 5).reduce((s, t) => s + t.weightPct, 0), hhi, effectiveN: 1 / hhi, tickerCount: out.byTicker.length, note: 'HHI = 종목 비중 제곱의 합, 실효 종목 수 = 1 ÷ HHI' };
    // ETF 간접 노출: 구성종목 자료가 검증되고 최신일 때만. 자료 없는 보유는 "미확인"으로 남긴다.
    const lt = validateLookThrough(lookThrough, today); out.lookThroughProblems = lt.problems; const ind = new Map(); let coveredETF = 0;
    for (const t of out.byTicker) { const d = lt.valid[t.ticker]; if (!d) continue; coveredETF += t.valueKRW; for (const x of d.holdings) ind.set(x.ticker, (ind.get(x.ticker) || 0) + t.valueKRW * x.weight); }
    out.lookThroughCoveredKRW = coveredETF;
    out.combined = [...new Set([...tk.keys(), ...ind.keys()])].map(ticker => { const direct = tk.has(ticker) ? tk.get(ticker).valueKRW : 0, indirect = ind.get(ticker) || 0; return { ticker, directKRW: direct, indirectKRW: indirect, totalKRW: direct + indirect, weightPct: w(direct + indirect), note: indirect ? '직접 + ETF 구성종목 통해 간접(구성 기준일 자료 있는 ETF만)' : '직접 보유만' }; }).sort((a, b) => b.totalKRW - a.totalKRW);
    out.indirectUnknownNote = '구성종목 자료가 없거나 오래된 ETF의 간접 노출은 합산하지 않음(미확인)';
    // 경고: 사용자 설정 기준이 있을 때만. 매도 지시가 아니라 점검 참고.
    const vt = validateThresholds(thresholds); out.th = vt.thresholds; out.thresholdErrors = vt.errors; out.alerts = [];
    const add = (kind, target, weightPct, limit, valueKRW) => { if (limit === null || weightPct <= limit + 1e-9) return; const gapPp = weightPct - limit, gapKRW = valueKRW - total * limit / 100; out.alerts.push({ kind, target, weightPct, limitPct: limit, gapPp, gapKRW, message: '비중 점검 알림: ' + target + ' 비중 ' + weightPct.toFixed(1) + '%가 설정 기준 ' + limit + '%보다 ' + gapPp.toFixed(1) + '%p 높습니다. 점검 참고용이며 매도 지시가 아닙니다.' }); };
    for (const t of out.byTicker) add('ticker', t.name || t.ticker, t.weightPct, out.th.tickerMaxPct, t.valueKRW);
    for (const t of out.byTheme) if (!t.unknown) add('theme', t.theme, t.weightPct, out.th.themeMaxPct, t.valueKRW);
    for (const a of out.byAccount) add('account', a.label + ' 계좌', a.weightPct, out.th.accountMaxPct, a.valueKRW);
    add('top3', '상위 3종목 합계', out.metrics.top3Pct, out.th.top3MaxPct, out.metrics.top3Pct * total / 100);
    out.alerts.sort((a, b) => b.gapPp - a.gapPp);
    out.thresholdNote = Object.values(out.th).every(v => v === null) ? '경고 기준이 설정되지 않아 경고하지 않습니다(기본 기준을 임의로 정하지 않음).' : null;
    return out;
  }

  /* 하락 시나리오. 같은 보유에 여러 시나리오가 겹치면 합산하지 않고 가장 큰 하락률 하나만 적용(100% 초과 방지). 간접(ETF 구성) 하락은 선택. */
  function stress(holdings, scenarios, { themeMap = {}, lookThrough = {}, includeIndirect = false, today = null } = {}) {
    if (!Array.isArray(holdings) || !Array.isArray(scenarios) || !scenarios.length) return { ok: false, reason: '시나리오 없음' };
    for (const s of scenarios) { if (!s || !['ticker', 'theme', 'account', 'all'].includes(s.kind) || !(fin(s.dropPct) && s.dropPct > 0 && s.dropPct <= 100) || (s.kind !== 'all' && (typeof s.key !== 'string' || !s.key))) return { ok: false, reason: '시나리오 형식 오류(하락률은 0 초과 100 이하)' }; }
    const valued = holdings.filter(h => h && fin(h.valueKRW) && h.valueKRW > 0), total = valued.reduce((s, h) => s + h.valueKRW, 0); if (!(total > 0)) return { ok: false, reason: '평가 가능한 보유 없음' };
    const lt = includeIndirect ? validateLookThrough(lookThrough, today).valid : {};
    const themeOf = h => themeMap && typeof themeMap[h.ticker] === 'string' && themeMap[h.ticker].trim() ? themeMap[h.ticker].trim() : UNMAPPED;
    const direct = (s, h) => s.kind === 'all' || (s.kind === 'ticker' && h.ticker === s.key) || (s.kind === 'account' && h.account === s.key) || (s.kind === 'theme' && themeOf(h) === s.key && s.key !== UNMAPPED);
    const indirectW = (s, h) => { if (s.kind !== 'ticker' || !includeIndirect) return 0; const d = lt[h.ticker]; if (!d) return 0; const x = d.holdings.find(y => y.ticker === s.key); return x && h.ticker !== s.key ? x.weight : 0; };
    const items = scenarios.map(s => { let affected = 0, loss = 0, indirect = 0; for (const h of valued) { if (direct(s, h)) { affected += h.valueKRW; loss += h.valueKRW * s.dropPct / 100; } else { const iw = indirectW(s, h); if (iw) { indirect += h.valueKRW * iw; loss += h.valueKRW * iw * s.dropPct / 100; } } }
      return { scenario: s, affectedKRW: affected, indirectKRW: indirect, lossKRW: loss, lossPctOfTotal: loss / total * 100, formula: '(영향 평가액 ' + Math.round(affected) + (indirect ? ' + 간접 노출 ' + Math.round(indirect) : '') + ') × 하락률 ' + s.dropPct + '% ≈ ' + Math.round(loss) + '원' }; });
    let comb = 0; for (const h of valued) { let d = 0, ind = 0; for (const s of scenarios) { if (direct(s, h)) d = Math.max(d, s.dropPct); else { const iw = indirectW(s, h); if (iw) ind += iw * s.dropPct; } } comb += h.valueKRW * Math.min(100, d + ind) / 100; }
    return { ok: true, totalKRW: total, items, combined: { lossKRW: comb, lossPctOfTotal: comb / total * 100, rule: '겹치는 보유는 가장 큰 하락률만 적용(합산하지 않음)' },
      assumptions: ['선택한 대상만 하락하고 나머지는 변하지 않음(상관관계 미반영)', '평가액 기준 단순 선형 계산, 환율·세금·수수료·레버리지·현금 미반영', '하락률은 사용자가 입력한 가정이며 예측이 아님', FORMULA_NOTE] };
  }

  /* 투자 판단 체크 기록(사용자가 직접 작성). 코드는 문구를 만들지 않고, 이력은 추가만 가능(append-only). */
  const text = (v, max = TEXT_MAX) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  function createThesis({ id, ticker, name = '', buyReason, disconfirm, nextReviewDate, createdDate }) {
    const e = []; if (!text(id, 80)) e.push('id'); if (!text(ticker, 40)) e.push('ticker'); if (!text(buyReason)) e.push('buyReason(매수 근거)'); if (!text(disconfirm)) e.push('disconfirm(반증 조건)'); if (!day(nextReviewDate)) e.push('nextReviewDate'); if (!day(createdDate)) e.push('createdDate'); if (day(createdDate) && day(nextReviewDate) && nextReviewDate < createdDate) e.push('nextReviewDate가 작성일보다 이름');
    if (e.length) return { ok: false, errors: e };
    return { ok: true, thesis: { schemaVersion: 1, id, ticker, name: String(name).slice(0, 80), buyReason: buyReason.trim(), disconfirm: disconfirm.trim(), nextReviewDate, status: 'active', history: [{ date: createdDate, kind: 'created', note: '최초 작성' }] } };
  }
  function updateThesis(t, { date, note, changes }) {
    const e = []; if (!t || t.schemaVersion !== 1 || !Array.isArray(t.history)) e.push('기록 형식'); if (!day(date)) e.push('date'); if (!text(note)) e.push('note(변경 이유)'); if (!changes || typeof changes !== 'object' || !Object.keys(changes).length) e.push('changes');
    if (e.length) return { ok: false, errors: e }; const allowed = ['buyReason', 'disconfirm', 'nextReviewDate', 'status'], next = { ...t, history: t.history.slice() }, diff = {};
    const last = t.history[t.history.length - 1]; if (last && date < last.date) return { ok: false, errors: ['변경일이 마지막 이력보다 이름'] };
    for (const [k, v] of Object.entries(changes)) { if (!allowed.includes(k)) return { ok: false, errors: ['변경할 수 없는 항목: ' + k] }; if ((k === 'buyReason' || k === 'disconfirm') && !text(v)) return { ok: false, errors: [k + ' 비어 있음'] }; if (k === 'nextReviewDate' && !day(v)) return { ok: false, errors: ['nextReviewDate'] }; if (k === 'status' && !['active', 'paused', 'closed'].includes(v)) return { ok: false, errors: ['status'] }; if (v !== t[k]) { diff[k] = { from: t[k], to: typeof v === 'string' ? v.trim() : v }; next[k] = typeof v === 'string' ? v.trim() : v; } }
    if (!Object.keys(diff).length) return { ok: false, errors: ['바뀐 내용 없음'] };
    next.history.push({ date, kind: 'change', changes: diff, note: note.trim() }); return { ok: true, thesis: next };
  }
  function reviewStatus(t, today) {
    if (!t || !day(today) || !day(t.nextReviewDate) || !text(t.buyReason) || !text(t.disconfirm)) return { state: 'incomplete', label: '기록 불완전' };
    if (t.status !== 'active') return { state: t.status, label: t.status === 'paused' ? '일시 중지' : '종료' };
    const d = daysBetween(today, t.nextReviewDate); return d < 0 ? { state: 'overdue', label: '점검일 ' + Math.round(-d) + '일 지남', days: d } : d <= 14 ? { state: 'due-soon', label: '점검일까지 ' + Math.round(d) + '일', days: d } : { state: 'ok', label: '점검일까지 ' + Math.round(d) + '일', days: d };
  }
  function holdingsWithoutThesis(holdings, theses) { const have = new Set(theses.filter(t => t.status === 'active').map(t => t.ticker)); return [...new Set(holdings.map(h => h.ticker))].filter(t => !have.has(t)); }
  function exportTheses(list) { return JSON.stringify({ format: 'kst-thesis-log', schemaVersion: 1, theses: list }, null, 2); }
  function parseTheses(textIn) {
    let o; try { o = JSON.parse(textIn); } catch { return { ok: false, errors: ['JSON 형식 오류'] }; } if (!o || o.format !== 'kst-thesis-log' || o.schemaVersion !== 1 || !Array.isArray(o.theses)) return { ok: false, errors: ['형식/버전 불일치'] };
    const ids = new Set(), errors = [];
    for (const t of o.theses) { const bad = !t || t.schemaVersion !== 1 || !text(t.id, 80) || ids.has(t.id) || !text(t.ticker, 40) || !text(t.buyReason) || !text(t.disconfirm) || !day(t.nextReviewDate) || !['active', 'paused', 'closed'].includes(t.status) || !Array.isArray(t.history) || !t.history.length || t.history[0].kind !== 'created' || !t.history.every((x, i) => x && day(x.date) && text(x.note) && (i === 0 || x.date >= t.history[i - 1].date)); if (bad) errors.push('기록 오류: ' + (t && t.id)); else ids.add(t.id); }
    return errors.length ? { ok: false, errors } : { ok: true, errors: [], theses: o.theses };
  }
  return { ACCOUNTS, ACCOUNT_LABEL, UNMAPPED, LOOKTHROUGH_MAX_AGE_DAYS, holdingsFromStorage, validateLookThrough, validateThresholds, analyze, stress, createThesis, updateThesis, reviewStatus, holdingsWithoutThesis, exportTheses, parseTheses };
});
/* ---- invest/backtest.js ---- */
/* KST 백테스트 엔진 1차 (순수 계산 모듈, UMD: KSTBacktest)
 * - 네트워크·저장소·DOM·타이머 접근 없음. 입력은 호출자가 넘긴 가격 배열뿐.
 * - 합성 자료/권리 미확인 자료는 "성과 주장 불가"로 표시. 실데이터 백테스트 수는 license 확인된 자료만 집계.
 * - 매수 추천·수익 보장 표현 금지: 판정 문구는 VERDICT 3종만 사용. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTBacktest = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HORIZONS = { '1M': 21, '3M': 63, '6M': 126, '12M': 252 };
  const RULE_VERSION = 'kst-bt-rules-1.0';
  const VERDICT = { INSUFFICIENT: '검증 부족', REVIEW: '전략 재검토', HYPOTHESIS: '가설 단계 (매수 추천 아님)' };
  const LABEL = { REAL: '실데이터 백테스트', SYNTH: '합성 계산기 시험 (성과 주장 불가)', UNLICENSED: '실데이터 여부·사용권 미확인 (성과 주장 불가)' };
  const DEFAULT_RULES = {
    gokso: { kind: 'gokso', name: '곡소리(52주 고점 대비 하락)', lookback: 252, bands: [20, 30, 35], rearmGap: 5, proxy: false },
    cheer: { kind: 'cheer', name: '환호성 (가격 기반 대용 규칙)', lookback: 252, bands: [50, 100], rearmGap: 10, proxy: true,
      proxyNote: '원래 환호성 규칙은 밸류에이션·판단 기반이라 가격만으로 완전 재현할 수 없습니다. 12개월 상승률로 근사한 대용 규칙입니다.' }
  };
  const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const num = x => typeof x === 'number' && isFinite(x);
  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  function validateSeries(bars) {
    const errors = [];
    if (!Array.isArray(bars) || !bars.length) return ['가격 자료 없음'];
    let prev = '';
    bars.forEach((b, i) => {
      if (!b || !isDay(b.d)) errors.push(`${i + 1}번째 날짜 형식 오류`);
      else { if (b.d <= prev) errors.push(`${i + 1}번째 날짜가 중복이거나 정렬되지 않음`); prev = b.d; }
      if (!b || !num(b.c) || b.c <= 0) errors.push(`${i + 1}번째 종가 오류`);
    });
    return errors.slice(0, 20);
  }
  // 신호 탐지: i번째 신호는 bars[0..i]만 사용해야 한다(밖에서 leakCheck 로 검증).
  function detectSignals(bars, rule) {
    const out = [], L = rule.lookback, armed = rule.bands.map(() => true);
    for (let i = L - 1; i < bars.length; i++) {
      let metric;
      if (rule.kind === 'gokso') { let hi = 0; for (let j = i - L + 1; j <= i; j++) if (bars[j].c > hi) hi = bars[j].c; metric = (hi - bars[i].c) / hi * 100; }
      else { if (i - (L - 1) < 0) continue; const base = bars[i - (L - 1)].c; metric = (bars[i].c / base - 1) * 100; }
      rule.bands.forEach((b, k) => {
        if (armed[k] && metric >= b) { out.push({ i, d: bars[i].d, band: b, metric }); armed[k] = false; }
        else if (!armed[k] && metric < b - rule.rearmGap) armed[k] = true;
      });
    }
    return out;
  }
  // 미래 정보 누출 검사: 같은 시점까지의 신호가 "그 시점까지만 준 자료"와 "전체 자료" 에서 동일해야 한다.
  function leakCheck(bars, rule, detector) {
    const det = detector || detectSignals, full = det(bars, rule), n = bars.length, cuts = [];
    for (let k = 1; k <= 8; k++) cuts.push(Math.floor(n * k / 9));
    for (const cut of cuts) {
      if (cut < 2) continue;
      const part = det(bars.slice(0, cut), rule), want = full.filter(s => s.i < cut);
      if (JSON.stringify(part.map(s => [s.i, s.band])) !== JSON.stringify(want.map(s => [s.i, s.band]))) return { ok: false, cut, message: `미래 정보 누출 의심: ${cut}번째 자료까지만 줬을 때와 전체 자료일 때 신호가 다릅니다.` };
    }
    return { ok: true, cuts: cuts.length };
  }
  const fnv = s => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; } return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'); };
  function canon(o) { if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}'; return JSON.stringify(o); }
  function metaInfo(meta, symbolCount) {
    const m = Object.assign({ source: '', asOf: '', adjusted: 'unknown', dividends: 'unknown', splits: 'unknown', delistings: 'unknown', haltDays: 'unknown', survivorship: 'unknown', fees: 'unknown', slippage: 'unknown', fx: 'not-applicable', isSynthetic: false, license: 'none' }, meta || {});
    const warnings = [];
    const flag = (k, text) => { if (m[k] !== 'reflected' && m[k] !== 'not-applicable' && m[k] !== 'handled' && m[k] !== 'adjusted') warnings.push(text + (m[k] === 'unknown' ? ' (반영 여부 미확인)' : ' (미반영)')); };
    if (m.adjusted !== 'adjusted') warnings.push('수정주가(배당·분할 조정) 여부: ' + (m.adjusted === 'unknown' ? '미확인' : '조정 안 된 가격'));
    flag('dividends', '배당 반영'); flag('splits', '주식분할 반영'); flag('delistings', '상장폐지 반영'); flag('haltDays', '거래정지 반영'); flag('survivorship', '생존편향 처리');
    flag('fees', '매매 수수료'); flag('slippage', '슬리피지'); flag('fx', '환전 비용');
    let label = LABEL.SYNTH;
    if (!m.isSynthetic) label = (m.license === 'verified' && m.source && m.asOf) ? LABEL.REAL : LABEL.UNLICENSED;
    return { meta: m, warnings, label, isReal: label === LABEL.REAL };
  }
  function pathMdd(bars, a, b) { let peak = bars[a].c, worst = 0; for (let j = a; j <= b; j++) { if (bars[j].c > peak) peak = bars[j].c; const dd = bars[j].c / peak - 1; if (dd < worst) worst = dd; } return worst * 100; }
  // 개별 관측치: 신호 다음 거래일 종가로 진입, h 거래일 뒤 종가로 청산
  function observe(bars, sig, h, costs, bench, benchIdx) {
    const e = sig.i + 1, x = e + h;
    if (x >= bars.length) return { excluded: 'horizon' };
    const slip = (costs.slippageBps || 0) / 1e4, fee = (costs.feeBps || 0) / 1e4, fx = (costs.fxBps || 0) / 1e4;
    const inP = bars[e].c * (1 + slip), outP = bars[x].c * (1 - slip);
    const ret = (outP * (1 - fee - fx)) / (inP * (1 + fee + fx)) - 1;
    const o = { signalDate: sig.d, entryDate: bars[e].d, exitDate: bars[x].d, entryIdx: e, exitIdx: x, retPct: ret * 100, mddPct: pathMdd(bars, e, x), band: sig.band };
    if (bench) {
      const be = benchIdx.get(bars[e].d), bx = benchIdx.get(bars[x].d);
      if (be === undefined || bx === undefined) return { excluded: 'benchmark' };
      o.benchPct = (bench[bx].c / bench[be].c - 1) * 100; o.excessPct = o.retPct - o.benchPct;
    }
    return { obs: o };
  }
  function summarize(list, excl) {
    const r = list.map(o => o.retPct), ex = list.filter(o => o.excessPct !== undefined).map(o => o.excessPct);
    return { n: list.length, excludedHorizon: excl.horizon || 0, excludedBenchmark: excl.benchmark || 0, excludedOverlap: excl.overlap || 0, excludedSegment: excl.segment || 0,
      winRatePct: list.length ? r.filter(x => x > 0).length / list.length * 100 : null, meanPct: mean(r), medianPct: median(r), worstPct: r.length ? Math.min(...r) : null,
      worstMddPct: list.length ? Math.min(...list.map(o => o.mddPct)) : null, medianMddPct: median(list.map(o => o.mddPct)),
      excessMedianPct: median(ex), excessMeanPct: mean(ex), excessN: ex.length };
  }
  function evaluate(bars, signals, opts) {
    const costs = opts.costs || {}, bench = opts.benchmark || null, bi = new Map(); if (bench) bench.forEach((b, i) => bi.set(b.d, i));
    const seg = opts.segment || null, res = {};
    for (const [name, h] of Object.entries(HORIZONS)) {
      const list = [], excl = {}; let lastExit = -1;
      for (const s of signals) {
        const r = observe(bars, s, h, costs, bench, bi);
        if (r.excluded) { excl[r.excluded] = (excl[r.excluded] || 0) + 1; continue; }
        if (seg && (bars[r.obs.entryIdx].d < seg[0] || bars[r.obs.exitIdx].d > seg[1])) { excl.segment = (excl.segment || 0) + 1; continue; }
        if (opts.nonOverlapping && r.obs.entryIdx <= lastExit) { excl.overlap = (excl.overlap || 0) + 1; continue; }
        lastExit = r.obs.exitIdx; list.push(r.obs);
      }
      res[name] = Object.assign(summarize(list, excl), { horizonDays: h, observations: opts.keepObservations ? list : undefined });
    }
    return res;
  }
  function verdictFor(val, minN) {
    const h = val && val['3M'];
    if (!h || h.n < minN) return { verdict: VERDICT.INSUFFICIENT, reason: `검증 구간 3개월 관측 ${h ? h.n : 0}건 < 최소 ${minN}건` };
    if (h.medianPct <= 0 || h.winRatePct < 50 || (h.excessMedianPct !== null && h.excessMedianPct <= 0)) return { verdict: VERDICT.REVIEW, reason: '검증 구간에서 중앙값·승률·비교지표 대비 초과수익 중 하나 이상이 기준 미달' };
    return { verdict: VERDICT.HYPOTHESIS, reason: '검증 구간 기준 통과. 표본·자료 한계로 미래 성과를 뜻하지 않음' };
  }
  function run(input) {
    const o = input || {}, errors = [];
    const sErr = validateSeries(o.bars); if (sErr.length) return { ok: false, errors: sErr.map(e => '가격: ' + e) };
    if (o.benchmark) { const be = validateSeries(o.benchmark); if (be.length) return { ok: false, errors: be.map(e => '비교지표: ' + e) }; }
    const rule = Object.assign({}, DEFAULT_RULES[(o.rule && o.rule.kind) || 'gokso'] || {}, o.rule || {});
    if (!rule.kind || !DEFAULT_RULES[rule.kind]) return { ok: false, errors: ['알 수 없는 규칙'] };
    if (!Array.isArray(rule.bands) || !rule.bands.length || rule.bands.some(b => !num(b) || b <= 0 || (rule.kind === 'gokso' && b >= 100))) return { ok: false, errors: ['기준 구간 값 오류'] };
    if (!Number.isInteger(rule.lookback) || rule.lookback < 2) return { ok: false, errors: ['관찰 기간 오류'] };
    const bars = o.bars, det = o.detector || detectSignals;
    const lk = leakCheck(bars, rule, det); if (!lk.ok) return { ok: false, errors: [lk.message], leak: lk };
    const mi = metaInfo(o.meta, 1), minN = Number.isInteger(o.minValidationN) ? o.minValidationN : 30;
    const trainFrac = num(o.trainFraction) && o.trainFraction > 0.2 && o.trainFraction < 0.9 ? o.trainFraction : 0.6;
    const splitDate = bars[Math.min(bars.length - 1, Math.floor(bars.length * trainFrac))].d;
    const signals = det(bars, rule), common = { costs: o.costs, benchmark: o.benchmark, nonOverlapping: o.nonOverlapping !== false };
    const all = evaluate(bars, signals, common);
    const train = evaluate(bars, signals, Object.assign({}, common, { segment: [bars[0].d, splitDate] }));
    const val = evaluate(bars, signals, Object.assign({}, common, { segment: [splitDate, bars[bars.length - 1].d] }));
    // 매개변수 탐색(과최적화 경계): 후보 구간 묶음 중 훈련 구간 3개월 중앙값 최고를 고르고, 검증 구간에서만 평가
    let grid = null;
    if (Array.isArray(o.grid) && o.grid.length) {
      const rows = o.grid.map(bands => { const r2 = Object.assign({}, rule, { bands }), s2 = det(bars, r2), t = evaluate(bars, s2, Object.assign({}, common, { segment: [bars[0].d, splitDate] })), v = evaluate(bars, s2, Object.assign({}, common, { segment: [splitDate, bars[bars.length - 1].d] })); return { bands, train3M: t['3M'], val3M: v['3M'] }; });
      const ok = rows.filter(r => r.train3M.n > 0), pick = ok.sort((a, b) => b.train3M.medianPct - a.train3M.medianPct)[0] || null;
      grid = { size: o.grid.length, picked: pick && pick.bands, pickedTrainMedianPct: pick && pick.train3M.medianPct, pickedValidationMedianPct: pick && pick.val3M.medianPct, pickedValidationN: pick && pick.val3M.n,
        overfitWarning: !!pick && (pick.val3M.n < minN || pick.val3M.medianPct === null || pick.train3M.medianPct - pick.val3M.medianPct > 5), note: `후보 ${o.grid.length}가지를 시험하면 우연히 좋아 보이는 조합이 나올 수 있습니다. 검증 구간 결과만 참고하세요.` };
    }
    const vd = verdictFor(val, minN), warnings = mi.warnings.slice();
    if (rule.proxy) warnings.push(rule.proxyNote);
    if (!mi.isReal) warnings.push('이 결과는 계산기·화면 시험용입니다. 성과를 주장하거나 투자 판단에 쓰지 마세요.');
    if (!o.benchmark) warnings.push('비교지표(예: S&P500) 없음 — 초과수익 계산 불가');
    if (!o.costs) warnings.push('거래비용 입력 없음 — 수수료·슬리피지·환전 비용 0으로 계산');
    const config = { rule, costs: o.costs || {}, nonOverlapping: common.nonOverlapping, trainFraction: trainFrac, minValidationN: minN, grid: o.grid || null, horizons: HORIZONS, ruleVersion: RULE_VERSION };
    const hash = typeof o.hash === 'function' ? o.hash : fnv;
    const result = { ok: true, label: mi.label, isRealDataBacktest: mi.isReal, claimsAllowed: mi.isReal, verdict: vd.verdict, verdictReason: vd.reason, warnings,
      signalCount: signals.length, signalsByBand: rule.bands.map(b => ({ band: b, count: signals.filter(s => s.band === b).length })), splitDate, all, train, validation: val, grid,
      meta: mi.meta, config, repro: { ruleVersion: RULE_VERSION, barsDigest: hash(canon(bars)), benchmarkDigest: o.benchmark ? hash(canon(o.benchmark)) : null, configDigest: hash(canon(config)), metaDigest: hash(canon(mi.meta)) },
      leakCheck: lk, disclaimer: '과거 가상 계산이며 매수 추천이나 미래 수익 보장이 아닙니다.' };
    result.resultDigest = hash(canon({ all, train, validation: val, signalCount: signals.length }));
    return result;
  }
  function realBacktestCount(results) { return (results || []).filter(r => r && r.ok && r.isRealDataBacktest).length; }
  // 합성 자료 생성(시드 고정, 같은 시드 → 같은 자료)
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function bizDates(start, n) { const out = []; let t = Date.parse(start + 'T00:00:00Z'); while (out.length < n) { const wd = new Date(t).getUTCDay(); if (wd !== 0 && wd !== 6) out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; } return out; }
  function fromCloses(start, closes) { const d = bizDates(start, closes.length); return closes.map((c, i) => ({ d: d[i], c })); }
  function makeSynthetic(o) {
    const p = Object.assign({ seed: 1, n: 1500, start: '2018-01-02', startPrice: 100, driftPct: 0.03, volPct: 1.6 }, o || {}), rnd = mulberry(p.seed), closes = []; let c = p.startPrice;
    for (let i = 0; i < p.n; i++) { const z = (rnd() + rnd() + rnd() + rnd() - 2) * 1.7320508; c = Math.max(0.01, c * (1 + p.driftPct / 100 + p.volPct / 100 * z)); closes.push(Math.round(c * 10000) / 10000); }
    return fromCloses(p.start, closes);
  }
  return { verdictFor, HORIZONS, RULE_VERSION, VERDICT, LABEL, DEFAULT_RULES, validateSeries, detectSignals, leakCheck, metaInfo, evaluate, run, realBacktestCount, makeSynthetic, fromCloses, bizDates, mulberry, canon, fnv };
});
/* ---- backup/core.js ---- */
/* Local-only portfolio backup. No keys, network, or default account resets. */
(function(root,f){if(typeof module==='object'&&module.exports)module.exports=f();else root.KSTPortfolioBackup=f();})(globalThis,function(){
 'use strict';
 const FORMAT='kst-portfolio-backup',VERSION=6,JOURNAL='kst.portfolio.restoreJournal',MAX_BYTES=20*1024*1024;
 const ACCOUNTS=['v5_gen','v5_dom','v5_ov','v5_pen'];
 const JSON_KEYS=[...ACCOUNTS,'v5_snap','v5_deposits','v5_div','v5_balGoals','v5_ledger','v5_fxHistory','v5_memos','v5_userThemeMap','v5_investPrinciples','v5_debtBank','v5_debtHouse','v5_nonFinAssets','v5_benchHist','v5_riskData','v5_rkCache'];
 const TEXT_KEYS=['v5_fx','v5_fg','v5_cma_amount','v5_lastAutoSnap','v5_divMonthFilter','v5_divSumMonth','v5_divSumYear','v5_divTickerYear'];
 const allowed=k=>JSON_KEYS.includes(k)||TEXT_KEYS.includes(k)||/^calc_[qp][123]_(dom|ov|pen|gen)_\d+$/.test(k);
 const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 const fail=s=>{throw new Error(s);};
 function safeTree(v,depth=0){
  if(depth>30)fail('자료 중첩 한도 초과');
  if(typeof v==='number'&&!Number.isFinite(v))fail('비유한 숫자');
  if(typeof v==='string'&&(/<[a-z/!]|\bon[a-z]+\s*=|javascript:|\u0000/i.test(v)))fail('실행 가능한 HTML/스크립트 문자열은 복원할 수 없습니다.');
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))fail('금지된 자료 속성');safeTree(x,depth+1);}
 }
 function stocks(a){
  if(!Array.isArray(a)||a.length>10000)fail('계좌는 종목 배열이어야 합니다.');
  const ids=new Set();for(const s of a){
   if(!object(s)||!(Number.isSafeInteger(s.id)&&s.id>=0)||ids.has(String(s.id))||typeof s.name!=='string'||!s.name.trim()||typeof s.ticker!=='string'||!s.ticker.trim()||!['quantity','avgPrice','currentPrice'].every(k=>finite(s[k])))fail('종목 필드 손상 또는 중복 ID');
   if(!/^[\p{L}\p{N}_.()·\- ]+$/u.test(s.ticker))fail('잘못된 티커');
   ids.add(String(s.id));
  }
 }
 function validateValue(k,raw){
  if(!allowed(k)||typeof raw!=='string'||raw.length>MAX_BYTES)fail('지원하지 않는 저장 키 또는 값');
  if(!JSON_KEYS.includes(k)){safeTree(raw);if(['v5_fx','v5_fg','v5_cma_amount','v5_lastAutoSnap'].includes(k)&&(!raw.trim()||!Number.isFinite(Number(raw))))fail('숫자 설정 손상');return;}
  let v;try{v=JSON.parse(raw);}catch{fail('저장 자료 JSON 손상: '+k);}safeTree(v);
  if(ACCOUNTS.includes(k))stocks(v);
  else if(['v5_div','v5_fxHistory','v5_memos','v5_debtBank','v5_debtHouse','v5_nonFinAssets'].includes(k)){if(!Array.isArray(v))fail('배열 형식 오류: '+k);}
  else if(!object(v))fail('객체 형식 오류: '+k);
  if(k==='v5_snap'||k==='v5_deposits'){
   const groups=k==='v5_snap'?['all','dom','ov','pen','gen']:['dom','ov','pen','gen'];
   for(const [g,rows] of Object.entries(v)){if(!groups.includes(g)||!Array.isArray(rows)||rows.some(r=>!object(r)||!finite(r.ts)||!(k==='v5_snap'?finite(r.val):finite(r.amount))))fail('기록 형식 오류: '+k);}
  }
  if(k==='v5_balGoals'&&Object.values(v).some(n=>!finite(n)||n<0||n>100))fail('목표 비중 형식 오류');
  if(['v5_debtBank','v5_debtHouse','v5_nonFinAssets'].includes(k)&&v.some(r=>!object(r)||typeof r.name!=='string'||!finite(r[k==='v5_debtBank'?'balance':'amount'])))fail('자산·부채 기록 형식 오류');
  if(k==='v5_userThemeMap'&&Object.values(v).some(t=>typeof t!=='string'))fail('분류 설정 형식 오류');
  if(k==='v5_div'&&v.some(r=>!object(r)||typeof r.date!=='string'||!finite(r.amount)))fail('배당 기록 형식 오류');
  if(k==='v5_fxHistory'&&v.some(r=>!object(r)||typeof r.d!=='string'||!finite(r.v)))fail('환율 기록 형식 오류');
  if(k==='v5_memos'&&v.some(r=>!object(r)||typeof r.text!=='string'))fail('메모 형식 오류');
  if(k==='v5_ledger')for(const month of Object.values(v)){if(!object(month))fail('가계부 형식 오류');for(const [type,rows]of Object.entries(month)){if(!['income','expense','invest'].includes(type)||!Array.isArray(rows)||rows.some(r=>!object(r)||typeof r.name!=='string'||!finite(r.amount)))fail('가계부 기록 손상');}}
 }
 function capture(storage,overrides={}){
  const values={};for(let i=0;i<storage.length;i++){const k=storage.key(i);if(allowed(k))values[k]=storage.getItem(k);}
  for(const [k,v]of Object.entries(overrides)){if(!allowed(k))fail('백업 범위 밖 키');values[k]=v;}
  return values;
 }
 function envelope(values){return {format:FORMAT,schemaVersion:VERSION,exportedAt:new Date().toISOString(),scope:'portfolio-only-no-secrets-no-radar',storage:values};}
 function create(storage,overrides={}){const original=capture(storage);for(const[k,v]of Object.entries(original))validateValue(k,v);const b=envelope(capture(storage,overrides));validateEnvelope(b);if(new TextEncoder().encode(JSON.stringify(b)).length>MAX_BYTES)fail('전체 백업 용량 한도 초과');return b;}
 function validateEnvelope(b){
  if(!object(b)||b.format!==FORMAT||b.schemaVersion!==VERSION||!object(b.storage))fail('지원하지 않는 전체 백업 스키마');
  if(!ACCOUNTS.every(k=>Object.hasOwn(b.storage,k)))fail('새 백업에 4개 계좌가 모두 필요합니다.');
  const keys=Object.keys(b.storage);if(keys.length>50000)fail('백업 키 한도 초과');
  for(const k of keys)validateValue(k,b.storage[k]);return b.storage;
 }
 function parse(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)fail('백업은 최대 20MiB입니다.');
  const b=JSON.parse(text);safeTree(b);
  if(b?.format===FORMAT)return {values:validateEnvelope(b),legacy:false,warnings:['포함된 키만 교체하며 누락된 설정은 유지합니다.']};
  if(!object(b)||!['v4','v5',4,5].includes(b.version))fail('알 수 없는 구버전 또는 미래 버전');
  const values={},warnings=['구버전 백업: 없는 계좌·설정은 현재 값을 유지합니다.'];
  for(const [field,key]of Object.entries({genStocks:'v5_gen',domStocks:'v5_dom',ovStocks:'v5_ov',penStocks:'v5_pen',divList:'v5_div',snapshots:'v5_snap',deposits:'v5_deposits',ledger:'v5_ledger',fxHistory:'v5_fxHistory',memos:'v5_memos',userThemeMap:'v5_userThemeMap'}))if(Object.hasOwn(b,field))values[key]=JSON.stringify(b[field]);
  if(Object.hasOwn(b,'stocks')&&!Object.hasOwn(b,'domStocks')){
   if(!Array.isArray(b.stocks)||b.stocks.some(s=>!['KR','US'].includes(s.market)))fail('구버전 시장 구분 오류');
   for(const [market,key]of [['KR','v5_dom'],['US','v5_ov']]){if(Object.hasOwn(values,key))continue;values[key]=JSON.stringify(b.stocks.filter(s=>s.market===market).map(s=>({...s,quantity:s.quantity??0,avgPrice:s.avgPrice??0,currentPrice:s.currentPrice??0})));}
  }
  if(Object.hasOwn(b,'pension')&&!Object.hasOwn(b,'penStocks')){if(!Array.isArray(b.pension))fail('구버전 연금 형식 오류');values.v5_pen=JSON.stringify(b.pension.map(s=>({...s,quantity:s.quantity??0,avgPrice:s.avgPrice??0,currentPrice:s.currentPrice??0})));}
  if(b.snapshots&&Object.hasOwn(b.snapshots,'normal')&&!Object.hasOwn(b.snapshots,'dom'))values.v5_snap=JSON.stringify({all:b.snapshots.normal});
  for(const [field,key]of [['usdKrw','v5_fx'],['fg','v5_fg']])if(Object.hasOwn(b,field)&&b[field]!==null)values[key]=String(b[field]);
  if(Object.hasOwn(b,'calcData')){if(!object(b.calcData))fail('계산기 자료 오류');for(const[k,v]of Object.entries(b.calcData)){if(!/^calc_[qp][123]_(dom|ov|pen|gen)_\d+$/.test(k))fail('구버전 계산기 키 범위 오류');values[k]=String(v);}}
  if(Object.hasOwn(b,'gasUrl'))warnings.push('GAS 주소는 보안 설정이므로 자동 복원하지 않습니다.');
  if(!Object.keys(values).length)fail('복원할 지원 자료가 없습니다.');for(const[k,v]of Object.entries(values))validateValue(k,v);
  if(!Object.hasOwn(values,'v5_gen'))warnings.push('일반계좌가 백업에 없습니다. 현재 일반계좌를 유지합니다.');
  return {values,legacy:true,warnings};
 }
 function resolved(storage,plan){
  const values={...plan.values};
  if(plan.legacy)for(const k of ['v5_snap','v5_deposits'])if(Object.hasOwn(values,k)){const current=JSON.parse(storage.getItem(k)||'{}');if(!object(current))fail('현재 기록 객체 손상');values[k]=JSON.stringify({...current,...JSON.parse(values[k])});}
  return values;
 }
 function preview(storage,plan){
  return Object.entries(resolved(storage,plan)).map(([key,value])=>({key,before:ACCOUNTS.includes(key)?JSON.parse(storage.getItem(key)||'[]').length:null,after:ACCOUNTS.includes(key)?JSON.parse(value).length:null,changed:storage.getItem(key)!==value}));
 }
 function readJournal(storage){
  const raw=storage.getItem(JOURNAL);if(raw===null)return null;
  const j=JSON.parse(raw);if(!object(j)||j.version!==1||!['prepared','applied','undone'].includes(j.status)||!object(j.before)||Object.entries(j.before).some(([k,v])=>!allowed(k)||(v!==null&&typeof v!=='string')))fail('복원 전 사본 손상. 원본은 보존합니다.');return j;
 }
 function rollback(storage,before){
  // Free changed keys first so restoring the original size cannot require extra space.
  for(const k of Object.keys(before))storage.removeItem(k);
  for(const[k,v]of Object.entries(before))if(v!==null)storage.setItem(k,v);
 }
 function apply(storage,plan){
  const pending=readJournal(storage);if(pending?.status==='prepared')fail('중단된 복원을 먼저 복구하세요.');
  const values=resolved(storage,plan),keys=Object.keys(values);for(const k of keys)validateValue(k,values[k]);
  const before=Object.fromEntries(keys.map(k=>[k,storage.getItem(k)]));
  const journal={version:1,status:'prepared',savedAt:new Date().toISOString(),before};
  try{storage.setItem(JOURNAL,JSON.stringify(journal));}catch{fail('복원 전 사본을 저장하지 못했습니다. 자료는 변경하지 않았습니다. 전체 백업을 따로 보관한 뒤 저장 공간을 확인하세요.');} // Must succeed before touching any portfolio key.
  try{for(const k of keys)storage.setItem(k,values[k]);journal.status='applied';storage.setItem(JOURNAL,JSON.stringify(journal));}
  catch(e){try{rollback(storage,before);journal.status='undone';storage.setItem(JOURNAL,JSON.stringify(journal));}catch{fail('자동 복구가 끝나지 않았습니다. 복원 전 사본을 보존했으니 앱 사용을 멈추고 사본을 내보내세요.');}fail('복원 실패. 변경 전 자료로 복구했습니다.');}
  return journal;
 }
 function undo(storage){const j=readJournal(storage);if(!j||j.status==='undone')fail('되돌릴 복원 전 사본이 없습니다.');rollback(storage,j.before);j.status='undone';storage.setItem(JOURNAL,JSON.stringify(j));}
 function recover(storage){const j=readJournal(storage);if(j?.status==='prepared'){undo(storage);return true;}return false;}
 return {FORMAT,VERSION,JOURNAL,MAX_BYTES,ACCOUNTS,JSON_KEYS,TEXT_KEYS,allowed,create,parse,preview,apply,undo,recover,readJournal,capture};
});
