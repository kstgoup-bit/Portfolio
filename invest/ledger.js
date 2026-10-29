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
