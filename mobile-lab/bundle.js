/* 생성 파일 — 직접 고치지 말 것. node tools/build-mobile-lab.cjs 로 재생성. 원본: kr-radar/*.js */
(function(){
"use strict";
var __defs={},__cache={};
__defs["./common.js"]=function(module,exports,require){
/* KST KR radar (stage7): shared pure helpers. No storage, network, timers, env or portfolio access. */
'use strict';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;
const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;
const copy = v => JSON.parse(JSON.stringify(v));
const httpsUrl = s => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
// KRX short codes are 6 characters. New listings may use letters, so digits-only is not assumed.
const CODE_RE = /^[0-9A-Z]{6}$/;
const SYNTH_ID = /^KR-DEMO-[A-Z0-9-]{1,24}$/;
// Calendar-day tolerance covers a weekend or a short holiday. An exact KRX trading calendar is NOT implemented.
const MAX_QUOTE_AGE_DAYS = 4;
const MAX_ASSESSMENT_AGE_DAYS = 150;
const MAX_CHECK_AGE_DAYS = 30;
function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; }
function baseResult(kind) {
  // Every result states, in the data itself, that nothing is wired to orders, alerts, accounts or real symbols.
  return { schemaVersion: 1, kind, mode: 'synthetic', status: '평가 불가', reasons: [], counterEvidence: [], missing: [], formulas: [], notes: [], automaticAction: false, order: null, notification: null, actualActiveCount: 0, realPriceValidated: 0, realApiRequests: 0 };
}
module.exports = { finite, nonEmpty, day, daysBetween, copy, httpsUrl, CODE_RE, SYNTH_ID, MAX_QUOTE_AGE_DAYS, MAX_ASSESSMENT_AGE_DAYS, MAX_CHECK_AGE_DAYS, deepFreeze, baseResult };

};
__defs["./krx-api.js"]=function(module,exports,require){
/* KST KR radar (stage8 supplement): 금융위원회_KRX상장종목정보 (GetKrxListedInfoService_V2/getItemInfo_V2) 응답 파서·검증기·후보 대조.
   OFFLINE ONLY. 이 파일은 네트워크·저장소·환경변수·타이머에 접근하지 않으며 인증키를 다루지 않는다.
   이 API는 "상장종목 식별정보 확인용"이다. 현재가·OHLC·52주·거래량·수정주가·신호 공급자가 아니다.
   응답 규격 근거: 활용가이드(24쪽) 응답 메시지 명세·예제. JSON 구조는 가이드에 예제가 없어 공공데이터포털 공통 형태를 가정한 것이며 미확정이다. */
'use strict';
const { day, daysBetween, copy } = require('./common.js');
const { classifyByName, MAX_LISTING_AGE_DAYS } = require('./listing.js');

const SERVICE = Object.freeze({ name: 'GetKrxListedInfoService_V2', operation: 'getItemInfo_V2', baseUrl: 'https://apis.data.go.kr/1160100/GetKrxListedInfoService_V2/getItemInfo_V2', provider: '금융위원회_KRX상장종목정보', maxRows: 10000, updateCycle: '일 1회(영업일 다음 영업일 13시 이후 개방)' });
const MARKETS = Object.freeze(['KOSPI', 'KOSDAQ', 'KONEX']);
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const REQUIRED_ITEM_FIELDS = Object.freeze(['basDt', 'srtnCd', 'isinCd', 'mrktCtg', 'itmsNm']);
const ISIN_RE = /^[A-Z]{2}[0-9A-Z]{9}[0-9]$/;

/* 가이드 2장 "OpenAPI 에러 코드정리"의 메시지만 분류한다. 그 밖의 값은 unknown. */
const ERROR_TABLE = Object.freeze([
  { re: /^unauthorized$/i, category: 'unauthorized', retryable: false, action: '인증키 존재/유효성 확인(키는 이 도구에 입력하지 않는다)' },
  { re: /^forbidden$/i, category: 'forbidden', retryable: false, action: '활용 신청/승인 상태 확인' },
  { re: /^api not found$/i, category: 'api-not-found', retryable: false, action: '호출 주소 오타·폐기 여부 확인' },
  { re: /error forwarding request to backend server/i, category: 'backend-unreachable', retryable: true, action: '잠시 후 재시도(자동 재시도 금지)' },
  { re: /error receiving response from backend server/i, category: 'backend-no-response', retryable: true, action: '반복되면 제공기관 문의' },
  { re: /api rate limit exceeded/i, category: 'rate-limited', retryable: true, action: '잠시 후 호출(자동 재시도 금지)' },
  { re: /api token quota exceeded/i, category: 'quota-exceeded', retryable: false, action: '일일 허용량 초기화 후 이용' },
  { re: /^unexpected error$/i, category: 'unexpected', retryable: true, action: '반복되면 활용지원센터 문의' },
]);
const HTTP_CATEGORY = Object.freeze({ 401: 'unauthorized', 403: 'forbidden', 404: 'api-not-found', 429: 'rate-limited' });
/* 공공데이터포털 공통 게이트웨이는 키 오류를 HTTP 200 + <OpenAPI_ServiceResponse>(returnReasonCode) 로 돌려주는 경우가 있다고 알려져 있으나
   이 숫자 코드는 활용가이드(24쪽)에 없는 **가정(미확인)** 이다. 알 수 없는 코드는 안전하게 gateway-error(재시도 없음)로 처리한다. */
const GATEWAY_CODES = Object.freeze({ '10': 'bad-request', '20': 'forbidden', '22': 'quota-exceeded', '30': 'unauthorized', '31': 'unauthorized', '32': 'forbidden', '33': 'unauthorized' });
function gatewayCode(text) {
  const t = String(text || ''), m = /<returnReasonCode>\s*(\d{1,3})\s*<\/returnReasonCode>/.exec(t) || /"(?:returnReasonCode|resultCode)"\s*:\s*"?(\d{1,3})"?/.exec(t);
  return m ? m[1] : null;
}

function classifyFailure({ httpStatus, text } = {}) {
  const t = typeof text === 'string' ? text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const gc = gatewayCode(text);
  if (gc && /OpenAPI_ServiceResponse|returnReasonCode|errMsg/.test(String(text || ''))) { const cat = GATEWAY_CODES[gc] || 'gateway-error'; return { category: cat, retryable: false, action: '게이트웨이 코드 ' + gc + (GATEWAY_CODES[gc] ? '(가이드 외 가정 매핑)' : '(미확인 코드)') + ' — 자동 재시도 금지', assumedMapping: true }; }
  for (const e of ERROR_TABLE) if (e.re.test(t)) return { category: e.category, retryable: e.retryable, action: e.action };
  if (HTTP_CATEGORY[httpStatus]) { const e = ERROR_TABLE.find(x => x.category === HTTP_CATEGORY[httpStatus]); return { category: e.category, retryable: e.retryable, action: e.action }; }
  if (Number.isInteger(httpStatus) && httpStatus >= 500) return { category: 'server-error', retryable: true, action: '잠시 후 재시도(자동 재시도 금지)' };
  return { category: 'unknown', retryable: false, action: '응답 원문 확인 필요(원문 저장 금지)' };
}

/* 단축코드 정규화. 'A000040' -> display '000040'. 원본(raw)은 그대로 보존한다. 접두 없는 6자리는 'bare'로 표시하되 허용. 코드를 추론·보정하지 않는다. */
function normalizeCode(raw) {
  if (typeof raw !== 'string') return { ok: false, raw, reason: 'not-string' };
  const s = raw.trim();
  let m = /^A([0-9A-Z]{6})$/.exec(s);
  if (m) return { ok: true, raw: s, code: m[1], form: 'A-prefixed' };
  m = /^([0-9A-Z]{6})$/.exec(s);
  if (m) return { ok: true, raw: s, code: m[1], form: 'bare' };
  return { ok: false, raw: s, reason: 'format' };
}
function isinChecksumOk(isin) {
  if (!ISIN_RE.test(isin)) return false;
  const digits = [...isin].map(ch => /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)).join('');
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) { let d = digits.charCodeAt(i) - 48; if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
  return sum % 10 === 0;
}
const basDtToIso = s => (typeof s === 'string' && /^\d{8}$/.test(s)) ? (v => day(v) ? v : null)(s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8)) : null;
const nfc = s => String(s).normalize('NFC').trim();
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/* ---- 최소 XML 파서(가이드 응답 형태 전용). DTD/ENTITY/CDATA 거부, 외부 의존성 없음. ---- */
function xmlFields(block) {
  const o = {}; const re = /<([A-Za-z][A-Za-z0-9]*)>([^<]*)<\/\1>|<([A-Za-z][A-Za-z0-9]*)\s*\/>/g; let m;
  while ((m = re.exec(block))) { if (m[1]) o[m[1]] = decode(m[2]).trim(); else o[m[3]] = ''; }
  return o;
}
function parseXml(text) {
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) throw new Error('xml: DTD/ENTITY/CDATA 거부');
  const root = /<response>([\s\S]*)<\/response>/.exec(text);
  if (!root) throw new Error('xml: <response> 루트 없음');
  const h = /<header>([\s\S]*?)<\/header>/.exec(root[1]), b = /<body>([\s\S]*?)<\/body>/.exec(root[1]);
  if (!h || !b) throw new Error('xml: header/body 누락');
  const body = b[1], itemsBlock = /<items>([\s\S]*?)<\/items>/.exec(body), itemsEmpty = /<items\s*\/>/.test(body);
  const items = []; const re = /<item>([\s\S]*?)<\/item>/g; let m;
  if (itemsBlock) while ((m = re.exec(itemsBlock[1]))) items.push(xmlFields(m[1]));
  const opens = (text.match(/<item>/g) || []).length, closes = (text.match(/<\/item>/g) || []).length;
  if (opens !== closes || opens !== items.length) throw new Error('xml: item 태그 불균형');
  return { header: xmlFields(h[1]), body: { ...xmlFields(body.replace(/<items>[\s\S]*?<\/items>/, '')), hasItems: !!itemsBlock || itemsEmpty }, items };
}
function parseJson(text) {
  const j = JSON.parse(text);
  const r = j && j.response; if (!r || !r.header || !r.body) throw new Error('json: response/header/body 누락');
  let it = r.body.items; if (it === '' || it == null) it = []; else if (it.item !== undefined) it = Array.isArray(it.item) ? it.item : (it.item ? [it.item] : []); else if (Array.isArray(it)) it = it; else throw new Error('json: items 형태 오류');
  const { items, ...body } = r.body;
  return { header: r.header, body: { ...body, hasItems: r.body.items !== undefined }, items: it.map(x => Object.fromEntries(Object.entries(x || {}).map(([k, v]) => [k, v == null ? '' : String(v)]))) };
}

const toInt = v => (typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : NaN));

/* 응답 1쪽을 파싱·검증한다. 절대 throw 하지 않는다. origin: 'fixture' | 'user-supplied-official'. */
function parseResponse(text, { format, httpStatus, responseSha256, origin = 'fixture', today } = {}) {
  const out = { ok: false, origin, format: null, errors: [], warnings: [], failure: null, page: null, rows: [], rejected: [], responseSha256: /^[0-9a-f]{64}$/.test(responseSha256 || '') ? responseSha256 : null, realApiRequests: 0 };
  if (!out.responseSha256) out.errors.push('responseSha256(64 hex) 누락 — 호출자가 원본 바이트의 해시를 계산해 전달해야 함');
  if (!['fixture', 'user-supplied-official'].includes(origin)) { out.errors.push('origin'); return out; }
  if (typeof text !== 'string' || !text.trim()) { out.failure = classifyFailure({ httpStatus, text }); out.errors.push('빈 응답'); return out; }
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) { out.errors.push('응답 크기 상한 초과'); return out; }
  const t = text.trim(), f = format || (t.startsWith('{') ? 'json' : t.startsWith('<') ? 'xml' : 'text');
  out.format = f;
  const fail = classifyFailure({ httpStatus, text: t.startsWith('{') || /<response>/.test(t) ? '' : t });
  let p;
  try {
    if (f === 'json') p = parseJson(t); else if (f === 'xml') {
      if (/OpenAPI_ServiceResponse|<errMsg>|<returnAuthMsg>/.test(t) && !/<response>/.test(t)) { out.failure = classifyFailure({ httpStatus, text: t }); out.errors.push('게이트웨이 오류 응답: ' + out.failure.category); return out; }
      p = parseXml(t);
    } else { out.failure = fail; out.errors.push('파싱 불가 형식: ' + fail.category); return out; }
  } catch (e) { out.errors.push('파싱 실패: ' + e.message); out.failure = { category: 'parse-error', retryable: false, action: '응답 형식 확인' }; return out; }
  const rc = String(p.header.resultCode == null ? '' : p.header.resultCode);
  if (rc !== '00') { out.failure = { category: 'result-code', retryable: false, action: 'resultCode=' + rc + ' / ' + String(p.header.resultMsg || '').slice(0, 80) }; out.errors.push('resultCode 실패: ' + rc); return out; }
  const numOfRows = toInt(p.body.numOfRows), pageNo = toInt(p.body.pageNo), totalCount = toInt(p.body.totalCount);
  if (![numOfRows, pageNo, totalCount].every(Number.isInteger)) { out.errors.push('페이지 정보(numOfRows/pageNo/totalCount) 누락·형식 오류'); return out; }
  if (numOfRows < 1 || numOfRows > SERVICE.maxRows) out.errors.push('numOfRows 범위 오류(1~' + SERVICE.maxRows + ')');
  if (pageNo < 1) out.errors.push('pageNo 오류');
  if (totalCount < 0) out.errors.push('totalCount 오류');
  out.page = { numOfRows, pageNo, totalCount };
  if (!out.errors.length) {
    const expected = Math.min(numOfRows, Math.max(0, totalCount - (pageNo - 1) * numOfRows));
    if (p.items.length > numOfRows) out.errors.push('item 수가 numOfRows 초과');
    else if (p.items.length !== expected) out.errors.push('페이지 불일치: item ' + p.items.length + '건, 기대 ' + expected + '건(totalCount ' + totalCount + ')');
  }
  if (totalCount === 0 || p.items.length === 0) out.warnings.push('빈 데이터(휴일·미개방일 또는 조건 불일치 가능) — 검증 근거로 사용 불가');
  const seen = new Map();
  for (const it of p.items) {
    const why = [];
    for (const k of REQUIRED_ITEM_FIELDS) if (!it[k]) why.push('누락:' + k);
    const nc = normalizeCode(it.srtnCd); if (it.srtnCd && !nc.ok) why.push('코드형식');
    const iso = basDtToIso(it.basDt); if (it.basDt && !iso) why.push('기준일형식');
    if (it.mrktCtg && !MARKETS.includes(it.mrktCtg)) why.push('비정상시장:' + it.mrktCtg);
    if (it.isinCd && !isinChecksumOk(it.isinCd)) why.push('ISIN형식/체크섬');
    else if (it.isinCd && nc.ok && /^KR7/.test(it.isinCd) && it.isinCd.slice(3, 9) !== nc.code) why.push('ISIN-코드 불일치');
    if (why.length) { out.rejected.push({ srtnCd: it.srtnCd || null, reasons: why }); continue; }
    const row = { raw: { srtnCd: nc.raw, basDt: it.basDt, isinCd: it.isinCd, mrktCtg: it.mrktCtg, itmsNm: it.itmsNm }, code: nc.code, codeForm: nc.form, name: nfc(it.itmsNm), market: it.mrktCtg, isin: it.isinCd, baseDate: iso, hint: classifyByName(it.itmsNm) };
    if (seen.has(row.code)) { seen.get(row.code).dup = true; out.rejected.push({ srtnCd: row.raw.srtnCd, reasons: ['중복코드'] }); continue; }
    seen.set(row.code, row); row.dup = false; out.rows.push(row);
  }
  for (const r of out.rows) if (r.dup) { out.rejected.push({ srtnCd: r.raw.srtnCd, reasons: ['중복코드(최초 행 포함 모호)'] }); }
  out.rows = out.rows.filter(r => !r.dup);
  const dates = new Set(out.rows.map(r => r.baseDate)); if (dates.size > 1) out.errors.push('한 응답에 서로 다른 기준일 혼재');
  out.ok = out.errors.length === 0 && out.rows.length > 0 && !!out.responseSha256;
  return out;
}

/* 여러 쪽을 합친다: 쪽 번호 1..N 연속·동일 totalCount·동일 기준일·코드 중복 없음이 모두 필요. */
function assemblePages(pages) {
  const out = { ok: false, errors: [], rows: [], totalCount: null, baseDate: null, hashes: [] };
  if (!Array.isArray(pages) || !pages.length) { out.errors.push('쪽 없음'); return out; }
  if (pages.some(p => !p || !p.ok)) out.errors.push('유효하지 않은 쪽 포함');
  if (out.errors.length) return out;
  const sorted = pages.slice().sort((a, b) => a.page.pageNo - b.page.pageNo);
  sorted.forEach((p, i) => { if (p.page.pageNo !== i + 1) out.errors.push('쪽 번호 불연속'); });
  if (new Set(sorted.map(p => p.page.totalCount)).size > 1) out.errors.push('totalCount 불일치');
  if (new Set(sorted.map(p => p.page.numOfRows)).size > 1) out.errors.push('numOfRows 불일치');
  if (new Set(sorted.map(p => p.origin)).size > 1) out.errors.push('출처(origin) 혼합 금지');
  const seen = new Set();
  for (const p of sorted) for (const r of p.rows) { if (seen.has(r.code)) out.errors.push('쪽 간 중복코드 ' + r.code); seen.add(r.code); out.rows.push(r); }
  const total = sorted[0].page.totalCount, rejectedN = sorted.reduce((n, p) => n + p.rejected.length, 0);
  if (out.rows.length + rejectedN !== total) out.errors.push('수집 건수(' + (out.rows.length + rejectedN) + ')가 totalCount(' + total + ')와 다름 — 쪽 누락 가능');
  if (new Set(out.rows.map(r => r.baseDate)).size > 1) out.errors.push('기준일 혼재');
  out.totalCount = total; out.baseDate = out.rows[0] ? out.rows[0].baseDate : null; out.hashes = sorted.map(p => p.responseSha256); out.origin = sorted[0].origin;
  out.ok = out.errors.length === 0; return out;
}

/* ---- 공급자 어댑터: 기본 OFF. fixture 모드는 메모리 내 문자열만 돌려준다. 실제 호출 모드는 존재하지 않는다. ---- */
function buildRequestSpec(params = {}) {
  if ('serviceKey' in params) throw new Error('인증키는 이 모듈에 전달할 수 없습니다. 서버 측 비밀 저장소에서만 다룹니다.');
  const allowed = ['numOfRows', 'pageNo', 'resultType', 'basDt', 'beginBasDt', 'endBasDt', 'likeBasDt', 'likeSrtnCd', 'isinCd', 'likeIsinCd', 'itmsNm', 'likeItmsNm', 'crno', 'corpNm', 'likeCorpNm'];
  const q = [];
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.includes(k)) throw new Error('알 수 없는 요청 변수: ' + k);
    if (k === 'numOfRows' && !(Number.isInteger(v) && v >= 1 && v <= SERVICE.maxRows)) throw new Error('numOfRows는 1~' + SERVICE.maxRows);
    if (k === 'pageNo' && !(Number.isInteger(v) && v >= 1)) throw new Error('pageNo');
    if (k === 'resultType' && !['xml', 'json'].includes(v)) throw new Error('resultType');
    if (/^(basDt|beginBasDt|endBasDt)$/.test(k) && !/^\d{8}$/.test(String(v))) throw new Error(k + ' 형식(YYYYMMDD)');
    q.push(k + '=' + encodeURIComponent(String(v)));
  }
  return Object.freeze({ method: 'GET', urlTemplate: SERVICE.baseUrl + '?serviceKey=<서버측-비밀저장소에서-주입>' + (q.length ? '&' + q.join('&') : ''), keyIncluded: false, sendable: false, note: '명세 문자열일 뿐 전송 수단이 없다. 실제 호출은 별도 승인 후 서버 측 코드에서만.' });
}
function createKrxListingAdapter({ mode = 'off', fixtures = null } = {}) {
  if (!['off', 'fixture'].includes(mode)) throw new Error('실제 호출 모드는 구현되어 있지 않습니다. 별도 승인·권리 확인·서버측 키 보관 후에만 가능합니다.');
  return Object.freeze({ id: 'fsc-krx-listed-info', mode, realNetwork: false, async load(key) {
    if (mode === 'off') throw new Error('KRX 공식 API 어댑터 비활성(OFF)');
    if (!fixtures || !Object.prototype.hasOwnProperty.call(fixtures, key)) throw new Error('픽스처 없음: ' + key);
    return { text: fixtures[key], origin: 'fixture', realApiRequests: 0 };
  } });
}

/* ---- 후보 대조: 입력 데이터는 변경하지 않는다. verified는 origin이 사용자가 제공한 실제 공식 응답일 때만 부여한다. ---- */
function compareCandidates(data, listing, { today, exclusions = [], rightsConfirmed = false, expectedBaseDate = null } = {}) {
  const res = { kind: 'krx-api-verification', mode: listing && listing.origin === 'user-supplied-official' ? 'offline-official-response' : 'fixture-only', origin: listing ? listing.origin : null, errors: [], entries: [], log: [], counts: null, realApiRequests: 0, realPriceApiRequests: 0, actualActiveCount: 0, officialVerifiedCount: 0 };
  if (!day(today)) { res.errors.push('today'); return res; }
  if (!data || !Array.isArray(data.securities)) { res.errors.push('universe 형식'); return res; }
  const ex = new Map((Array.isArray(exclusions) ? exclusions : []).filter(e => e && e.code && e.reason && e.confirmedBy && day(e.confirmedAt)).map(e => [e.code, e]));
  let blockReason = null, byCode = new Map();
  if (!listing || !listing.rows) blockReason = '공식 응답 없음';
  else if (!listing.ok) blockReason = '응답 검증 실패: ' + (listing.errors || []).join(';');
  else if (!day(listing.baseDate || (listing.rows[0] && listing.rows[0].baseDate))) blockReason = '기준일 없음';
  else {
    const base = listing.baseDate || listing.rows[0].baseDate;
    if (expectedBaseDate && base !== expectedBaseDate) blockReason = '기준일 불일치: 요청 ' + expectedBaseDate + ' / 응답 ' + base;
    else if (base > today) blockReason = '기준일이 미래';
    else if (daysBetween(base, today) > MAX_LISTING_AGE_DAYS) blockReason = 'stale: 기준일 ' + base + ' (' + MAX_LISTING_AGE_DAYS + '일 초과)';
    else byCode = new Map(listing.rows.map(r => [r.code, r]));
  }
  const baseDate = listing && (listing.baseDate || (listing.rows && listing.rows[0] && listing.rows[0].baseDate)) || null;
  const hash = listing ? (listing.responseSha256 || (listing.hashes || []).join(',')) || null : null;
  const counts = { stockCandidates: 0, verified: 0, pending: 0, excluded: 0, fixtureMatchedNotCounted: 0, etfSeparate: 0, etfVerified: 0, etfPending: 0, preferredSeparate: 0 };
  for (const s of data.securities) {
    const isEtf = s.group === 'etf', hint = classifyByName(s.name), isPref = !isEtf && hint === 'preferred-suspected';
    if (isEtf) counts.etfSeparate++; else if (isPref) counts.preferredSeparate++; else counts.stockCandidates++;
    let status = 'pending', rule = '', l = null;
    if (ex.has(s.code)) { status = 'excluded'; rule = 'exclusion-confirmed:' + ex.get(s.code).reason; }
    else if (isPref) rule = 'preferred-not-provided-by-api';
    else if (blockReason) rule = 'blocked:' + blockReason;
    else if (!(l = byCode.get(s.code))) rule = isEtf ? 'etf-not-found(API 포함 범위 미확인)' : 'not-found-in-response';
    else if (l.name !== nfc(s.name)) rule = 'name-mismatch';
    else if (l.market !== s.market) rule = 'market-mismatch';
    else if (s.isin && l.isin !== s.isin) rule = 'isin-mismatch';
    else if (!isEtf && l.hint !== 'common-presumed') rule = 'security-type-suspected:' + l.hint;
    else { rule = 'exact code+name+market'; status = listing.origin === 'user-supplied-official' ? 'verified' : 'fixture-matched'; }
    const e = { code: s.code, name: s.name, market: s.market, group: s.group || 'stock', status, rule, isin: l ? l.isin : null, rawCode: l ? l.raw.srtnCd : null, baseDate: l ? l.baseDate : baseDate, decision: 'HOLD', priceStatus: 'DATA_UNAVAILABLE', rightsConfirmed: !!rightsConfirmed };
    res.entries.push(e);
    res.log.push({ code: e.code, name: e.name, market: e.market, isin: e.isin, baseDate: e.baseDate, source: SERVICE.provider + ' / ' + SERVICE.operation + (listing && listing.origin === 'fixture' ? ' (문서예시/합성 픽스처 — 공식 조회 아님)' : ''), responseSha256: hash, rule, result: status });
    if (status === 'excluded') counts.excluded++;
    else if (status === 'verified') { if (isEtf) counts.etfVerified++; else counts.verified++; }
    else if (status === 'fixture-matched') counts.fixtureMatchedNotCounted++;
    else if (isEtf) counts.etfPending++; else if (!isPref) counts.pending++;
  }
  res.counts = counts; res.officialVerifiedCount = counts.verified + counts.etfVerified;
  res.notes = ['이 API는 식별정보 확인용이며 가격·거래량·신호를 제공하지 않는다 → 모든 항목 HOLD / DATA_UNAVAILABLE', '종목명 변경·기업행위·시장 이전·상장폐지·거래정지는 이 API만으로 검증할 수 없다', '원본 응답 전체는 저장·재배포하지 않고 해시만 기록한다', rightsConfirmed ? '권리 확인됨(호출자 입력)' : '저장·가공·커밋·배포 권리 미확정 — 내부 점검 결과로만 취급'];
  return res;
}
module.exports = { GATEWAY_CODES, gatewayCode, SERVICE, MARKETS, MAX_TEXT_BYTES, ERROR_TABLE, classifyFailure, normalizeCode, isinChecksumOk, basDtToIso, parseResponse, assemblePages, buildRequestSpec, createKrxListingAdapter, compareCandidates, copy };

};
__defs["./krx-run.js"]=function(module,exports,require){
/* KST (stage12): 공식 KRX상장종목정보 조회의 "실행 오케스트레이션". Pure — 전송 수단(transport)·대기(wait)·해시(sha256)는 호출자가 주입한다.
   이 파일은 네트워크·환경변수·타이머·저장소에 접근하지 않는다. 실제 전송은 tools/krx-live-runner.cjs(개인 PC 전용)만 수행한다.
   호출 총량 상한 20회(재시도 포함), 재시도는 일시 오류만 최대 2회(지수 백오프), 영구 오류는 즉시 중단, 모든 오류 문구는 키 마스킹. */
'use strict';
const { day, daysBetween } = require('./common.js');
const K = require('./krx-api.js');
const VERIFIER_VERSION = 'krx-verify-2026.10.29-s12';
const HARD_MAX_CALLS = 20, MAX_RETRIES = 2, BACKOFF_MS = Object.freeze([1000, 2000, 4000]), PAGE_SIZE = K.SERVICE.maxRows;
const TRANSIENT = new Set(['rate-limited', 'backend-unreachable', 'backend-no-response', 'unexpected', 'server-error', 'timeout', 'network']);
const HALT = new Set(['unauthorized', 'forbidden', 'quota-exceeded', 'api-not-found', 'gateway-error', 'bad-request', 'result-code']);

function maskSecrets(text, key) {
  let t = String(text == null ? '' : text);
  if (typeof key === 'string' && key.length >= 4) {
    const variants = new Set([key]); try { variants.add(encodeURIComponent(key)); variants.add(decodeURIComponent(key)); } catch { /* 이미 인코딩 안 된 값 */ }
    for (const v of variants) if (v && v.length >= 4) t = t.split(v).join('***');
  }
  return t.replace(/serviceKey=[^&\s"'<>]*/gi, 'serviceKey=***').replace(/(authorization|x-api-key)\s*[:=]\s*\S+/gi, '$1=***');
}
/* 승인 기록은 사용자가 로컬에 직접 만든 파일이다. 이 모듈은 "있다/형식이 맞다"만 확인하며 승인을 만들어내지 않는다. */
function validateApproval(a, today) {
  const e = [];
  if (!a || typeof a !== 'object') return ['승인 기록 없음'];
  if (a.approvedBy !== 'user') e.push('approvedBy=user 필요');
  if (!day(a.approvedAt) || (day(today) && a.approvedAt > today)) e.push('approvedAt');
  if (!/^\d{8}$/.test(String(a.basDt || ''))) e.push('basDt(YYYYMMDD)');
  if (!Number.isInteger(a.maxCalls) || a.maxCalls < 1 || a.maxCalls > HARD_MAX_CALLS) e.push('maxCalls는 1~' + HARD_MAX_CALLS);
  if (typeof a.scope !== 'string' || !a.scope.trim()) e.push('scope');
  if (a.expiresAt !== undefined && (!day(a.expiresAt) || (day(today) && a.expiresAt < today))) e.push('승인 만료');
  return e;
}
/* 계획만 만든다(호출하지 않음). 1단계 탐색(1건) → 2단계 쪽별 조회. 예상 총 호출수를 먼저 계산해 상한 초과 계획을 거절한다. */
const weekdayOf = basDt => new Date(Date.UTC(+basDt.slice(0, 4), +basDt.slice(4, 6) - 1, +basDt.slice(6, 8))).getUTCDay();
function planCalls({ basDt, totalCount = null, maxCalls = HARD_MAX_CALLS, resultType = 'xml', queriedAt = null, probeDone = false }) {
  const errs = [], warnings = [];
  if (!['xml', 'json'].includes(resultType)) errs.push('resultType(xml|json)');
  if (!/^\d{8}$/.test(String(basDt || ''))) errs.push('basDt');
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > HARD_MAX_CALLS) errs.push('maxCalls');
  const pages = Number.isInteger(totalCount) ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : null;
  if (/^\d{8}$/.test(String(basDt || '')) && day(String(basDt).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'))) {
    const wd = weekdayOf(String(basDt)); if (wd === 0 || wd === 6) warnings.push('기준일이 주말 — 거래일이 아니라 빈 응답일 가능성이 높음(공휴일 캘린더는 미구현)');
    if (day(queriedAt)) { const iso = String(basDt).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), lag = daysBetween(iso, queriedAt); if (lag < 0) errs.push('기준일이 조회일보다 미래'); else if (lag < 2) warnings.push('기준일이 조회일 기준 ' + lag + '일 전 — 가이드상 영업일 하루 뒤 13시 이후 개방이라 아직 없을 수 있음'); }
  } else if (/^\d{8}$/.test(String(basDt || ''))) errs.push('basDt 달력상 존재하지 않는 날짜');
  const minimum = (probeDone ? 0 : 1) + (pages === null ? 1 : pages);   /* 재개 시 탐색 호출은 이미 끝났으므로 세지 않는다(14단계) */
  if (!errs.length && minimum > maxCalls) errs.push('최소 필요 호출수 ' + minimum + ' > 상한 ' + maxCalls);
  return { ok: errs.length === 0, errors: errs, warnings, resultType, minimumCalls: minimum, pages, steps: [{ phase: 'probe', params: { numOfRows: 1, pageNo: 1, resultType, basDt: String(basDt) } }, { phase: 'pages', params: { numOfRows: PAGE_SIZE, resultType, basDt: String(basDt) }, pageCount: pages }], note: '명세만 있음 — 실제 호출은 tools/krx-live-runner.cjs --live 와 사용자 승인 기록이 모두 있을 때만' };
}
function resultOk(r) { return { ok: true, record: r }; }
async function runPlan({ basDt, maxCalls = HARD_MAX_CALLS, key, transport, wait, sha256, queriedAt, origin = 'fixture', resume = null, resultType = 'xml', maxRetries = MAX_RETRIES }) {
  const retries = Number.isInteger(maxRetries) ? Math.min(Math.max(maxRetries, 0), MAX_RETRIES) : MAX_RETRIES;   /* 14단계: 모바일 흐름은 0(자동 재시도 없음) */
  const out = { status: 'failed', reason: null, transportCalls: 0, attempts: [], pages: [], raw: [], listing: null, missingPages: [], resume: null, queriedAt: queriedAt || null, verifierVersion: VERIFIER_VERSION, acquisition: origin === 'fixture' ? 'fixture' : 'local-runner', warnings: [] };
  const fail = (status, reason) => { out.status = status; out.reason = maskSecrets(reason, key); return out; };
  if (typeof transport !== 'function' || typeof wait !== 'function' || typeof sha256 !== 'function') return fail('blocked', '주입 의존성(transport/wait/sha256) 누락');
  if (!day(queriedAt)) return fail('blocked', 'queriedAt(YYYY-MM-DD) 필요');
  const plan = planCalls({ basDt, maxCalls, totalCount: resume && resume.totalCount, resultType, queriedAt, probeDone: !!(resume && Number.isInteger(resume.totalCount)) }); if (!plan.ok) return fail('blocked', plan.errors.join('; '));
  if (origin !== 'fixture' && (typeof key !== 'string' || key.length < 8)) return fail('blocked', '인증키 없음(환경변수에서만 주입)');
  const spec = params => { const s = K.buildRequestSpec(params); return { template: s.urlTemplate }; };
  const urlFor = params => { const t = spec(params).template; const k = key ? (/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)) : ''; return t.replace('<서버측-비밀저장소에서-주입>', k); };
  async function callOnce(phase, pageNo, params) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (out.transportCalls >= maxCalls) return { halt: 'budget-exhausted' };
      out.transportCalls++;
      let res, cat = null, parsed = null;
      try { res = await transport({ url: urlFor(params), timeoutMs: 15000 }); } catch (e) { cat = /timeout|ETIMEDOUT|aborted/i.test(String(e && e.message)) ? 'timeout' : 'network'; res = null; }
      let text = res && typeof res.text === 'string' ? res.text : '';
      if (res && !cat) {
        const f = K.classifyFailure({ httpStatus: res.status, text });
        if (res.status >= 400 || (f.category !== 'unknown' && !/<response>|"response"/.test(text))) cat = f.category;
        else { const sha = sha256(text); parsed = K.parseResponse(text, { httpStatus: res.status, responseSha256: sha, origin, format: resultType }); if (!parsed.ok && !(phase === 'probe' && parsed.page && parsed.errors.length === 0)) cat = parsed.failure ? parsed.failure.category : 'parse-error'; out.lastSha = sha; }
      }
      out.attempts.push({ phase, pageNo, try: attempt + 1, httpStatus: res ? res.status : null, category: cat || 'ok' });
      if (!cat) return { ok: true, parsed, text, sha: out.lastSha };
      if (HALT.has(cat)) return { halt: cat };
      if (!TRANSIENT.has(cat) || attempt === retries) return { permanent: cat };
      await wait(BACKOFF_MS[attempt]);
    }
    return { permanent: 'unknown' };
  }
  let total = resume && Number.isInteger(resume.totalCount) ? resume.totalCount : null;
  const done = new Map(); for (const d of (resume && resume.done) || []) done.set(d.pageNo, d);
  if (total === null) {
    const r = await callOnce('probe', 0, { numOfRows: 1, pageNo: 1, resultType, basDt: String(basDt) });
    if (!r.ok) return fail(r.halt ? 'blocked' : 'failed', '탐색 호출 실패: ' + (r.halt || r.permanent));
    total = r.parsed.page.totalCount;
    if (total === 0) return fail('failed', '빈 데이터(휴일·미개방일 가능)');
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (out.transportCalls + (pages - done.size) > maxCalls) return fail('blocked', '필요 호출수가 상한 초과');
  for (let p = 1; p <= pages; p++) {
    if (done.has(p)) { const d = done.get(p), parsed = K.parseResponse(d.text, { responseSha256: sha256(d.text), origin }); if (parsed.ok) { out.pages.push(parsed); out.raw.push({ pageNo: p, text: d.text, sha256: sha256(d.text) }); continue; } }
    const r = await callOnce('pages', p, { numOfRows: PAGE_SIZE, pageNo: p, resultType, basDt: String(basDt) });
    if (r.ok) { out.pages.push(r.parsed); out.raw.push({ pageNo: p, text: r.text, sha256: r.sha }); }
    else { out.missingPages.push(p); if (r.halt) { for (let q = p + 1; q <= pages; q++) out.missingPages.push(q); out.reason = '중단: ' + r.halt; break; } }
  }
  out.resume = { basDt: String(basDt), totalCount: total, done: out.raw.map(r => ({ pageNo: r.pageNo, text: r.text })), missing: out.missingPages.slice() };
  if (out.missingPages.length) { out.status = 'partial'; out.reason = out.reason || '일부 쪽 실패(누락 쪽만 재시도 가능)'; return out; }
  const asm = K.assemblePages(out.pages);
  out.listing = { ...asm, origin, page: { totalCount: total }, responseSha256: null, baseDate: asm.baseDate, rejected: out.pages.flatMap(p => p.rejected) };
  if (!asm.ok) return fail('failed', '쪽 합치기 실패: ' + asm.errors.join('; '));
  if (asm.baseDate !== `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`) return fail('blocked', 'basDt 불일치: 요청 ' + basDt + ' / 응답 ' + asm.baseDate);
  if (daysBetween(asm.baseDate, queriedAt) < 0) return fail('blocked', '기준일이 조회일보다 미래');
  if (asm.baseDate === queriedAt) out.warnings.push('기준일=조회일: 가이드상 다음 영업일 13시 이후 개방이라 비정상 가능');
  out.status = 'complete'; return out;
}
module.exports = { VERIFIER_VERSION, HARD_MAX_CALLS, MAX_RETRIES, BACKOFF_MS, PAGE_SIZE, maskSecrets, validateApproval, planCalls, runPlan, resultOk };

};
__defs["./krx-status.js"]=function(module,exports,require){
/* KST (stage12): 73개 후보 검증 결과를 VERIFIED / MISMATCH / PENDING / EXCLUDED 4상태로 정리한다. Pure.
   VERIFIED 는 (사용자가 제공/로컬 실행기가 받은 공식 응답) + 기준일 + 응답 해시가 모두 있을 때만. 실제 주가 확인·활성 감시 수와 절대 합산하지 않는다. */
'use strict';
const { VERIFIER_VERSION } = require('./krx-run.js');
const PL = require('./pipeline.js');
const STATES = Object.freeze(['VERIFIED', 'MISMATCH', 'PENDING', 'EXCLUDED']);
// 비교 우선순위(문서화): ① 제외 확정 ② 우선주(API 미제공) ③ 응답 차단(기준일/해시/권리) ④ 코드(정규화 후) 존재 ⑤ 시장 ⑥ 종목명(NFC 정확 일치) ⑦ ISIN ⑧ 유형 의심
const MISMATCH_RULES = /^(name-mismatch|market-mismatch|isin-mismatch|security-type-suspected)/;
const NOTES = Object.freeze({ 'name-mismatch': '종목명 불일치 — 이름 변경 가능성은 있으나 이 API로는 개명/기업행위를 확인할 수 없음(사람 검토)', 'market-mismatch': '시장 불일치 — 시장 이전 가능성(이 API로 사유 확인 불가)', 'isin-mismatch': 'ISIN 불일치', 'not-found-in-response': '응답에 없음 — 상장폐지/코드 오류/응답 범위 밖 모두 가능(원인 미확정)', 'preferred-not-provided-by-api': '우선주는 API 미제공 대상' });
function stateOf(e) {
  if (e.status === 'excluded') return ['EXCLUDED', e.rule];
  if (e.status === 'verified') return e.baseDate && e.responseSha256Present ? ['VERIFIED', e.rule] : ['PENDING', 'verified-evidence-incomplete'];
  if (MISMATCH_RULES.test(e.rule || '')) return ['MISMATCH', e.rule];
  if (e.status === 'fixture-matched') return ['PENDING', 'fixture-only(공식 조회 아님)'];
  return ['PENDING', e.rule || 'pending'];
}
function toStates(comparison) {
  const zero = () => ({ VERIFIED: 0, MISMATCH: 0, PENDING: 0, EXCLUDED: 0, total: 0 });
  const t = { stock: zero(), etf: zero(), preferred: zero() };
  const hash = comparison && comparison.log && comparison.log[0] ? comparison.log[0].responseSha256 : null;
  const entries = (comparison && comparison.entries || []).map((e, i) => {
    const log = comparison.log[i], [state, rule] = stateOf({ ...e, responseSha256Present: !!(log && /^[0-9a-f]{64}(,[0-9a-f]{64})*$/.test(log.responseSha256 || '')) });
    const isPref = rule === 'preferred-not-provided-by-api', bucket = e.group === 'etf' ? 'etf' : isPref ? 'preferred' : 'stock';
    t[bucket][state]++; t[bucket].total++;
    return { code: e.code, name: e.name, group: bucket, state, rule, note: NOTES[rule] || null, baseDate: e.baseDate, evidenceHash: state === 'VERIFIED' ? log.responseSha256 : null, verifierVersion: VERIFIER_VERSION, signalsEnabled: false, priceVerified: false, decision: 'HOLD', priceStatus: 'DATA_UNAVAILABLE' };
  });
  return { entries, totals: t, hashPresent: !!hash, realPriceVerifiedCount: 0, actualActiveMonitoredCount: 0, note: 'VERIFIED = 종목 신원 일치만 의미. 실제 주가 확인 종목 수·활성 감시 종목 수와 별개(둘 다 0).' };
}
/* 어떤 경우에도 미검증 종목의 매수·매도 신호는 열리지 않는다. 검증돼도 정책(realActivationAllowed=false)이 막는다. */
function signalGate(entry) {
  const why = [];
  if (!entry || entry.state !== 'VERIFIED') why.push('KRX 신원 ' + (entry ? entry.state : '없음'));
  if (!entry || entry.priceVerified !== true) why.push('실제 시세 미검증');
  if (!PL.POLICY.realActivationAllowed) why.push(PL.POLICY.reason);
  return { allowed: why.length === 0, reasons: why, decision: 'HOLD' };
}
module.exports = { STATES, MISMATCH_RULES, NOTES, stateOf, toStates, signalGate };

};
__defs["./listing.js"]=function(module,exports,require){
/* KST KR radar (stage8): OFFLINE verification of the candidate list against a user-supplied OFFICIAL listing package.
   Pure functions. No network, storage, env, timers or real holdings. A match proves only that a code/name/market triple exists
   in the supplied file on its base date; it never activates monitoring (that also needs rights-cleared, verified prices). */
'use strict';
const { CODE_RE, nonEmpty, day, daysBetween, httpsUrl, copy } = require('./common.js');
const MAX_LISTING_AGE_DAYS = 10;
const MARKETS = ['KOSPI', 'KOSDAQ', 'KONEX'];
const nfc = s => String(s).normalize('NFC').trim();
// Name-based hints are suspicions only. They send an item to HOLD; they never exclude or confirm on their own.
function classifyByName(name) {
  const n = nfc(name || '');
  if (/스팩|제\d+호$/.test(n)) return 'spac-suspected';
  if (/(?<!메)리츠|REIT/i.test(n)) return 'reit-suspected'; // '메리츠' 같은 일반 사명의 오탐 방지(12단계)
  if (/ETN$|\bETN\b/i.test(n)) return 'etn-suspected';
  if (/(우|우B|우C|\d우|우\(전환\))$/.test(n)) return 'preferred-suspected';
  if (/^(KODEX|TIGER|KBSTAR|ACE|SOL|HANARO|ARIRANG|KOSEF|PLUS|RISE)\b/i.test(n)) return 'etf-suspected';
  return 'common-presumed';
}
function checkProvenance(p, today) {
  const e = [];
  if (!p || typeof p !== 'object') return ['provenance 누락'];
  if (!nonEmpty(p.provider)) e.push('provider');
  if (!nonEmpty(p.datasetName)) e.push('datasetName');
  if (!httpsUrl(p.sourceUrl)) e.push('sourceUrl(https)');
  if (!day(p.baseDate)) e.push('baseDate');
  if (!day(p.queriedAt)) e.push('queriedAt');
  if (!/^[0-9a-f]{64}$/.test(p.sha256 || '')) e.push('sha256(64 hex)');
  if (!nonEmpty(p.licenseNote)) e.push('licenseNote(이용허락범위 기록)');
  if (!Number.isInteger(p.rowCount) || p.rowCount < 1) e.push('rowCount');
  if (day(p.baseDate) && day(p.queriedAt) && p.baseDate > p.queriedAt) e.push('baseDate가 조회일보다 늦음');
  if (day(today) && day(p.queriedAt) && p.queriedAt > today) e.push('queriedAt이 미래');
  return e;
}
/* Returns {ok, stale, errors, byCode, duplicates, rows}. Never throws on bad data. */
function normalizeListing(pkg, { today, fileSha256 } = {}) {
  const out = { ok: false, stale: false, errors: [], byCode: new Map(), duplicates: [], rows: 0 };
  if (!day(today)) { out.errors.push('today'); return out; }
  if (!pkg || !Array.isArray(pkg.rows)) { out.errors.push('상장목록 패키지 형식 오류'); return out; }
  out.errors.push(...checkProvenance(pkg.provenance, today).map(x => 'provenance: ' + x));
  if (fileSha256 !== undefined && pkg.provenance && fileSha256 !== pkg.provenance.sha256) out.errors.push('원본 파일 해시 불일치');
  if (pkg.provenance && pkg.provenance.rowCount !== pkg.rows.length) out.errors.push('rowCount와 실제 행 수 불일치');
  const seen = new Map();
  for (const r of pkg.rows) {
    if (!r || !CODE_RE.test(r.code || '') || !nonEmpty(r.name) || !MARKETS.includes(r.market)) { out.errors.push('잘못된 행: ' + JSON.stringify(r && r.code)); continue; }
    if (seen.has(r.code)) { out.duplicates.push(r.code); continue; }
    seen.set(r.code, { code: r.code, name: nfc(r.name), market: r.market, isin: r.isin || null, hint: classifyByName(r.name) });
  }
  out.byCode = seen; out.rows = pkg.rows.length;
  for (const c of out.duplicates) seen.delete(c); // ambiguous code: nothing may match it
  if (day(pkg.provenance && pkg.provenance.baseDate) && day(today) && daysBetween(pkg.provenance.baseDate, today) > MAX_LISTING_AGE_DAYS) out.stale = true;
  out.ok = out.errors.length === 0 && !out.stale;
  return out;
}
/* Returns NEW data; the input is not mutated. Without a fully valid, fresh package every candidate stays 'unverified'. */
function crossCheckOfficial(data, pkg, opts = {}) {
  const norm = normalizeListing(pkg, opts), out = copy(data);
  const report = { matched: [], mismatch: [], notFound: [], ambiguous: [], blockedByPackage: [], packageErrors: norm.errors, stale: norm.stale, evidence: null };
  if (!norm.ok) { for (const s of out.securities) report.blockedByPackage.push(s.code); return { data: out, report, normalized: norm }; }
  const p = pkg.provenance;
  report.evidence = { provider: p.provider, datasetName: p.datasetName, baseDate: p.baseDate, queriedAt: p.queriedAt, sourceUrl: p.sourceUrl, sha256: p.sha256, licenseNote: p.licenseNote };
  for (const s of out.securities) {
    const l = norm.byCode.get(s.code);
    s.status = 'hold'; // a listing match never activates
    if (norm.duplicates.includes(s.code)) { s.listingCheck = 'mismatch'; report.ambiguous.push(s.code); continue; }
    if (!l) { s.listingCheck = 'not-found'; report.notFound.push(s.code); continue; }
    const exact = l.name === nfc(s.name) && l.market === s.market;
    const typeOk = s.group === 'etf' ? l.hint === 'etf-suspected' || l.hint === 'common-presumed' : l.hint === 'common-presumed';
    if (exact && typeOk) {
      s.listingCheck = 'matched'; s.reviewStatus = 'verified'; s.lastVerified = opts.today; s.codeStatus = 'official-listing-matched';
      s.listingEvidence = { provider: p.provider, baseDate: p.baseDate, sourceUrl: p.sourceUrl, sha256: p.sha256, isin: l.isin };
      report.matched.push(s.code);
    } else { s.listingCheck = 'mismatch'; report.mismatch.push({ code: s.code, reason: !exact ? 'name/market' : 'security-type:' + l.hint }); }
  }
  return { data: out, report, normalized: norm };
}
/* Fill the shortfall ONLY from the official listing. `picks` are explicit {code, sector, evaluationProfile, reason} choices made by a person/analyst;
   this function never chooses names itself and never invents a code. */
function supplement(data, pkg, picks, opts = {}) {
  const norm = normalizeListing(pkg, opts), out = copy(data), added = [], rejected = [];
  if (!norm.ok) return { data: out, added, rejected: [{ code: null, reason: '공식 목록 패키지 무효/만료: ' + (norm.stale ? 'stale' : norm.errors.join(';')) }], normalized: norm };
  const have = new Set(out.securities.map(s => s.code)), p = pkg.provenance;
  for (const pick of Array.isArray(picks) ? picks : []) {
    const code = pick && pick.code, l = norm.byCode.get(code);
    if (!CODE_RE.test(code || '')) { rejected.push({ code, reason: '코드 형식' }); continue; }
    if (have.has(code)) { rejected.push({ code, reason: '중복' }); continue; }
    if (!l) { rejected.push({ code, reason: '공식 목록에 없음 또는 중복코드로 모호' }); continue; }
    if (l.hint !== 'common-presumed') { rejected.push({ code, reason: '보통주 아님 의심: ' + l.hint }); continue; }
    if (l.market === 'KONEX') { rejected.push({ code, reason: 'KONEX는 후보 범위 밖' }); continue; }
    if (![pick.sector, pick.evaluationProfile, pick.reason].every(nonEmpty)) { rejected.push({ code, reason: '업종/평가유형/선정근거 누락' }); continue; }
    out.securities.push({ code, name: l.name, market: l.market, securityType: '보통주', group: 'stock', sector: pick.sector, evaluationProfile: pick.evaluationProfile, selectionReason: pick.reason + ' (조사 대상 선정 이유이며 매수 적격 판정이 아님)', selectedAt: opts.today, source: p.provider + ' / ' + p.datasetName + ' 기준일 ' + p.baseDate, codeStatus: 'official-listing-matched', listingCheck: 'matched', status: 'hold', reviewStatus: 'verified', lastVerified: opts.today, evidenceUrl: p.sourceUrl, listingEvidence: { provider: p.provider, baseDate: p.baseDate, sourceUrl: p.sourceUrl, sha256: p.sha256, isin: l.isin } });
    have.add(code); added.push(code);
  }
  return { data: out, added, rejected, normalized: norm };
}
module.exports = { MAX_LISTING_AGE_DAYS, MARKETS, classifyByName, checkProvenance, normalizeListing, crossCheckOfficial, supplement };

};
__defs["./mobile-flow.js"]=function(module,exports,require){
/* KST (stage14): 휴대폰 관리자 전용 "공식 종목정보 확인" 흐름의 상태머신(모의). Pure.
   - 이번 단계에서는 합성 transport(isSynthetic=true)만 허용한다. 실제 transport 는 REAL_CALLS_ALLOWED=false 로 코드에서 거부한다.
   - 판정 규칙은 새로 만들지 않고 krx-run(runPlan)·krx-api(compareCandidates)·krx-status(toStates)를 그대로 재사용한다(= CLI 와 동일).
   - 자동 재시도 없음(maxRetries 0). 승인 1건 = 실행 1회(+ 남은 호출 한도 내 재개). 종목 코드·이름·원본 응답은 결과 화면/요약에 싣지 않는다.
   - 종목정보 API는 "신원 확인용"이며 주가·매수 신호가 아니다. */
'use strict';
const RUN = require('./krx-run.js'), K = require('./krx-api.js'), ST = require('./krx-status.js'), SH = require('./share.js');
const { day } = require('./common.js');
const REAL_CALLS_ALLOWED = false, MOBILE_MAX_CALLS = 3, ADMIN_MAX_SESSION_MS = 30 * 60 * 1000;
const NOTICE = '이 조회는 종목의 이름·시장·ISIN 신원 확인용입니다. 주가 확인이나 매수·매도 신호 활성화가 아닙니다.';
const isoOf = b => `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`;

function createFlow({ universe, transport, clock, sha256, wait }) {
  const st = { state: 'LOCKED', reason: '관리자 로그인 필요(모의)', session: null, plan: null, approval: null, budget: 0, used: 0, resume: null, result: null, running: false, history: [], syntheticRequests: 0 };
  const log = (e) => { st.history.push(e); };
  const sessionOk = () => { const s = st.session; return !!(s && s.role === 'admin' && s.verified === true && Number.isFinite(s.expiresAtMs) && s.expiresAtMs > clock.nowMs() && Number.isFinite(s.issuedAt) && s.issuedAt <= clock.nowMs() && s.expiresAtMs - s.issuedAt <= ADMIN_MAX_SESSION_MS); };
  const guard = (need) => {
    if (!sessionOk()) { if (st.state !== 'LOCKED') { st.state = 'LOCKED'; st.reason = '관리자 세션이 없거나 만료됨'; st.running = false; } return { ok: false, code: 'NOT_ADMIN', reason: st.reason }; }
    if (need && !need.includes(st.state)) return { ok: false, code: 'BAD_STATE', reason: '현재 상태(' + st.state + ')에서는 할 수 없음' };
    return { ok: true };
  };
  const countTargets = () => { const sec = universe().securities || []; const etfs = sec.filter(x => x.group === 'etf').length; return { stocks: sec.length - etfs, etfs }; };
  const api = {
    REAL_CALLS_ALLOWED, MOBILE_MAX_CALLS, NOTICE,
    /* 관리자 세션은 서버가 발급해야 한다(이번 단계는 합성 세션). 형식·만료·최장 30분을 검사한다. */
    unlock(session) {
      st.session = session && typeof session === 'object' ? { ...session } : null;
      if (!sessionOk()) { st.state = 'LOCKED'; st.reason = '관리자 세션 검증 실패(모의)'; return { ok: false, code: 'NOT_ADMIN', reason: st.reason }; }
      st.state = 'READY'; st.reason = null; log('unlock'); return { ok: true };
    },
    lock() { st.session = null; st.state = 'LOCKED'; st.reason = '잠금'; st.approval = null; st.plan = null; return { ok: true }; },
    prepare({ basDt, maxCalls }) {
      const g = guard(['READY', 'DONE', 'FAILED', 'BLOCKED', 'CANCELLED']); if (!g.ok) return g;
      const n = Number(maxCalls); if (!Number.isInteger(n) || n < 1 || n > MOBILE_MAX_CALLS) return { ok: false, code: 'BAD_LIMIT', reason: '최대 호출은 1~' + MOBILE_MAX_CALLS + '회' };
      const plan = RUN.planCalls({ basDt, maxCalls: n, queriedAt: clock.today(), resultType: 'xml' });
      if (!plan.ok) return { ok: false, code: 'BAD_PLAN', reason: plan.errors.join('; ') };
      st.plan = { basDt: String(basDt), maxCalls: n, warnings: plan.warnings, minimumCalls: plan.minimumCalls, targets: countTargets() };
      st.approval = null; st.resume = null; st.used = 0; st.result = null; st.state = 'CONFIRMING'; st.reason = null;
      return { ok: true, confirmScreen: { ...st.plan, notice: NOTICE, stopConditions: ['401·403·한도 초과·권한 오류는 즉시 중단', '자동 재시도 없음', '호출 상한 도달 시 중단'], mode: '합성 시험(실제 외부 요청 0회)' } };
    },
    confirm({ ack, approval }) {
      const g = guard(['CONFIRMING']); if (!g.ok) return g;
      if (ack !== true) return { ok: false, code: 'NO_ACK', reason: '확인 체크 필요' };
      const errs = RUN.validateApproval(approval, clock.today()); if (errs.length) return { ok: false, code: 'BAD_APPROVAL', reason: errs.join('; ') };
      if (!day(approval.expiresAt)) return { ok: false, code: 'BAD_APPROVAL', reason: '모바일 승인은 만료일(expiresAt) 필수' };
      if (String(approval.basDt) !== st.plan.basDt) return { ok: false, code: 'BAD_APPROVAL', reason: '승인 기준일과 조회 기준일이 다름' };
      if (approval.maxCalls < st.plan.maxCalls) return { ok: false, code: 'BAD_APPROVAL', reason: '승인 호출 한도가 요청보다 작음' };
      st.approval = { basDt: approval.basDt, maxCalls: Math.min(approval.maxCalls, st.plan.maxCalls, MOBILE_MAX_CALLS), expiresAt: approval.expiresAt, scope: approval.scope };
      st.budget = st.approval.maxCalls; st.state = 'APPROVED'; return { ok: true, budget: st.budget };
    },
    async run() { return exec(false); },
    async resume() { return exec(true); },
    cancel() { if (!sessionOk()) return guard(); if (st.running) { st.cancelRequested = true; return { ok: true, note: '진행 중 호출이 끝나면 중단' }; } st.state = 'CANCELLED'; st.approval = null; return { ok: true }; },
    getView() { return view(); }
  };
  async function exec(isResume) {
    const g = guard(isResume ? ['PARTIAL'] : ['APPROVED']); if (!g.ok) return g;
    if (st.running) return { ok: false, code: 'ALREADY_RUNNING', reason: '이미 실행 중(중복 누르기 무시)' };
    if (st.approval && st.approval.expiresAt < clock.today()) { st.state = 'BLOCKED'; st.reason = '승인 만료'; st.approval = null; return { ok: false, code: 'APPROVAL_EXPIRED', reason: st.reason }; }
    if (REAL_CALLS_ALLOWED !== false || !transport || transport.isSynthetic !== true) { st.state = 'BLOCKED'; st.reason = '실제 외부 요청은 이번 단계에서 차단됨(합성 transport만 허용)'; st.approval = null; return { ok: false, code: 'REAL_TRANSPORT_BLOCKED', reason: st.reason }; }
    const remaining = st.budget - st.used; if (remaining < 1) { st.state = 'BLOCKED'; st.reason = '승인된 호출 한도 소진'; return { ok: false, code: 'BUDGET_EXHAUSTED', reason: st.reason }; }
    st.running = true; st.cancelRequested = false; st.state = 'RUNNING';
    let res;
    try {
      res = await RUN.runPlan({ basDt: st.plan.basDt, maxCalls: remaining, key: undefined, transport: async (r) => { if (st.cancelRequested) throw new Error('cancelled'); st.syntheticRequests++; return transport(r); }, wait: wait || (async () => {}), sha256, queriedAt: clock.today(), origin: 'fixture', resume: isResume ? st.resume : null, resultType: 'xml', maxRetries: 0 });
    } catch (e) { st.diagnostic = String(e && e.message).slice(0, 120); res = { status: 'failed', reason: '내부 오류', transportCalls: 0, attempts: [], missingPages: [], warnings: [] }; }
    st.running = false; st.used += res.transportCalls || 0; st.attempts = res.attempts || [];
    if (!sessionOk()) { st.state = 'LOCKED'; st.reason = '실행 중 관리자 세션 만료'; return { ok: false, code: 'NOT_ADMIN', reason: st.reason }; }
    if (res.status === 'complete') {
      const cmp = K.compareCandidates(universe(), res.listing, { today: clock.today(), expectedBaseDate: isoOf(st.plan.basDt) }), s = ST.toStates(cmp);
      const logObj = { summary: { status: 'complete', reason: null, acquisition: 'fixture', transportCalls: st.used, attempts: res.attempts, missingPages: [], warnings: res.warnings, verifierVersion: res.verifierVersion, queriedAt: clock.today(), basDt: st.plan.basDt, totals: s.totals, fixtureMatchedNotCounted: cmp.counts.fixtureMatchedNotCounted, realPriceVerifiedCount: 0, actualActiveMonitoredCount: 0 }, entries: s.entries, log: cmp.log };
      st.result = { share: SH.buildShareSummary(logObj), totals: s.totals }; st.state = 'DONE'; st.reason = null; st.approval = null; st.resume = null;
      return { ok: true, status: 'DONE' };
    }
    if (res.status === 'partial' && res.resume && st.budget - st.used > 0) { st.resume = res.resume; st.state = 'PARTIAL'; st.reason = res.reason; return { ok: false, code: 'PARTIAL', reason: res.reason }; }
    st.state = res.status === 'blocked' ? 'BLOCKED' : 'FAILED'; st.reason = res.reason || (res.attempts.length ? '실패: ' + res.attempts[res.attempts.length - 1].category : '실패'); st.approval = null; st.resume = null;
    return { ok: false, code: st.state, reason: st.reason };
  }
  function view() {
    const real = { officialVerified: 0, realPriceChecked: 0, activeMonitoring: 0, realApiRequests: 0 };
    return { state: st.state, reason: st.reason, dataLabel: '합성 시험', notice: NOTICE, plan: st.plan, callsUsed: st.used, callsBudget: st.budget, syntheticRequests: st.syntheticRequests,
      result: st.result ? { dataLabel: '합성 시험', basDt: st.result.share.basDt, source: st.result.share.source, queriedAt: st.result.share.queriedAt, totals: st.result.totals, note: '합성 응답 결과이며 어떤 종목도 공식 검증(VERIFIED)으로 인정되지 않음' } : null,
      shareSummary: st.result ? st.result.share : null, diagnostic: st.diagnostic || null, ...real, missingPages: st.resume ? st.resume.missing.slice() : [] };
  }
  return api;
}
module.exports = { REAL_CALLS_ALLOWED, MOBILE_MAX_CALLS, ADMIN_MAX_SESSION_MS, NOTICE, createFlow };

};
__defs["./mobile-status.js"]=function(module,exports,require){
/* KST (stage14): 휴대폰 화면용 데이터 상태 구분. Pure. 네 단계를 엄격히 분리하고, 합성·모의는 실제 집계에 절대 섞지 않는다.
   SYNTHETIC(합성 시험) < IDENTITY(공식 종목 신원 검증) < PRICE(실제 시세 확인) < MONITORING(실제 감시 활성)
   오래되었거나 출처·기준일·조회 시각이 없으면 DATA_UNAVAILABLE, 신호는 HOLD. 신호 점수는 "백테스트 미검증 가설". */
'use strict';
const { day, daysBetween, nonEmpty, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const LABELS = Object.freeze({ SYNTHETIC: '합성 시험', IDENTITY: '공식 종목 신원 검증', PRICE: '실제 시세 확인', MONITORING: '실제 감시 활성', UNAVAILABLE: '데이터 없음(DATA_UNAVAILABLE)' });
const REAL_IDENTITY = 'user-supplied-official', REAL_PRICE = 'real-provider';
const evOk = (e, today) => !!e && nonEmpty(e.source) && day(e.baseDate) && day(e.queriedAt) && e.queriedAt <= today && daysBetween(e.baseDate, today) >= 0 && daysBetween(e.baseDate, today) <= MAX_QUOTE_AGE_DAYS && !e.failureReason;
const why = (e, today, name) => !e ? name + ' 근거 없음' : e.failureReason ? name + ' 실패: ' + e.failureReason : !nonEmpty(e.source) ? name + ' 출처 없음' : !day(e.baseDate) || !day(e.queriedAt) ? name + ' 기준일/조회 시각 없음' : e.queriedAt > today ? name + ' 조회 시각이 미래' : daysBetween(e.baseDate, today) < 0 ? name + ' 기준일이 미래' : daysBetween(e.baseDate, today) > MAX_QUOTE_AGE_DAYS ? name + ' 오래됨(기준일 ' + e.baseDate + ')' : null;
const isSynth = e => !e || e.isSynthetic === true || e.origin === 'fixture';

/* item: { id, market:'KR'|'US', kind:'stock'|'etf', identity?, price?, monitoring?, signal? } — 각 증거는 { origin, source, baseDate, queriedAt, failureReason?, isSynthetic? } */
function classify(item, today) {
  const r = { id: item.id, market: item.market, kind: item.kind, level: 'UNAVAILABLE', label: LABELS.UNAVAILABLE, reasons: [], signal: { decision: 'HOLD', score: null, shown: false } };
  if (!['KR', 'US'].includes(item.market) || !['stock', 'etf'].includes(item.kind)) { r.reasons.push('시장/종류 오류'); return r; }
  const anySynth = [item.identity, item.price, item.monitoring].some(e => e && isSynth(e));
  if (anySynth) { r.level = 'SYNTHETIC'; r.label = LABELS.SYNTHETIC; r.reasons.push('합성·모의 자료 포함 — 실제 집계 제외'); return r; }
  const idOk = item.market === 'US' ? true : (item.identity && item.identity.origin === REAL_IDENTITY && item.identity.state === 'VERIFIED' && evOk(item.identity, today));
  if (item.market === 'KR' && !idOk) { const w = why(item.identity, today, '신원'); r.reasons.push(w || '공식 검증(VERIFIED) 아님'); return r; }
  if (item.market === 'KR') { r.level = 'IDENTITY'; r.label = LABELS.IDENTITY; }
  const pOk = item.price && item.price.origin === REAL_PRICE && evOk(item.price, today);
  if (!pOk) { if (item.market === 'US') { r.reasons.push(why(item.price, today, '시세') || '실제 시세 아님'); return r; } r.reasons.push(why(item.price, today, '시세') || '실제 시세 아님'); return r; }
  r.level = 'PRICE'; r.label = LABELS.PRICE;
  const mOk = item.monitoring && item.monitoring.active === true && item.monitoring.approvedBy === 'user' && evOk(item.monitoring, today);
  if (!mOk) { r.reasons.push(why(item.monitoring, today, '감시') || '감시 미활성'); return r; }
  r.level = 'MONITORING'; r.label = LABELS.MONITORING;
  if (item.signal && Number.isFinite(item.signal.score)) r.signal = { decision: item.signal.decision || 'HOLD', score: item.signal.score, shown: true, label: '백테스트 미검증 가설' };
  return r;
}
function summarize(items, today) {
  const rows = items.map(i => classify(i, today));
  const c = (f) => rows.filter(f).length, real = r => r.level !== 'SYNTHETIC' && r.level !== 'UNAVAILABLE';
  return { rows, counts: {
    syntheticTest: c(r => r.level === 'SYNTHETIC'),
    officialIdentityVerified: c(r => r.market === 'KR' && ['IDENTITY', 'PRICE', 'MONITORING'].includes(r.level)),
    realPriceConfirmed: c(r => ['PRICE', 'MONITORING'].includes(r.level)),
    activeMonitoringKR: c(r => r.market === 'KR' && r.level === 'MONITORING'),
    activeMonitoringUS: c(r => r.market === 'US' && r.level === 'MONITORING'),
    unavailable: c(r => r.level === 'UNAVAILABLE'), real: c(real) } };
}
/* 화면 문구: 항상 기준일·출처·조회 시각·실패 이유를 보여준다. 오래된 신호는 최신인 것처럼 보이지 않게 숨긴다. */
function describe(row, item) {
  const e = item.monitoring || item.price || item.identity || {};
  return { id: row.id, label: row.label, baseDate: e.baseDate || '없음', source: e.source || '없음', queriedAt: e.queriedAt || '없음', note: row.reasons.join(' / ') || '정상', signalText: row.signal.shown ? row.signal.decision + ' (' + row.signal.label + ')' : 'HOLD — 신호 없음' };
}
module.exports = { LABELS, classify, summarize, describe };

};
__defs["./pipeline.js"]=function(module,exports,require){
/* KST (stage10): per-instrument data pipeline state machine. Pure, immutable records, synthetic evidence only.
   미연결 → 권리 확인 → 원본 무결성 → 날짜/시장/시간대 → 수정주가 일관성 → 벤치마크 대조 → 2차 출처 검증 → 수동 승인 → 읽기 전용 활성화
   No step can be skipped. The last step is DISABLED by policy in stage 10, so nothing can ever become active here. */
'use strict';
const { finite, nonEmpty, day, daysBetween, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const R = require('./rights.js'), S = require('./signals.js');
const STATES = Object.freeze(['미연결', '권리 확인', '원본 무결성', '날짜/시장/시간대', '수정주가 일관성', '벤치마크 대조', '2차 출처 검증', '수동 승인', '읽기 전용 활성화']);
const POLICY = Object.freeze({ realActivationAllowed: false, reason: '10단계: 실제 호출·활성화는 사용자의 별도 명시 승인 전까지 금지' });
const newRecord = (symbol, market) => Object.freeze({ symbol, market, state: '미연결', history: Object.freeze([]), hold: null, synthetic: true, actualActiveCount: 0, realApiRequests: 0 });
const CHECK = {
  '권리 확인': (e, t) => { if (!e || !e.provider) return '공급자 없음'; const v = R.verdict(e.provider, { today: t }); return v.verdict === '후보 적격' ? null : '공급자 ' + v.verdict + ': ' + v.reasons.join('; '); },
  '원본 무결성': e => !e ? '증거 없음' : e.sha256Matches !== true ? '원본 해시 불일치/미확인' : !Number.isInteger(e.rowCount) || e.rowCount !== e.expectedRowCount ? '행 수 불일치' : e.official !== true ? '공식 출처로 인정되지 않음' : null,
  '날짜/시장/시간대': (e, t) => !e || !day(e.asOf) ? '기준일 없음' : e.asOf > t ? '미래 날짜' : daysBetween(e.asOf, t) > MAX_QUOTE_AGE_DAYS ? '오래된 시세' : e.isTradingDay !== true ? '휴장일/주말 또는 캘린더 미확인' : e.session !== 'regular' ? '정규장 아님' : e.timezoneMatches !== true ? '시간대 불일치' : null,
  '수정주가 일관성': e => !e ? '증거 없음' : e.closeBasis !== e.highBasis || !['adjusted-consistent', 'unadjusted'].includes(e.closeBasis) ? '종가·52주 고가 조정 기준 불일치/미상' : e.splitInWindow === true && e.closeBasis === 'unadjusted' ? '분할 구간의 비조정 가격' : null,
  '벤치마크 대조': e => { if (!e) return '증거 없음'; const r = S.relativeReturn(e.stockWindow, e.benchWindow); return r.ok ? null : r.reason; },
  '2차 출처 검증': e => !e || e.independent !== true ? '독립 2차 출처 없음' : !finite(e.closeDiffPct) || Math.abs(e.closeDiffPct) > 0.5 ? '출처 간 종가 차이 > 0.5%' : null,
  '수동 승인': (e, t) => !e || e.approvedBy !== 'user' || !day(e.approvedAt) || e.approvedAt > t || !nonEmpty(e.scope) ? '사용자의 명시 승인 기록 없음' : null,
  '읽기 전용 활성화': () => POLICY.realActivationAllowed ? null : POLICY.reason
};
function advance(rec, evidence, { today } = {}) {
  if (!day(today) || !rec || !STATES.includes(rec.state)) return { ok: false, record: rec, reason: '입력 오류' };
  const i = STATES.indexOf(rec.state); if (i === STATES.length - 1) return { ok: false, record: rec, reason: '이미 마지막 상태' };
  const target = STATES[i + 1], problem = CHECK[target](evidence, today);
  const entry = Object.freeze({ to: target, at: today, result: problem ? '보류' : '통과', reason: problem || '조건 충족', realPrice: false });
  if (problem) return { ok: false, record: Object.freeze({ ...rec, hold: problem, history: Object.freeze([...rec.history, entry]) }), reason: problem };
  return { ok: true, record: Object.freeze({ ...rec, state: target, hold: null, history: Object.freeze([...rec.history, entry]) }), reason: null };
}
// A later conflict (stale quote, source disagreement, correction filing, terms change) drops the instrument back to 미연결; nothing stays scored.
function invalidate(rec, reason, today) { return Object.freeze({ ...rec, state: '미연결', hold: reason, history: Object.freeze([...rec.history, Object.freeze({ to: '미연결', at: today, result: '무효화', reason, realPrice: false })]) }); }
const isEvaluable = rec => !!rec && rec.state === STATES[STATES.length - 1];
module.exports = { STATES, POLICY, newRecord, advance, invalidate, isEvaluable };

};
__defs["./rehearsal.js"]=function(module,exports,require){
/* KST (stage13): 실조회 전 "합성 응답 리허설"용 가짜 서버. Pure, 네트워크 없음. 후보 목록에서 일부는 일치·일부는 불일치·일부는 누락시킨
   합성 응답을 만든다. 이 응답으로는 어떤 종목도 VERIFIED 가 될 수 없다(origin=fixture). */
'use strict';
const isinOf = code => { const body = 'KR7' + code + '00', d = [...body].map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join(''); for (let k = 0; k < 10; k++) { const s = d + k; let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let n = s.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; } if (sum % 10 === 0) return body + k; } };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function synthListing(universe, basDt) {
  const rows = []; let i = 0;
  for (const s of universe.securities) {
    i++;
    if (s.group === 'etf') { if (i % 3 === 0) continue; rows.push({ basDt, srtnCd: 'A' + s.code, isinCd: isinOf(s.code), mrktCtg: s.market, itmsNm: s.name }); continue; }
    if (i % 17 === 0) continue;                                                      // 응답에 없음
    const bad = i % 11 === 0 ? 'name' : i % 13 === 0 ? 'market' : null;               // 불일치 주입
    rows.push({ basDt, srtnCd: 'A' + s.code, isinCd: isinOf(s.code), mrktCtg: bad === 'market' ? (s.market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI') : s.market, itmsNm: bad === 'name' ? s.name + '(개명가정)' : s.name });
  }
  for (let k = 0; k < 40; k++) { const code = 'Y' + String(k).padStart(5, '0'); rows.push({ basDt, srtnCd: 'A' + code, isinCd: isinOf(code), mrktCtg: 'KOSDAQ', itmsNm: '합성채움' + k }); }
  return rows;
}
function render(rows, rows_, pageNo, total, format) {
  if (format === 'json') return JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { numOfRows: rows_, pageNo, totalCount: total, items: rows.length ? { item: rows } : '' } } });
  return `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><numOfRows>${rows_}</numOfRows><pageNo>${pageNo}</pageNo><totalCount>${total}</totalCount><items>${rows.map(r => '<item>' + Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('') + '</item>').join('')}</items></body></response>`;
}
/* fault: none | 429 | 401 | garbage | gateway30 */
function createRehearsalTransport(universe, { basDt, format = 'xml', fault = 'none' } = {}) {
  const all = synthListing(universe, basDt); let n = 0;
  const fn = async ({ url }) => {
    n++; const u = new URL(url), rows = Number(u.searchParams.get('numOfRows')), pg = Number(u.searchParams.get('pageNo'));
    if (fault === '401') return { status: 401, text: 'Unauthorized' };
    if (fault === 'gateway30') return { status: 200, text: '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>' };
    if (fault === '429' && n === 2) return { status: 429, text: 'API rate limit exceeded' };
    if (fault === 'garbage' && n === 2) return { status: 200, text: '<response><header>' };
    return { status: 200, text: render(all.slice((pg - 1) * rows, pg * rows), rows, pg, all.length, format) };
  };
  fn.total = all.length; return fn;
}
module.exports = { isinOf, synthListing, createRehearsalTransport };

};
__defs["./rights.js"]=function(module,exports,require){
/* KST (stage9): provider rights/accuracy verdicts. Pure. Verdicts: 부적격 (a confirmed conflict with the intended use) /
   미확정 (anything unconfirmed or stale) / 후보 적격 (every required item confirmed, no conflict). 후보 적격 is NOT approval to connect. */
'use strict';
const { nonEmpty, day, httpsUrl, daysBetween } = require('./common.js');
const STATUSES = ['confirmed', 'unconfirmed', 'conflict'];
const MAX_CHECK_AGE_DAYS = 30;
function validate(cat) {
  const errors = [];
  if (!cat || cat.schemaVersion !== 2 || !Array.isArray(cat.providers) || !Array.isArray(cat.requiredPrice) || !Array.isArray(cat.requiredListing)) return { errors: ['카탈로그 v2 스키마 오류'] };
  const ids = new Set();
  for (const p of cat.providers) {
    if (!nonEmpty(p.id) || ids.has(p.id)) errors.push('id 오류/중복: ' + p.id); ids.add(p.id);
    if (!['price', 'listing'].includes(p.role)) { errors.push(p.id + ': role'); continue; }
    for (const k of (p.role === 'price' ? cat.requiredPrice : cat.requiredListing)) {
      const f = p.fields && p.fields[k];
      if (!f || !STATUSES.includes(f.status) || !nonEmpty(f.value) || !day(f.checkedAt)) { errors.push(p.id + '.' + k + ': 형식 오류'); continue; }
      if (f.status !== 'unconfirmed' && !httpsUrl(f.source)) errors.push(p.id + '.' + k + ': confirmed/conflict는 https 출처 필요');
    }
  }
  if (/(api[_-]?key|secret|token|password|serviceKey)\s*[:=]\s*["']?[A-Za-z0-9_%\-]{12,}/i.test(JSON.stringify(cat))) errors.push('비밀값 의심 문자열');
  return { errors };
}
function verdict(p, { today } = {}) {
  const cat = { requiredPrice: p.role === 'price' ? Object.keys(p.fields) : [], requiredListing: p.role === 'listing' ? Object.keys(p.fields) : [] };
  const keys = p.role === 'price' ? cat.requiredPrice : cat.requiredListing;
  const conflicts = keys.filter(k => p.fields[k].status === 'conflict');
  const unconfirmed = keys.filter(k => p.fields[k].status === 'unconfirmed');
  const stale = day(today) ? keys.filter(k => p.fields[k].status !== 'unconfirmed' && daysBetween(p.fields[k].checkedAt, today) > MAX_CHECK_AGE_DAYS) : keys.filter(k => p.fields[k].status !== 'unconfirmed');
  let v = '후보 적격'; const reasons = [];
  if (conflicts.length) { v = '부적격'; reasons.push('확인된 충돌: ' + conflicts.join(', ')); }
  else if (unconfirmed.length || stale.length) { v = '미확정'; if (unconfirmed.length) reasons.push('미확정 ' + unconfirmed.length + '건: ' + unconfirmed.join(', ')); if (stale.length) reasons.push('확인일 ' + MAX_CHECK_AGE_DAYS + '일 초과/오늘 미지정: ' + stale.join(', ')); }
  return { id: p.id, role: p.role, verdict: v, conflicts, unconfirmed, stale, reasons, approvalToConnect: false };
}
function summarize(cat, { today } = {}) {
  const val = validate(cat); if (val.errors.length) return { errors: val.errors, verdicts: [], counts: {}, realApiRequests: 0 };
  const verdicts = cat.providers.map(p => verdict(p, { today }));
  const counts = { '후보 적격': 0, '미확정': 0, '부적격': 0 }; verdicts.forEach(v => counts[v.verdict]++);
  return { errors: [], verdicts, counts, realApiRequests: 0 };
}
module.exports = { STATUSES, MAX_CHECK_AGE_DAYS, validate, verdict, summarize };

};
__defs["./share.js"]=function(module,exports,require){
/* KST (stage13): 개인 PC 실행 결과를 "공유 가능한 요약"으로 줄인다. Pure.
   포함: 상태 합계·출처·기준일·조회일·호출 수·검증 버전·응답 해시. 제외: 종목코드·종목명·ISIN·승인 파일 내용·키·URL·원본. 누출 검사를 통과해야만 반환한다. */
'use strict';
function buildShareSummary(log) {
  if (!log || !log.summary || !Array.isArray(log.entries) || !Array.isArray(log.log)) throw new Error('verification-log 형식이 아님');
  const s = log.summary, h = log.log[0] && log.log[0].responseSha256 ? String(log.log[0].responseSha256).split(',') : [];
  const out = { kind: 'krx-share-summary', source: '금융위원회_KRX상장종목정보 / getItemInfo_V2', origin: s.acquisition || 'local-runner', status: s.status, basDt: s.basDt, queriedAt: s.queriedAt, verifierVersion: s.verifierVersion, transportCalls: s.transportCalls, retries: (s.attempts || []).filter(a => a.try > 1).length, failureCategories: [...new Set((s.attempts || []).map(a => a.category).filter(c => c !== 'ok'))], missingPages: s.missingPages || [], warnings: s.warnings || [], totals: s.totals || null, responseHashes: h, realPriceVerifiedCount: 0, actualActiveMonitoredCount: 0, notes: ['종목 신원 확인 결과이며 주가 확인·매수 신호가 아님', '이용허락(변경금지·재배포 금지) 때문에 코드·종목명·원본 응답은 공유 대상에서 제외'] };
  const text = JSON.stringify(out);
  for (const e of log.entries) { for (const v of [e.code, e.name]) if (v && v.length >= 2 && text.includes(JSON.stringify(v).slice(1, -1))) throw new Error('공유 요약에 종목 식별정보가 섞임'); }
  if (/serviceKey|KRX_SERVICE_KEY|https?:\/\//i.test(text)) throw new Error('공유 요약에 URL/키 단어가 섞임');
  return out;
}
module.exports = { buildShareSummary };

};
__defs["./signals.js"]=function(module,exports,require){
/* KST (stage10): keeps three different things apart. Pure.
   (1) 52-week drawdown of ONE instrument from its own high, (2) relative return over an IDENTICAL window,
   (3) the gap between two drawdowns whose peaks fall on different dates — which is NOT a relative return. */
'use strict';
const { finite, day, daysBetween } = require('./common.js');
const BANDS = Object.freeze([20, 30, 35]);
function drawdown52w({ close, high52w, highDate, asOf }) {
  if (!finite(close) || !finite(high52w) || close <= 0 || high52w < close || !day(highDate) || !day(asOf) || highDate > asOf || daysBetween(highDate, asOf) > 370) return { ok: false, reason: '종가/52주 고가/고가일 불충분' };
  const pct = (close / high52w - 1) * 100; const band = BANDS.filter(b => pct <= -b + 1e-9).at(-1) ?? null;
  return { ok: true, pct, band, highDate, label: '자기 52주 고점 대비 낙폭(고점일은 종목마다 다름)' };
}
function relativeReturn(stock, bench) {
  const w = x => x && day(x.start) && day(x.end) && finite(x.returnPct) && x.returnPct >= -100 && typeof x.adjustment === 'string' && typeof x.currency === 'string';
  if (!w(stock) || !w(bench)) return { ok: false, reason: '수익률 구간/조정/통화 정보 불충분' };
  if (stock.start !== bench.start || stock.end !== bench.end) return { ok: false, reason: '구간이 달라 상대수익률 불가(시작·종료일 동일해야 함)' };
  if (stock.adjustment !== bench.adjustment || stock.currency !== bench.currency) return { ok: false, reason: '조정 기준/통화 불일치' };
  return { ok: true, relativePp: stock.returnPct - bench.returnPct, window: { start: stock.start, end: stock.end }, label: '동일 구간 상대수익률(%p)' };
}
function drawdownGap(stockDd, benchDd) {
  if (!stockDd || !benchDd || !stockDd.ok || !benchDd.ok) return { ok: false, reason: '낙폭 계산 불가' };
  return { ok: true, gapPp: stockDd.pct - benchDd.pct, peakDatesDiffer: stockDd.highDate !== benchDd.highDate, isRelativeReturn: false, label: '낙폭 차이(%p) — 고점일이 다르면 상대수익률이 아님' };
}
// One call returns the three measures in separate fields and never merges them into a single "underperformance" number.
function report({ stock, bench, stockWindow, benchWindow }) {
  const sd = drawdown52w(stock), bd = drawdown52w(bench);
  return { drawdown: sd, benchDrawdown: bd, relative: relativeReturn(stockWindow, benchWindow), drawdownGap: drawdownGap(sd, bd), combinedScore: null, note: '세 지표는 합산·치환하지 않음. 평가 보류 조건은 pipeline에서 처리' };
}
module.exports = { BANDS, drawdown52w, relativeReturn, drawdownGap, report };

};
__defs["./watch-display.js"]=function(module,exports,require){
/* KST (stage16): 감시 화면용 "정직한 표시" 모델. Pure(저장소·네트워크·시간 접근 없음, today는 호출자가 전달).
   mobile-status.classify 의 판정을 그대로 쓰고, 화면에 필요한 공급자·기준 시각·가격 유형·통화·유효기간·갱신 오류·검증 상태를 덧붙인다.
   활성 감시 수 = 실제 조회 + 가격 검증 + 현재 유효한 감시 조건을 모두 만족한 종목만. 합성·캐시·미검증은 따로 센다. */
'use strict';
const { day, daysBetween, nonEmpty, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const MS = require('./mobile-status.js');
const PRICE_TYPE_LABEL = Object.freeze({ close: '종가(확정 후)', delayed: '지연 시세', realtime: '실시간', unknown: '가격 유형 미확인' });
const SIGNAL_CAVEATS = Object.freeze([
  '신호는 가격 하락률만 본 것이며 투자 판단이 아닙니다(백테스트 미검증 가설).',
  '거래정지·상장폐지 예정 종목은 가격 하락이 곧 기회를 뜻하지 않습니다.',
  '실적 악화·감자·유상증자·분할 등 기업행위로 가격이 바뀐 경우 오탐일 수 있습니다.',
  '수정주가 기준이 섞이면 52주 고점 대비 하락률이 왜곡됩니다.'
]);
const CACHE_AGE_NOTE = '캐시 값은 마지막 실제 조회 결과이며 현재 값이 아닐 수 있습니다.';
function priceTypeOf(price) {
  if (!price) return 'unknown';
  const t = price.priceType; if (t === 'close') return 'close'; if (t === 'delayed') return 'delayed';
  // 실시간 표기는 공급자가 실시간이라 밝히고 지연이 0분일 때만. 그 외는 한 단계 낮춰 표기한다.
  if (t === 'realtime') return price.delayMinutes === 0 ? 'realtime' : 'delayed'; return 'unknown';
}
function describe(item, today) {
  const cls = MS.classify(item, today), p = item.price || null, cache = !!(p && p.origin === 'cache');
  const baseDate = p && day(p.baseDate) ? p.baseDate : null;
  const validUntil = baseDate ? new Date(Date.parse(baseDate) + MAX_QUOTE_AGE_DAYS * 86400000).toISOString().slice(0, 10) : null;
  const expired = validUntil ? today > validUntil : null;
  const row = { id: item.id, market: item.market, kind: item.kind, level: cls.level, label: cls.label, reasons: cls.reasons.slice(),
    provider: p && nonEmpty(p.source) ? p.source : '출처 없음', asOf: baseDate, queriedAt: p && day(p.queriedAt) ? p.queriedAt : null, priceType: priceTypeOf(p), priceTypeLabel: PRICE_TYPE_LABEL[priceTypeOf(p)],
    currency: p && nonEmpty(p.currency) ? p.currency : (item.market === 'KR' ? 'KRW(추정)' : item.market === 'US' ? 'USD(추정)' : '미확인'), validUntil, expired,
    lastError: p && p.failureReason ? String(p.failureReason) : null, verification: cache ? 'cache' : cls.level === 'SYNTHETIC' ? 'synthetic' : (cls.level === 'PRICE' || cls.level === 'MONITORING') ? 'real-verified' : 'unverified' };
  if (cache) row.reasons.push(CACHE_AGE_NOTE, '캐시는 실제 감시로 세지 않습니다');
  if (row.expired) row.reasons.push('유효기간(' + validUntil + ') 지남 — 갱신 필요');
  if (row.lastError) row.reasons.push('갱신 오류: ' + row.lastError);
  row.activeMonitoring = cls.level === 'MONITORING' && !cache && !row.expired && !row.lastError;
  row.signalNote = cls.signal && cls.signal.shown ? cls.signal.label : '신호 표시 없음(자료 부족 또는 감시 미활성)';
  return row;
}
function summarize(items, today) {
  const rows = items.map(i => describe(i, today)), c = f => rows.filter(f).length;
  return { rows, counts: { activeMonitoring: c(r => r.activeMonitoring), activeMonitoringKR: c(r => r.activeMonitoring && r.market === 'KR'), activeMonitoringUS: c(r => r.activeMonitoring && r.market === 'US'),
    realVerifiedPrice: c(r => r.verification === 'real-verified' && !r.expired && !r.lastError), synthetic: c(r => r.verification === 'synthetic'), cache: c(r => r.verification === 'cache'), unverified: c(r => r.verification === 'unverified'), total: rows.length },
    caveats: SIGNAL_CAVEATS.slice(), rule: '활성 감시 = 실제 조회 + 가격 검증 + 현재 유효한 감시 조건. 합성·캐시·미검증은 포함하지 않음.' };
}
module.exports = { PRICE_TYPE_LABEL, SIGNAL_CAVEATS, CACHE_AGE_NOTE, describe, summarize };

};
__defs["./data/universe.json"]=function(module){module.exports={
  "schemaVersion": 1,
  "version": "2026-10-29-kr-candidates.1",
  "description": "국내 후보 목록 초안입니다. 코드·종목명·시장구분은 공식 상장목록과 대조하지 않았습니다(대조 0건). 이 목록은 실제 감시 목록이 아니며 활성 0종목입니다.",
  "targetStockCandidates": 100,
  "honesty": {
    "verifiedAgainstOfficialListing": 0,
    "actualActiveMonitoring": 0,
    "realPriceValidated": 0,
    "realApiRequests": 0,
    "note": "100개 목표 중 부족분은 임의 생성하지 않고 비워 두었습니다. 대조는 사용자가 합법적으로 받은 공식 목록 파일로 오프라인에서 수행합니다."
  },
  "securities": [
    {
      "code": "005930",
      "name": "삼성전자",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "반도체·전자",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "000660",
      "name": "SK하이닉스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "반도체",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "009150",
      "name": "삼성전기",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "전자부품",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "036930",
      "name": "주성엔지니어링",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "반도체 장비",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "240810",
      "name": "원익IPS",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "반도체 장비",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "058470",
      "name": "리노공업",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "반도체 부품",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "403870",
      "name": "HPSP",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "반도체 장비",
      "evaluationProfile": "semiconductor",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "329180",
      "name": "HD현대중공업",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "조선",
      "evaluationProfile": "shipbuilding",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "009540",
      "name": "HD한국조선해양",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "조선",
      "evaluationProfile": "shipbuilding",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "005380",
      "name": "현대차",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "자동차",
      "evaluationProfile": "auto",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "000270",
      "name": "기아",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "자동차",
      "evaluationProfile": "auto",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "012330",
      "name": "현대모비스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "자동차 부품",
      "evaluationProfile": "auto",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "161390",
      "name": "한국타이어앤테크놀로지",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "자동차 부품",
      "evaluationProfile": "auto",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "105560",
      "name": "KB금융",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "은행·금융지주",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "055550",
      "name": "신한지주",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "은행·금융지주",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "086790",
      "name": "하나금융지주",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "은행·금융지주",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "316140",
      "name": "우리금융지주",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "은행·금융지주",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "024110",
      "name": "기업은행",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "은행",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "138040",
      "name": "메리츠금융지주",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "보험·증권 금융지주",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "005830",
      "name": "DB손해보험",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "손해보험",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "071050",
      "name": "한국금융지주",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "증권",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "032830",
      "name": "삼성생명",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "생명보험",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "000810",
      "name": "삼성화재",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "손해보험",
      "evaluationProfile": "financial",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "373220",
      "name": "LG에너지솔루션",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "2차전지",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "006400",
      "name": "삼성SDI",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "2차전지",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "051910",
      "name": "LG화학",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "화학",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "003670",
      "name": "포스코퓨처엠",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "2차전지 소재",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "247540",
      "name": "에코프로비엠",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "2차전지 소재",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "086520",
      "name": "에코프로",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "2차전지 소재",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "011170",
      "name": "롯데케미칼",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "화학",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "005490",
      "name": "POSCO홀딩스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "철강",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "004020",
      "name": "현대제철",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "철강",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "010130",
      "name": "고려아연",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "비철금속",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "207940",
      "name": "삼성바이오로직스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "바이오",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "068270",
      "name": "셀트리온",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "바이오",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "196170",
      "name": "알테오젠",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "바이오",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "028300",
      "name": "HLB",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "바이오",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "000100",
      "name": "유한양행",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "제약",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "128940",
      "name": "한미약품",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "제약",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "302440",
      "name": "SK바이오사이언스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "백신",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "326030",
      "name": "SK바이오팜",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "신약",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "035420",
      "name": "NAVER",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "인터넷",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "035720",
      "name": "카카오",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "인터넷",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "259960",
      "name": "크래프톤",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "게임",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "036570",
      "name": "엔씨소프트",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "게임",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "251270",
      "name": "넷마블",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "게임",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "263750",
      "name": "펄어비스",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "게임",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "293490",
      "name": "카카오게임즈",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "게임",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "041510",
      "name": "에스엠",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "엔터테인먼트",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "122870",
      "name": "와이지엔터테인먼트",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "엔터테인먼트",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "035760",
      "name": "CJ ENM",
      "market": "KOSDAQ",
      "securityType": "보통주",
      "group": "stock",
      "sector": "미디어",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "017670",
      "name": "SK텔레콤",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "통신",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "030200",
      "name": "KT",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "통신",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "015760",
      "name": "한국전력",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "전력",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "033780",
      "name": "KT&G",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "담배·소비재",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "097950",
      "name": "CJ제일제당",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "식품",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "271560",
      "name": "오리온",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "식품",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "051900",
      "name": "LG생활건강",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "생활용품",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "090430",
      "name": "아모레퍼시픽",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "화장품",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "035250",
      "name": "강원랜드",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "카지노·레저",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "012450",
      "name": "한화에어로스페이스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "방산·항공",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "034020",
      "name": "두산에너빌리티",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "발전설비",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "000720",
      "name": "현대건설",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "건설",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "028260",
      "name": "삼성물산",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "종합상사·건설",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "003550",
      "name": "LG",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "지주회사",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "034730",
      "name": "SK",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "지주회사",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "066570",
      "name": "LG전자",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "가전",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "018260",
      "name": "삼성에스디에스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "IT서비스",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "096770",
      "name": "SK이노베이션",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "정유·배터리",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "010950",
      "name": "S-Oil",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "정유",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "086280",
      "name": "현대글로비스",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "물류",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "011200",
      "name": "HMM",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "해운",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "047050",
      "name": "포스코인터내셔널",
      "market": "KOSPI",
      "securityType": "보통주",
      "group": "stock",
      "sector": "종합상사",
      "evaluationProfile": "general",
      "selectionReason": "업종 대표성·유동성 후보 — 조사 대상 선정 이유이며 매수 적격 판정이 아님. 시가총액 순위·거래대금은 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "069500",
      "name": "KODEX 200",
      "market": "KOSPI",
      "securityType": "ETF",
      "group": "etf",
      "etfKind": "domestic-equity",
      "sector": "국내 대표지수",
      "selectionReason": "국내 상장 ETF 별도 감시 후보 — 개별주 규칙과 분리. 운용사·보수·추적오차 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "102110",
      "name": "TIGER 200",
      "market": "KOSPI",
      "securityType": "ETF",
      "group": "etf",
      "etfKind": "domestic-equity",
      "sector": "국내 대표지수",
      "selectionReason": "국내 상장 ETF 별도 감시 후보 — 개별주 규칙과 분리. 운용사·보수·추적오차 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "091160",
      "name": "KODEX 반도체",
      "market": "KOSPI",
      "securityType": "ETF",
      "group": "etf",
      "etfKind": "domestic-equity",
      "sector": "국내 업종",
      "selectionReason": "국내 상장 ETF 별도 감시 후보 — 개별주 규칙과 분리. 운용사·보수·추적오차 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "133690",
      "name": "TIGER 미국나스닥100",
      "market": "KOSPI",
      "securityType": "ETF",
      "group": "etf",
      "etfKind": "overseas-equity",
      "sector": "해외 주식형",
      "selectionReason": "국내 상장 ETF 별도 감시 후보 — 개별주 규칙과 분리. 운용사·보수·추적오차 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    },
    {
      "code": "360750",
      "name": "TIGER 미국S&P500",
      "market": "KOSPI",
      "securityType": "ETF",
      "group": "etf",
      "etfKind": "overseas-equity",
      "sector": "해외 주식형",
      "selectionReason": "국내 상장 ETF 별도 감시 후보 — 개별주 규칙과 분리. 운용사·보수·추적오차 미확인",
      "selectedAt": "2026-10-29",
      "source": "Claude 기억 기반 대표성 후보(공식 상장목록 미대조)",
      "codeStatus": "unverified-recalled",
      "listingCheck": "unverified",
      "status": "hold",
      "reviewStatus": "candidate",
      "lastVerified": null,
      "evidenceUrl": null
    }
  ]
};};
function req(n){if(!__defs[n])throw new Error("module missing: "+n);if(__cache[n])return __cache[n].exports;var m={exports:{}};__cache[n]=m;__defs[n](m,m.exports,req);return m.exports;}
window.KSTMobileLab={flow:req("./mobile-flow.js"),status:req("./mobile-status.js"),rehearsal:req("./rehearsal.js"),watch:req("./watch-display.js"),universe:req("./data/universe.json")};
})();
