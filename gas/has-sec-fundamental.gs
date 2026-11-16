/* 배포 제안(초안) ONLY — 순태씨 GAS 승인 전에는 어디에도 배포·실행하지 않는다. 기존 doGet·history·screen 코드는 변경하지 않는다.
 * 요청: ?type=fundamental&tickers=AAPL,MSFT&callback=cb  (미국 종목만, 한 번에 최대 6개)
 * 응답: {ok:true, asOf, items:{AAPL:<has/fundamental-filter.js normalize() 결과 또는 {ok:false,reason}>}} 또는 {error:'...'}
 * 배포 시 함께 붙여넣을 파일: has/fundamental-filter.js (파일명 fundamental-filter.gs) + 이 파일.
 * 출처: SEC EDGAR 공개 API(인증·키 없음). 규칙 확인 2026-11-16 https://www.sec.gov/os/accessing-edgar-data
 *   (최대 초당 10건, 요청 헤더에 User-Agent 선언 필요), https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 *   (companyfacts = https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json, CORS 미지원 → 브라우저 직접 호출 불가, GAS 경유).
 * 개인정보: 요청에는 티커만 받는다. 보유·계좌·금액 정보는 GAS로 보내지 않는다. 키·비용 없음. 주문·매매 없음.
 * 미검증: 실제 SEC 응답 크기·GAS 실행시간·UrlFetch 일일 할당량, company_tickers.json 정확도(SEC도 정확성 보증 안 함).
 */
// 순태씨가 배포 때 직접 채운다(저장소에는 실제 연락처를 두지 않는다). 예: 'HAS-portfolio 본인이메일'
var HAS_SEC_USER_AGENT = 'HAS-portfolio CONTACT_EMAIL_HERE';
var HAS_SEC_MAX_TICKERS = 6;
var HAS_SEC_MAX_FACTS_BYTES = 30 * 1024 * 1024;   // 이보다 큰 응답은 거부(UrlFetch 50MB 한도 안쪽)
var HAS_SEC_MAX_RESPONSE_CHARS = 200000;
var HAS_SEC_CACHE_SECONDS = 21600;                // CacheService 최대 6시간
var HAS_SEC_MIN_GAP_MS = 200;                     // 요청 간 간격(초당 10건 한도보다 넉넉히 느리게)
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

function hasSecFetch_(url) {
  var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': HAS_SEC_USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } });
  var code = res.getResponseCode();
  if (code !== 200) throw Error('sec-http-' + code);
  var text = res.getContentText('UTF-8');
  if (text.length > HAS_SEC_MAX_FACTS_BYTES) throw Error('sec-too-large');
  return JSON.parse(text);
}

/* company_tickers.json: {"0":{"cik_str":320193,"ticker":"AAPL","title":"Apple Inc."},...} → 요청 티커의 CIK만 뽑는다. */
function hasSecCiks_(tickers) {
  var map = hasSecFetch_('https://www.sec.gov/files/company_tickers.json'), out = {};
  Object.keys(map).forEach(function (k) {
    var r = map[k];
    if (!r || typeof r.ticker !== 'string' || !Number.isInteger(r.cik_str) || r.cik_str <= 0) return;
    var t = r.ticker.toUpperCase();
    if (tickers.indexOf(t) >= 0 && !out[t]) out[t] = r.cik_str;
  });
  return out;
}

function hasSecCik10_(n) { return ('0000000000' + n).slice(-10); }

function hasSecOne_(ticker, cik, cache) {
  var key = 'HAS_SEC_F_' + ticker, hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* 캐시 손상 → 다시 받기 */ } }
  var raw = hasSecFetch_('https://data.sec.gov/api/xbrl/companyfacts/CIK' + hasSecCik10_(cik) + '.json');
  var n = HASFundamentalFilter.normalize(raw, { ticker: ticker });
  var json = JSON.stringify(n);
  if (json.length <= 90000) { try { cache.put(key, json, HAS_SEC_CACHE_SECONDS); } catch (e) { /* 캐시 실패는 무시 */ } }
  return n;
}

function hasSecCollect_(tickers) {
  var cache = CacheService.getScriptCache(), items = {}, ciks;
  try { ciks = hasSecCiks_(tickers); } catch (e) { return { error: 'sec-ticker-map-failed' }; }
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    if (!ciks[t]) { items[t] = { ok: false, reason: 'unknown-ticker', ticker: t }; continue; }
    try {
      if (i > 0) Utilities.sleep(HAS_SEC_MIN_GAP_MS);
      items[t] = hasSecOne_(t, ciks[t], cache);
    } catch (e) {
      items[t] = { ok: false, reason: /^sec-/.test(String(e && e.message)) ? String(e.message) : 'sec-failed', ticker: t };
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
