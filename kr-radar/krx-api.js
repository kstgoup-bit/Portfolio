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
