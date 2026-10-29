/* HAS (stage18): 미국 5종목 실가격 "소규모 파일럿"의 순수 규칙 모듈. 네트워크·저장소·시간·환경변수 접근 없음(호출자가 주입).
   이 모듈은 승인 파일 검증, 호출 예산, 응답 해석(Tiingo 일봉 "추정 형태"), 독립 대조, 집계를 맡는다.
   조회 성공 ≠ 독립 검증 ≠ 활성 감시. 세 숫자는 항상 따로 센다. 이 모듈이 있다고 호출 승인이 생기지 않는다. */
'use strict';
const { finite, nonEmpty, day } = require('./common.js');
const ALLOWLIST = Object.freeze(['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM']);
const LIMITS = Object.freeze({ perDay: 10, total: 200 });
const IMPLEMENTED_PROVIDERS = Object.freeze(['tiingo']);          // 라이브 어댑터가 있는 공급자(코드만 있음, 약관 확인은 사용자 승인 파일이 증명)
const KNOWN_PROVIDERS = Object.freeze(['tiingo', 'twelvedata', 'alphavantage', 'massive']);
const MAX_AGE_DAYS = 4;                                           // 기준일이 이보다 오래되면 "오래된 가격"
const isUrl = s => typeof s === 'string' && /^https:\/\/[^\s]+$/.test(s);

/* 승인 파일(저장소 밖, 사용자가 직접 작성) 검증. 하나라도 어긋나면 live 거부. */
function validateApproval(a, today) {
  const e = []; if (!a || typeof a !== 'object') return { ok: false, errors: ['승인 파일 형식 오류'] };
  if (a.approvedBy !== 'user') e.push('approvedBy=user 필요'); if (!day(a.approvedAt)) e.push('approvedAt(YYYY-MM-DD) 필요');
  if (!KNOWN_PROVIDERS.includes(a.provider)) e.push('provider 오류'); else if (!IMPLEMENTED_PROVIDERS.includes(a.provider)) e.push('이 공급자의 라이브 어댑터가 없음(구현된 공급자: ' + IMPLEMENTED_PROVIDERS.join(',') + ')');
  if (a.termsConfirmedByUser !== true || !isUrl(a.termsUrl) || !day(a.termsCheckedAt)) e.push('termsConfirmedByUser=true, termsUrl(https), termsCheckedAt 필요 — 약관 확인 증빙');
  if (a.freeNoPayment !== true) e.push('freeNoPayment=true 필요(결제수단 등록 없는 무료 이용)');
  if (!Array.isArray(a.tickers) || !a.tickers.length || a.tickers.some(t => !ALLOWLIST.includes(t))) e.push('tickers는 허용 5종목의 부분집합이어야 함');
  if (!(a.maxPerDay >= 1 && a.maxPerDay <= LIMITS.perDay)) e.push('maxPerDay는 1~' + LIMITS.perDay); if (!(a.maxTotal >= 1 && a.maxTotal <= LIMITS.total)) e.push('maxTotal은 1~' + LIMITS.total);
  if (a.providerLowerLimit != null && !(a.providerLowerLimit >= 1)) e.push('providerLowerLimit 오류');
  if (day(a.approvedAt) && day(today) && a.approvedAt > today) e.push('approvedAt이 미래');
  const lim = Math.min(a.maxPerDay || 0, a.providerLowerLimit || Infinity);
  return { ok: e.length === 0, errors: e, effective: e.length ? null : { provider: a.provider, tickers: a.tickers.slice(), perDay: Math.min(lim, LIMITS.perDay), total: Math.min(a.maxTotal, LIMITS.total) } };
}
/* 호출 예산: 시도하기 "전에" 센다(실패·재시도 포함). */
const newBudget = () => ({ total: 0, days: {} });
function canCall(b, today, eff) { const d = (b.days[today] || 0); if (b.total >= eff.total) return { ok: false, reason: '전체 한도(' + eff.total + ') 소진' }; if (d >= eff.perDay) return { ok: false, reason: '오늘 한도(' + eff.perDay + ') 소진' }; return { ok: true }; }
function record(b, today) { return { total: b.total + 1, days: Object.assign({}, b.days, { [today]: (b.days[today] || 0) + 1 }) }; }

/* Tiingo 일봉 "추정 형태": [{date:'2026-10-28T00:00:00.000Z', open, high, low, close, volume, adjClose, divCash, splitFactor}]. 실제 응답과 대조 전. */
function parseTiingoDaily(payload, symbol, today) {
  const issues = [], obs = [];
  if (payload && !Array.isArray(payload) && typeof payload === 'object' && payload.detail) return { ok: false, state: 'PROVIDER_ERROR', observations: [], issues: ['공급자 메시지: ' + String(payload.detail).slice(0, 120)] };
  if (!Array.isArray(payload)) return { ok: false, state: 'SHAPE_MISMATCH', observations: [], issues: ['배열 형태가 아님'] };
  if (!payload.length) return { ok: false, state: 'DATA_UNAVAILABLE', observations: [], issues: ['빈 응답(휴장·기간·권한 확인)'] };
  if (!ALLOWLIST.includes(symbol)) return { ok: false, state: 'BAD_REQUEST', observations: [], issues: ['허용되지 않은 종목'] };
  const seen = new Map();
  for (const r of payload) {
    const d = r && typeof r.date === 'string' ? r.date.slice(0, 10) : null, c = r && r.close, o = r && r.open, h = r && r.high, l = r && r.low;
    if (!day(d) || ![o, h, l, c].every(x => finite(x) && x > 0)) { issues.push('봉 필드 오류(' + d + ')'); continue; }
    if (h < l || c > h || c < l) { issues.push('고저 모순(' + d + ')'); continue; }
    if (seen.has(d)) { if (seen.get(d) !== c) issues.push('중복 날짜 종가 불일치(' + d + ')'); continue; } seen.set(d, c);
    const sf = r.splitFactor == null ? 1 : r.splitFactor; if (!finite(sf) || sf <= 0) { issues.push('splitFactor 오류(' + d + ')'); continue; }
    obs.push({ symbol, date: d, open: o, high: h, low: l, close: c, adjClose: finite(r.adjClose) ? r.adjClose : null, volume: finite(r.volume) ? r.volume : null, divCash: finite(r.divCash) ? r.divCash : 0, splitFactor: sf, currency: 'USD(문서 기준·응답에 없음)', priceType: '종가(정규장 확정 후, 문서 기준)', unadjusted: true });
  }
  obs.sort((x, y) => (x.date < y.date ? -1 : 1));
  const corp = obs.filter(x => x.splitFactor !== 1 || x.divCash > 0).map(x => ({ date: x.date, splitFactor: x.splitFactor, divCash: x.divCash }));
  const jumps = []; for (let i = 1; i < obs.length; i++) { const ch = obs[i].close / obs[i - 1].close - 1; if (Math.abs(ch) > 0.25) jumps.push({ date: obs[i].date, change: Math.round(ch * 1000) / 1000, explainedBySplit: obs[i].splitFactor !== 1 }); }
  const last = obs[obs.length - 1], stale = last && day(today) ? (Date.parse(today) - Date.parse(last.date)) / 86400000 > MAX_AGE_DAYS : null;
  return { ok: obs.length > 0 && issues.length === 0, state: obs.length ? (issues.length ? 'PARTIAL' : 'OK') : 'SHAPE_MISMATCH', observations: obs, issues, corporateActions: corp, jumps, stale, lastDate: last ? last.date : null };
}
/* 독립 대조: 사용자가 직접 확인한 기준값(다른 출처)과 같은 날짜·종가 유형으로 비교. 출처가 비었거나 공급자와 같으면 독립이 아니다. */
function crossCheck(obs, ref, provider, tol) {
  tol = tol == null ? 0.005 : tol;
  if (!ref || !nonEmpty(ref.source) || String(ref.source).toLowerCase().includes(provider)) return { status: 'no-independent-reference', note: '독립 검증 미완료: 기준값 출처가 없거나 공급자와 같음' };
  if (!day(ref.date) || !finite(ref.close) || ref.close <= 0) return { status: 'no-independent-reference', note: '독립 검증 미완료: 기준값 형식 오류' };
  if (ref.priceType && ref.priceType !== 'close') return { status: 'type-mismatch', note: '기준값이 종가가 아님 — 대조 불가' };
  const m = obs.find(x => x.date === ref.date); if (!m) return { status: 'date-mismatch', note: '같은 날짜 값 없음(휴장·시간대 확인)' };
  const diff = Math.abs(m.close - ref.close) / ref.close; return diff <= tol ? { status: 'independent-verified', diff } : { status: 'conflict', diff, note: '차이가 허용치(' + tol * 100 + '%) 초과 — 기업행위·휴장·시간대 확인' };
}
/* 집계: 세 숫자는 별개. 활성 감시는 이 파일럿으로 늘지 않는다(감시 승인·현재 유효 조건이 별도 필요). */
function summarize(results) {
  const c = f => results.filter(f).length;
  return { apiCalls: results.reduce((s, r) => s + (r.calls || 0), 0), fetchSuccess: c(r => r.calls > 0 && r.parse && r.parse.ok), independentVerified: c(r => r.calls > 0 && r.cross && r.cross.status === 'independent-verified'), activeMonitoring: 0,
    note: '조회 성공·독립 검증·활성 감시는 별개. 파일럿 결과는 활성 감시로 세지 않는다.' };
}
function maskSecrets(text, key) { let s = String(text); if (nonEmpty(key) && key.length >= 8) s = s.split(key).join('[키 가림]'); return s.replace(/(Token\s+)[A-Za-z0-9_\-]{8,}/gi, '$1[키 가림]').replace(/([?&](?:token|apikey|api_key|key)=)[^&\s]+/gi, '$1[키 가림]'); }
module.exports = { ALLOWLIST, LIMITS, IMPLEMENTED_PROVIDERS, KNOWN_PROVIDERS, MAX_AGE_DAYS, validateApproval, newBudget, canCall, record, parseTiingoDaily, crossCheck, summarize, maskSecrets };
