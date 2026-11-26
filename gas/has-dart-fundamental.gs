/* 배포 제안(초안) ONLY — 순태씨 GAS 승인·OpenDART 키 발급 전에는 어디에도 배포·실행하지 않는다. 기존 doGet·history·screen·SEC 코드는 변경하지 않는다.
 * 요청: ?type=dart-fundamental&tickers=267260,071970&callback=cb  (국내 6자리 종목코드, 한 번에 최대 3개)
 * 응답: {ok:true, asOf, items:{'267260':<has/dart-facts-adapter.js toNormalized() 결과 또는 {ok:false,reason}>}} 또는 {error:'...'}
 * 배포 시 함께 붙여넣을 파일: has/dart-facts-adapter.js(파일명 dart-facts-adapter.gs, 전역 HASDartFacts) + 이 파일 + has-history-request.gs(hasHistoryCallback_).
 * 인증키: OpenDART 키는 스크립트 속성 HAS_DART_KEY에만 둔다(코드·채팅·깃허브·응답에 넣지 않는다). 키가 없으면 요청 0건, 응답에도 키·요청 주소를 싣지 않는다.
 * 종목 신원: 종목코드→corp_code는 아래 HAS_DART_CORPS에 순태씨가 DART 공시검색으로 직접 확인해 적은 것만 쓴다(자동 추정·이름 일치 금지).
 *   목록에 없는 종목은 요청 0건 'unknown-ticker'. 아래 값은 전부 자리표시자이며 실제 회사코드가 아니다.
 * 개인정보: 요청에는 종목코드만 받는다. 보유·계좌·금액 정보는 GAS로 보내지 않는다. 주문·매매 없음. 비용: OpenDART는 무료지만 일 한도가 있다
 *   (제3자 문서 기준 약 20,000건 — 공식 확인 필요, 미검증). 종목당 연간 보고서 5건 요청 → 한 번에 최대 15건.
 * 이용률: 스크립트 잠금(요청 끝까지) 1건씩·250ms 간격. 응답 status가 000·013 말고 나오면(키 오류 010/011/012·한도 020 등) 남은 요청을 모두 멈추고
 *   그 사유 코드만 돌려준다(재시도 없음). 응답 본문·요청 주소는 돌려주지 않는다.
 * 미검증: 실제 응답 크기·실행시간·UrlFetch 할당량·공식 규격(has/dart-facts-adapter.js 머리말 참조).
 */
var HAS_DART_KEY_PROP = 'HAS_DART_KEY';
var HAS_DART_MAX_TICKERS = 3;
var HAS_DART_YEARS = 5;
var HAS_DART_MIN_GAP_MS = 250;
var HAS_DART_LOCK_WAIT_MS = 10000;
var HAS_DART_CACHE_SECONDS = 21600;             // 변환 결과(작음)만 캐시. 원본 응답은 캐시하지 않는다(100KB 한도).
var HAS_DART_MAX_RESPONSE_CHARS = 200000;
var HAS_DART_TICKER_RE = /^[0-9]{6}$/;
// 순태씨가 직접 확인해 채운다. 형식: '종목코드': {corpCode:'8자리', name:'회사명', reviewedOn:'YYYY-MM-DD'}
var HAS_DART_CORPS = {
  // '000000': {corpCode: '00000000', name: '예시전자', reviewedOn: '2026-01-01'}   ← 자리표시자(주석)
};

function hasDartParseTickers_(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  var seen = {}, out = [], parts = raw.split(',');
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i].trim();
    if (!HAS_DART_TICKER_RE.test(t)) return null;
    if (!seen[t]) { seen[t] = 1; out.push(t); }
  }
  return out.length >= 1 && out.length <= HAS_DART_MAX_TICKERS ? out : null;
}

function hasDartCorpOf_(ticker) {
  if (!Object.prototype.hasOwnProperty.call(HAS_DART_CORPS, ticker)) return null;
  var c = HAS_DART_CORPS[ticker];
  if (!c || typeof c.corpCode !== 'string' || !/^\d{8}$/.test(c.corpCode) || typeof c.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.reviewedOn || '')) return null;
  return c;
}

/* 한 건 요청. 실패는 예외 대신 {halt:'코드'} 또는 {skip:'코드'}. 요청 주소·본문은 밖으로 내보내지 않는다. */
function hasDartFetchYear_(key, corpCode, year, state) {
  var gap = state.last + HAS_DART_MIN_GAP_MS - Date.now();
  if (gap > 0) Utilities.sleep(gap);
  state.last = Date.now();
  var url = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json?crtfc_key=' + encodeURIComponent(key) + '&corp_code=' + corpCode + '&bsns_year=' + year + '&reprt_code=11011&fs_div=CFS';
  var res;
  try { res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false }); } catch (e) { return { halt: 'dart-fetch-failed' }; }
  var code = res.getResponseCode();
  if (code !== 200) return { halt: 'dart-http-' + code };
  var body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { return { halt: 'dart-bad-json' }; }
  var st = body && typeof body.status === 'string' ? body.status : '';
  if (st === '013') return { year: { bsnsYear: String(year), fsDiv: 'CFS', response: { status: '013', list: [] } } };
  if (st !== '000') return { halt: /^\d{3}$/.test(st) ? 'dart-status-' + st : 'dart-status-unknown' };
  return { year: { bsnsYear: String(year), fsDiv: 'CFS', response: { status: '000', message: '', list: Array.isArray(body.list) ? body.list : [] } } };
}

function hasDartCollect_(tickers) {
  var key = PropertiesService.getScriptProperties().getProperty(HAS_DART_KEY_PROP);
  if (typeof key !== 'string' || key.length !== 40 || !/^[0-9a-fA-F]+$/.test(key)) return { error: 'dart-key-missing' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(HAS_DART_LOCK_WAIT_MS)) return { error: 'dart-busy' };
  try {
    var cache = CacheService.getScriptCache(), items = {}, state = { last: 0 }, halted = null;
    var thisYear = new Date().getFullYear(), now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    for (var i = 0; i < tickers.length; i++) {
      var t = tickers[i], corp = hasDartCorpOf_(t);
      if (!corp) { items[t] = { ok: false, reason: 'unknown-ticker' }; continue; }
      if (halted) { items[t] = { ok: false, reason: halted }; continue; }
      var ckey = 'HAS_DART_F_' + t + '_' + corp.corpCode, hit = cache.get(ckey);
      if (hit) { try { var o = JSON.parse(hit); if (o && o.ok === true && o.ticker === t && o.corpCode === corp.corpCode) { items[t] = o; continue; } } catch (e) { /* 재수집 */ } }
      var reports = [], stop = null;
      for (var y = thisYear - 1; y >= thisYear - HAS_DART_YEARS; y--) {
        var r = hasDartFetchYear_(key, corp.corpCode, y, state);
        if (r.halt) { stop = r.halt; break; }
        reports.push(r.year);
      }
      if (stop) { halted = stop; items[t] = { ok: false, reason: stop }; continue; }
      var n = HASDartFacts.toNormalized({
        version: 1, mode: 'imported', instrument: { ticker: t, market: 'KR', currency: 'KRW' },
        corp: { corpCode: corp.corpCode, name: corp.name, fiscalYearEnd: '12-31' },
        identityReview: { reviewed: true, ticker: t, corpCode: corp.corpCode, reviewedOn: corp.reviewedOn }, reports: reports
      }, now);
      items[t] = n;
      if (n && n.ok === true) { try { cache.put(ckey, JSON.stringify(n), HAS_DART_CACHE_SECONDS); } catch (e) { /* 캐시 실패는 무시 */ } }
    }
    return { ok: true, asOf: now.slice(0, 10), items: items };
  } finally { lock.releaseLock(); }
}

function hasDartFundamentalResponse_(e, callback) {
  var data;
  try {
    var tickers = hasDartParseTickers_(e && e.parameter && e.parameter.tickers);
    data = tickers ? hasDartCollect_(tickers) : { error: 'bad-request' };
  } catch (err) { data = { error: 'dart-fundamental-failed' }; }
  var json = JSON.stringify(data);
  if (json.length > HAS_DART_MAX_RESPONSE_CHARS) json = JSON.stringify({ error: 'dart-fundamental-too-large' });
  json = json.replace(/[<>&\u2028\u2029]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
  var cb = hasHistoryCallback_(callback) ? callback : null;
  var out = ContentService.createTextOutput(cb ? cb + '(' + json + ')' : json);
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}
/* 연결 한 줄(기존 doGet 맨 위, 순태씨 승인 후에만):
 *   if (e.parameter && e.parameter.type === 'dart-fundamental') return hasDartFundamentalResponse_(e, e.parameter.callback);
 */
