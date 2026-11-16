/* 배포 제안(초안) ONLY — 순태씨 GAS 승인 전에는 어디에도 배포·실행하지 않는다. 기존 doGet·history·screen 코드는 변경하지 않는다.
 * 요청: ?type=fundamental&tickers=AAPL,MSFT&callback=cb  (미국 종목만, 한 번에 최대 6개)
 * 응답: {ok:true, asOf, items:{AAPL:<has/fundamental-filter.js normalize() 결과 또는 {ok:false,reason}>}} 또는 {error:'...'}
 * 배포 시 함께 붙여넣을 파일: has/fundamental-filter.js (파일명 fundamental-filter.gs) + 이 파일.
 * 출처: SEC EDGAR 공개 API(인증·키 없음). 규칙 확인 2026-11-16 https://www.sec.gov/os/accessing-edgar-data
 *   (최대 초당 10건, 요청 헤더에 User-Agent 선언 필요), https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 *   (companyfacts = https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json, CORS 미지원 → 브라우저 직접 호출 불가, GAS 경유).
 * 개인정보: 요청에는 티커만 받는다. 보유·계좌·금액 정보는 GAS로 보내지 않는다. 키·비용 없음. 주문·매매 없음.
 * 이용률: 스크립트 잠금(요청 끝까지) + 스크립트 속성 상태로 모든 실행 합산 1건씩·250ms 간격·분당 60건, 429/403·결과 미기록이면 10분 전체 중단(재시도 없음).
 *   상태 저장소 PropertiesService https://developers.google.com/apps-script/guides/properties (일일 읽기/쓰기 할당량 수치는 미검증 — 초과 시 쓰기 실패 → 요청 보류)
 *   CacheService 만료는 제안값·조기 제거 가능(그래서 허가 상태에는 쓰지 않음, 조회 결과 캐시에만 사용)
 *   SEC 한도(사용자/애플리케이션 전체 초당 10건) https://www.sec.gov/filergroup/announcements-old/new-rate-control-limits
 *   CacheService 항목 100KB·최대 6시간 https://developers.google.com/apps-script/reference/cache/cache
 * 미검증: 실제 SEC 응답 크기·GAS 실행시간·UrlFetch 일일 할당량, company_tickers.json 정확도(SEC도 정확성 보증 안 함).
 */
// 순태씨가 배포 때 직접 채운다(저장소에는 실제 연락처를 두지 않는다). 예: 'HAS-portfolio 본인이메일'
var HAS_SEC_USER_AGENT = 'HAS-portfolio CONTACT_EMAIL_HERE';
var HAS_SEC_MAX_TICKERS = 6;
var HAS_SEC_MAX_FACTS_BYTES = 30 * 1024 * 1024;   // 이보다 큰 응답은 거부(UrlFetch 50MB 한도 안쪽)
var HAS_SEC_MAX_RESPONSE_CHARS = 200000;
var HAS_SEC_CACHE_SECONDS = 21600;                // CacheService 최대 6시간
var HAS_SEC_MIN_GAP_MS = 250;                     // 스크립트 전체 SEC 요청 시작 간격(모든 실행 합산, 최대 초당 4건 — 한도 10건보다 보수적)
var HAS_SEC_MAX_PER_MIN = 60;                     // 스크립트 전체 분당 SEC 요청 상한. 넘으면 요청하지 않고 보류
var HAS_SEC_COOLDOWN_MS = 10 * 60 * 1000;         // 429·403 받으면 10분간 모든 SEC 요청 중단(즉시 재요청 없음)
var HAS_SEC_LOCK_WAIT_MS = 10000;                 // 다른 실행이 SEC 요청 중이면(잠금은 요청 끝까지) 최대 10초 기다리고, 못 받으면 보류
var HAS_SEC_CIK_CACHE_SECONDS = 21600;            // 요청 티커의 CIK만 개별 캐시(지도 원본 ~1MB는 캐시 100KB 한도 초과라 저장 안 함)
var HAS_SEC_UNKNOWN_CACHE_SECONDS = 3600;         // 지도에 없는 티커도 1시간 기억 → 지도 반복 조회 방지
var HAS_SEC_TICKER_RE = /^[A-Z]{1,5}(?:[.-][A-Z])?$/;

function hasSecParseTickers_(raw) {
  if (typeof raw !== 'string' || raw.length > 128) return null;
  var seen = {}, out = [], parts = raw.split(',');
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i].trim().toUpperCase();
    if (!HAS_SEC_TICKER_RE.test(t)) return null;
    if (!seen[t]) { seen[t] = 1; out.push(t); }
  }
  return out.length >= 1 && out.length <= HAS_SEC_MAX_TICKERS ? out : null;
}

/* 모든 SEC 요청(지도+회사자료)이 지나는 관문 = hasSecFetch_ 하나.
 * (지피 GPT-REVIEW-sec-gas-20261116-1030 CR-3/CR-4) 요청 허가 상태는 조기 퇴거될 수 있는 CacheService가 아니라
 * 스크립트 속성(PropertiesService, 퇴거 없음)에 둔다. 스크립트 잠금을 SEC 요청이 끝날 때까지 쥐어 한 번에 1건만 나가게 하고,
 * 요청 전 '진행 중(pending)' 표시를 기록·되읽기 확인한 뒤에만 요청한다. 결과를 기록하지 못하면 표시가 남아
 * 다음 실행이 '차단됐을 수 있음'으로 보고 10분 중단한다(fail closed). 상태를 읽거나 쓰지 못하면 요청하지 않는다. */
var HAS_SEC_STATE_KEY = 'HAS_SEC_GATE_STATE';
function hasSecStateOk_(s) {
  if (!s || typeof s !== 'object') return false;
  var f = ['last', 'min', 'n', 'until', 'pending'];
  for (var i = 0; i < f.length; i++) { var v = s[f[i]]; if (typeof v !== 'number' || !isFinite(v) || v < 0) return false; }
  return true;
}
function hasSecReadState_(props) {
  var raw = props.getProperty(HAS_SEC_STATE_KEY);   // 읽기 실패(예외)는 호출자가 sec-state-hold로 처리
  if (raw === null || raw === undefined) return { last: 0, min: 0, n: 0, until: 0, pending: 0 };   // 처음 사용(속성은 퇴거되지 않음)
  var s; try { s = JSON.parse(raw); } catch (e) { return null; }
  return hasSecStateOk_(s) ? s : null;
}
function hasSecSaveState_(props, s) {   // 쓰고 되읽어 같을 때만 true
  try {
    var j = JSON.stringify(s); props.setProperty(HAS_SEC_STATE_KEY, j);
    return props.getProperty(HAS_SEC_STATE_KEY) === j;
  } catch (e) { return false; }
}

function hasSecFetch_(url) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(HAS_SEC_LOCK_WAIT_MS)) throw Error('sec-busy');
  var res;
  try {
    var props, s, now = Date.now();
    try { props = PropertiesService.getScriptProperties(); s = hasSecReadState_(props); } catch (e) { throw Error('sec-state-hold'); }
    if (!s) {   // 손상·형식 위반: 요청하지 않고 10분 중단 상태로 덮어쓰기 시도
      hasSecSaveState_(props, { last: now, min: 0, n: 0, until: now + HAS_SEC_COOLDOWN_MS, pending: 0 });
      throw Error('sec-state-hold');
    }
    if (s.pending) {   // 잠금 아래에서 본 pending = 앞 요청의 결과가 기록되지 않음(차단 기록 실패·실행 중단) → 차단으로 간주
      s.until = Math.max(s.until, now + HAS_SEC_COOLDOWN_MS); s.pending = 0;
      hasSecSaveState_(props, s);
      throw Error('sec-cooldown');
    }
    if (s.until > now) throw Error('sec-cooldown');
    var wait = s.last + HAS_SEC_MIN_GAP_MS - now;
    if (wait > 0) { Utilities.sleep(wait); now = Date.now(); }
    var min = Math.floor(now / 60000), n = s.min === min ? s.n : 0;
    if (n >= HAS_SEC_MAX_PER_MIN) throw Error('sec-rate-hold');
    s.last = now; s.min = min; s.n = n + 1; s.pending = now;
    if (!hasSecSaveState_(props, s)) throw Error('sec-state-hold');   // 기록 못 하면 요청하지 않음
    try {
      res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': HAS_SEC_USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } });
    } catch (e) {   // 네트워크 예외(차단 응답 아님): pending 해제 시도. 해제 실패 시 다음 실행이 중단으로 처리
      s.pending = 0; hasSecSaveState_(props, s);
      throw Error('sec-fetch-failed');
    }
    var code = res.getResponseCode();
    s.pending = 0;
    if (code === 429 || code === 403) {   // 이용률 제한·차단 신호: 재시도 없이 전체 중단 기록. 기록 실패면 pending이 남아 다음 실행도 중단
      s.until = Date.now() + HAS_SEC_COOLDOWN_MS;
      hasSecSaveState_(props, s);
      throw Error('sec-http-' + code);
    }
    hasSecSaveState_(props, s);   // 실패해도 pending이 남을 뿐(다음 실행 보수적 중단)
  } finally { lock.releaseLock(); }
  var code2 = res.getResponseCode();
  if (code2 !== 200) throw Error('sec-http-' + code2);
  var text = res.getContentText('UTF-8');
  if (text.length > HAS_SEC_MAX_FACTS_BYTES) throw Error('sec-too-large');
  return JSON.parse(text);
}

function hasSecValidCik_(n) { return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 9999999999; }
/* raw.cik: 정수 또는 숫자만으로 된 문자열(앞 0 허용)만 인정. 그 외는 null. */
function hasSecRawCik_(v) {
  if (typeof v === 'number') return hasSecValidCik_(v) ? v : null;
  if (typeof v === 'string' && /^\d{1,10}$/.test(v)) { var n = Number(v); return hasSecValidCik_(n) ? n : null; }
  return null;
}

/* 요청 티커의 CIK: 먼저 티커별 캐시, 없는 것만 company_tickers.json 한 번 받아 채운다.
 * 반환 {ciks:{T:cik}, unknown:{T:1}, mapError:'sec-...'|null} */
function hasSecCiks_(tickers, cache) {
  var ciks = {}, unknown = {}, need = [];
  tickers.forEach(function (t) {
    var v = cache.get('HAS_SEC_CIK_' + t);
    if (v === '0') unknown[t] = 1;
    else if (v && /^\d{1,10}$/.test(v) && hasSecValidCik_(Number(v))) ciks[t] = Number(v);
    else need.push(t);
  });
  if (!need.length) return { ciks: ciks, unknown: unknown, mapError: null };
  var map;
  try { map = hasSecFetch_('https://www.sec.gov/files/company_tickers.json'); }
  catch (e) { var m = String(e && e.message); return { ciks: ciks, unknown: unknown, mapError: /^sec-(busy|cooldown|rate-hold|state-hold|http-429|http-403)$/.test(m) ? m : 'sec-ticker-map-failed' }; }
  var found = {};
  Object.keys(map || {}).forEach(function (k) {
    var r = map[k];
    if (!r || typeof r.ticker !== 'string' || !hasSecValidCik_(r.cik_str)) return;
    var t = r.ticker.toUpperCase();
    if (need.indexOf(t) >= 0 && !found[t]) found[t] = r.cik_str;
  });
  need.forEach(function (t) {
    try {
      if (found[t]) { ciks[t] = found[t]; cache.put('HAS_SEC_CIK_' + t, String(found[t]), HAS_SEC_CIK_CACHE_SECONDS); }
      else { unknown[t] = 1; cache.put('HAS_SEC_CIK_' + t, '0', HAS_SEC_UNKNOWN_CACHE_SECONDS); }
    } catch (e) { /* 캐시 실패는 무시 */ }
  });
  return { ciks: ciks, unknown: unknown, mapError: null };
}

function hasSecCik10_(n) { return ('0000000000' + n).slice(-10); }

/* 캐시 키에 CIK를 넣고, 꺼낸 값도 티커·CIK·앱 검증(validNormalized)을 다시 확인한다. */
function hasSecOne_(ticker, cik, cache) {
  var key = 'HAS_SEC_F_' + ticker + '_' + hasSecCik10_(cik), hit = cache.get(key);
  if (hit) {
    try {
      var c = JSON.parse(hit);
      if (c && c.ticker === ticker && hasSecRawCik_(c.cik) === cik && HASFundamentalFilter.validNormalized(c)) return c;
    } catch (e) { /* 캐시 손상 → 다시 받기 */ }
  }
  var raw = hasSecFetch_('https://data.sec.gov/api/xbrl/companyfacts/CIK' + hasSecCik10_(cik) + '.json');
  if (!raw || raw.cik === undefined || raw.cik === null || raw.cik === '') throw Error('sec-cik-missing');
  if (hasSecRawCik_(raw.cik) !== cik) throw Error('sec-cik-mismatch');   // 다른 회사 자료를 이 티커로 확정하지 않는다
  var n = HASFundamentalFilter.normalize(raw, { ticker: ticker });
  if (!n || n.ok !== true || !HASFundamentalFilter.validNormalized(n)) throw Error('sec-normalize-failed');
  n.cik = String(cik);
  var json = JSON.stringify(n);
  if (json.length <= 90000) { try { cache.put(key, json, HAS_SEC_CACHE_SECONDS); } catch (e) { /* 캐시 실패는 무시 */ } }
  return n;
}

function hasSecCollect_(tickers) {
  var cache = CacheService.getScriptCache(), items = {};
  var m = hasSecCiks_(tickers, cache), held = null;
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    if (m.unknown[t]) { items[t] = { ok: false, reason: 'unknown-ticker', ticker: t }; continue; }
    if (!m.ciks[t]) { items[t] = { ok: false, reason: m.mapError || 'sec-ticker-map-failed', ticker: t }; continue; }
    if (held) { items[t] = { ok: false, reason: held, ticker: t }; continue; }   // 중단·보류 뒤에는 남은 종목도 요청하지 않음
    try {
      items[t] = hasSecOne_(t, m.ciks[t], cache);
    } catch (e) {
      var r = /^sec-/.test(String(e && e.message)) ? String(e.message) : 'sec-failed';
      if (/^sec-(busy|cooldown|rate-hold|state-hold|http-429|http-403)$/.test(r)) held = r === 'sec-http-429' || r === 'sec-http-403' ? 'sec-cooldown' : r;
      items[t] = { ok: false, reason: r, ticker: t };
    }
  }
  return { ok: true, asOf: new Date().toISOString().slice(0, 10), items: items };
}

function hasSecFundamentalResponse_(e, callback) {
  var data;
  try {
    var tickers = hasSecParseTickers_(e && e.parameter && e.parameter.tickers);
    data = tickers ? hasSecCollect_(tickers) : { error: 'bad-request' };
  } catch (err) { data = { error: 'fundamental-failed' }; }
  var json = JSON.stringify(data);
  if (json.length > HAS_SEC_MAX_RESPONSE_CHARS) json = JSON.stringify({ error: 'fundamental-too-large' });
  json = json.replace(/[<>&\u2028\u2029]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
  var cb = hasHistoryCallback_(callback) ? callback : null;
  var out = ContentService.createTextOutput(cb ? cb + '(' + json + ')' : json);
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}
/* 연결 한 줄(기존 doGet 맨 위, 순태씨 승인 후에만):
 *   if (e.parameter && e.parameter.type === 'fundamental') return hasSecFundamentalResponse_(e, e.parameter.callback);
 */
