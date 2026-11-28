// =====================================================================
// HAS 추가분: KIS 미국 일봉 종가 중계 (type=kis-us). 시세 조회 전용.
// 기존 has-kis-request.gs(국내, type=kis)의 토큰·하루 예산·콜백 검사 함수를 그대로 재사용한다
// (토큰을 새로 발급하지 않음 → 국내 조회와 토큰·예산을 함께 씀).
//
// 요청: ?type=kis-us&tickers=AAPL,MSFT&callback=cb   (미국 티커, 최대 5개)
// 응답: {"AAPL":{source:"kis-overseas-daily",symbol,currency:"USD",exchange:"NAS",timezone:"America/New_York",
//         adjustment:"kis-modp-1",barCount,bars:[{d,c}]}}  실패 종목은 null, 요청 전체 오류는 {error:"코드"}
//
// KIS API: GET /uapi/overseas-price/v1/quotations/dailyprice, tr_id HHDFS76240000
//   EXCD(NAS·NYS·AMS), SYMB, GUBN=0(일), BYMD=''(오늘부터 과거로), MODP=1(수정주가), output2[].xymd·clos
//   출처(2차): https://algolab.co.kr/blog/kis-overseas-dailyprice-hhdfs76240000-2026 (KIS 공식 예제 저장소 기준 정리)
//   실제 호출로 확인하기 전까지 '미검증'. 주문·계좌·잔고 경로는 만들지 않는다.
// 키·토큰은 코드·응답·로그에 쓰지 않는다(스크립트 속성 KIS_APP_KEY, KIS_APP_SECRET만 사용).
// =====================================================================
var HAS_KIS_US_MAX_TICKERS = 5;
var HAS_KIS_US_EXCHANGES = ['NAS', 'NYS', 'AMS'];   // 거래소를 모르면 이 순서로 찾고, 찾은 거래소는 기억
var HAS_KIS_US_MIN_PRICE = 0.0001;
var HAS_KIS_US_MAX_PRICE = 1000000;
var HAS_KIS_US_GAP_MS = 120;                         // 호출 사이 간격(초당 한도 보호)

function hasKisUsResponse_(e, callback) {
  var json;
  try {
    var p = e && e.parameter;
    json = JSON.stringify(hasKisUsGet_(p && p.tickers));
  } catch (err) {
    json = JSON.stringify({ error: 'kis-us-failed' });
  }
  json = json.replace(/[<>&\u2028\u2029]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
  var cb = (typeof hasKisCallback_ === 'function' && hasKisCallback_(callback)) ? callback : null;
  var out = ContentService.createTextOutput(cb ? cb + '(' + json + ')' : json);
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}

function hasKisUsGet_(tickers) {
  if (typeof hasKisToken_ !== 'function' || typeof hasKisSpend_ !== 'function') return { error: 'kis-base-missing' };
  if (typeof tickers !== 'string' || tickers.length > 64) return { error: 'bad-request' };
  var raw = tickers.split(','), list = [], seen = Object.create(null);
  if (!raw.length || raw.length > HAS_KIS_US_MAX_TICKERS) return { error: 'bad-request' };
  for (var i = 0; i < raw.length; i++) {
    var t = raw[i].trim().toUpperCase();
    if (!hasKisUsTicker_(t)) return { error: 'bad-request' };
    if (!seen[t]) { seen[t] = true; list.push(t); }
  }
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('KIS_APP_KEY'), secret = props.getProperty('KIS_APP_SECRET');
  if (!key || !secret) return { error: 'kis-not-configured' };
  var token = hasKisToken_(props, key, secret);
  if (!token) return { error: 'kis-token' };
  var result = Object.create(null);
  for (var j = 0; j < list.length; j++) {
    result[list[j]] = null;
    try {
      var r = hasKisUsFind_(props, list[j], token, key, secret);
      if (r === 'budget') return { error: 'kis-budget' };
      result[list[j]] = r;
    } catch (err) { result[list[j]] = null; }
  }
  return result;
}

// 기억한 거래소 먼저, 없으면 NAS→NYS→AMS 순서로 찾는다. 찾으면 거래소를 기억한다.
function hasKisUsFind_(props, ticker, token, key, secret) {
  var memo = props.getProperty('KIS_US_EX_' + ticker);
  var order = HAS_KIS_US_EXCHANGES.slice();
  if (memo && order.indexOf(memo) >= 0) { order.splice(order.indexOf(memo), 1); order.unshift(memo); }
  for (var i = 0; i < order.length; i++) {
    if (!hasKisSpend_(props)) return 'budget';
    var r = hasKisUsDaily_(ticker, order[i], token, key, secret);
    Utilities.sleep(HAS_KIS_US_GAP_MS);
    if (r) {
      if (memo !== order[i]) props.setProperty('KIS_US_EX_' + ticker, order[i]);
      return r;
    }
  }
  return null;
}

function hasKisUsDaily_(ticker, excd, token, key, secret) {
  var q = { AUTH: '', EXCD: excd, SYMB: ticker, GUBN: '0', BYMD: '', MODP: '1' };
  var qs = Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  var res = UrlFetchApp.fetch(HAS_KIS_BASE + '/uapi/overseas-price/v1/quotations/dailyprice?' + qs, {
    method: 'get', muteHttpExceptions: true, followRedirects: false,
    headers: {
      'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + token,
      appkey: key, appsecret: secret, tr_id: 'HHDFS76240000', custtype: 'P'
    }
  });
  if (res.getResponseCode() !== 200) return null;
  return hasKisUsParse_(res.getContentText(), ticker, excd);
}

// 실패 폐쇄: 형식 오류 행·미래 날짜 봉·응답 종목 불일치는 종목 전체를 null로 돌린다(빈 행만 건너뜀).
// 조기 폐장·휴장·응답 종목 식별 형식은 공식 응답으로 확인하지 못해 결과에 '미검증'으로 남긴다(독립 검증 아님).
function hasKisUsParse_(text, ticker, excd, nowMs) {
  try {
    if (typeof text !== 'string' || !text.length || text.length > 1048576) return null;
    var d = JSON.parse(text);
    if (!d || d.rt_cd !== '0' || !Array.isArray(d.output2)) return null;
    var o1 = d.output1, rsym = o1 && typeof o1 === 'object' && typeof o1.rsym === 'string' ? o1.rsym.trim().toUpperCase() : '';
    if (rsym && rsym.slice(-ticker.length) !== ticker) return null;         // 응답 종목 표시가 요청과 다르면 거부
    var byDate = Object.create(null), order = [];
    function blank(v) { return v === undefined || v === null || (typeof v === 'string' && !v.trim()); }
    for (var i = 0; i < d.output2.length; i++) {
      var row = d.output2[i], ds = row && row.xymd, cs = row && row.clos;
      if (row && typeof row === 'object' && blank(ds) && blank(cs)) continue;   // 빈 행만 건너뜀
      if (typeof ds !== 'string' || !/^\d{8}$/.test(ds)) return null;           // 날짜 형식 오류는 거부
      var c = Number(cs);
      if (typeof cs !== 'string' || !cs.trim() || !isFinite(c) || c < HAS_KIS_US_MIN_PRICE || c > HAS_KIS_US_MAX_PRICE) return null;
      var iso = ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8);
      if (new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso) return null;
      if (Object.prototype.hasOwnProperty.call(byDate, iso)) {
        if (byDate[iso] !== c) return null;                                // 같은 날 다른 값은 모호
      } else { byDate[iso] = c; order.push(iso); }
    }
    order.sort();
    var now = new Date(typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : Date.now());
    var etDay = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
    var etHm = Number(Utilities.formatDate(now, 'America/New_York', 'HHmm'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(etDay) || !isFinite(etHm)) return null;
    if (order.length && order[order.length - 1] > etDay) return null;     // 미국 동부 오늘보다 뒤 날짜 봉 = 시계·자료 오류로 보고 거부
    // 장중 봉 제외: 미국 동부 기준 오늘 날짜 봉은 16:30(마감 30분 뒤) 전에는 확정 종가가 아니므로 뺀다.
    var partial = false;
    if (order.length && order[order.length - 1] === etDay && etHm < 1630) { order = order.filter(function (x) { return x < etDay; }); partial = true; }
    if (order.length < 2) return null;                                     // 거래소가 틀리면 보통 빈 목록
    return {
      source: 'kis-overseas-daily', symbol: ticker, currency: 'USD', exchange: excd, timezone: 'America/New_York',
      adjustment: 'kis-modp-1', barCount: order.length, intradayDropped: partial,
      verification: 'single-source-unverified', identity: rsym ? 'rsym-suffix-match-format-unverified' : 'request-echo-unverified',
      currencyBasis: 'request-assumed-unverified', sessionCalendar: 'unverified',
      bars: order.map(function (x) { return { d: x, c: byDate[x] }; })
    };
  } catch (err) { return null; }
}

function hasKisUsTicker_(t) {
  return typeof t === 'string' && /^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(t);
}

// 편집기에서 직접 실행해 보는 시험(배포 전 확인용). 실행 로그에 결과 요약만 찍는다(키·토큰 없음).
function hasKisUsSelfTest() {
  var r = hasKisUsGet_('AAPL,KO');
  Object.keys(r).forEach(function (k) {
    var v = r[k];
    if (k === 'error') { Logger.log('오류: ' + v); return; }
    Logger.log(k + ': ' + (v ? (v.exchange + ' ' + v.barCount + '일, 마지막 ' + v.bars[v.bars.length - 1].d + ' 종가 ' + v.bars[v.bars.length - 1].c + (v.intradayDropped ? ' (장중 봉 제외됨)' : '')) : '실패(null)'));
  });
}
