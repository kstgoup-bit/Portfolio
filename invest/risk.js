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
