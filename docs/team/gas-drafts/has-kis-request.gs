// =====================================================================
// HAS 추가분: KIS 국내 일봉 종가 중계 (type=kis). 시세 조회 전용 초안.
// 기존 주식·환율·history 요청은 변경하지 않는다. 다른 파일에 의존하지 않는다(독립 파일).
//
// 요청: ?type=kis&tickers=069500,005930&callback=cb   (국내 6자리 종목코드, 최대 5개)
// 응답: {"069500":{source:"kis-daily",symbol,currency,exchange,timezone,adjustment,barCount,bars:[{d,c}]}}
//       실패 종목은 null, 요청 전체 오류는 {error:"코드"} (원문·키·토큰은 절대 반사하지 않는다)
//
// 키 보관: 스크립트 속성 KIS_APP_KEY, KIS_APP_SECRET (코드·응답·로그에 쓰지 않는다).
// 주문·계좌·잔고 경로는 만들지 않는다. 호출하는 주소는 시세 조회 한 가지와 토큰 발급뿐이다.
// 아래 엔드포인트·필드는 공개 가이드 기준이며 실제 호출로 확인하기 전까지 '미검증'이다.
// =====================================================================
var HAS_KIS_BASE = 'https://openapi.koreainvestment.com:9443';
var HAS_KIS_MAX_TICKERS = 5;
var HAS_KIS_DAILY_BUDGET = 150;        // 하루 KIS 호출 상한(토큰 발급 포함)
var HAS_KIS_LOOKBACK_DAYS = 150;       // 달력일 기준 조회 구간(한 번에 최대 100건)
var HAS_KIS_TOKEN_MARGIN_MS = 600000;  // 만료 10분 전부터 새로 발급
var HAS_KIS_MIN_PRICE = 1;
var HAS_KIS_MAX_PRICE = 100000000;

function hasKisResponse_(e, callback) {
  var json;
  try {
    var p = e && e.parameter;
    json = JSON.stringify(hasKisGet_(p && p.tickers));
  } catch (err) {
    json = JSON.stringify({ error: 'kis-failed' });
  }
  json = json.replace(/[<>&\u2028\u2029]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
  var cb = hasKisCallback_(callback) ? callback : null;
  var out = ContentService.createTextOutput(cb ? cb + '(' + json + ')' : json);
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}

function hasKisGet_(tickers) {
  if (typeof tickers !== 'string' || tickers.length > 64) return { error: 'bad-request' };
  var raw = tickers.split(','), list = [], seen = Object.create(null);
  if (!raw.length || raw.length > HAS_KIS_MAX_TICKERS) return { error: 'bad-request' };
  for (var i = 0; i < raw.length; i++) {
    var t = raw[i].trim().toUpperCase();
    if (!hasKisTicker_(t)) return { error: 'bad-request' };
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
    if (!hasKisSpend_(props)) { return { error: 'kis-budget' }; }
    try { result[list[j]] = hasKisDaily_(list[j], token, key, secret); } catch (err) { result[list[j]] = null; }
  }
  return result;
}

// 하루 호출 예산. 한도를 넘으면 더 호출하지 않는다(환불 없음).
function hasKisSpend_(props) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var used = parseInt(props.getProperty('KIS_BUDGET_' + day) || '0', 10) || 0;
    if (used >= HAS_KIS_DAILY_BUDGET) return false;
    props.setProperty('KIS_BUDGET_' + day, String(used + 1));
    return true;
  } finally { lock.releaseLock(); }
}

// 토큰은 약 24시간 유효하고 재발급이 제한될 수 있어 속성에 저장해 재사용한다.
function hasKisToken_(props, key, secret) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return null;
  try {
    var saved = props.getProperty('KIS_TOKEN'), exp = Number(props.getProperty('KIS_TOKEN_EXP') || '0');
    if (saved && exp - Date.now() > HAS_KIS_TOKEN_MARGIN_MS) return saved;
    if (!hasKisSpend_Unlocked_(props)) return null;
    var res = UrlFetchApp.fetch(HAS_KIS_BASE + '/oauth2/tokenP', {
      method: 'post', contentType: 'application/json; charset=utf-8',
      payload: JSON.stringify({ grant_type: 'client_credentials', appkey: key, appsecret: secret }),
      muteHttpExceptions: true, followRedirects: false
    });
    if (res.getResponseCode() !== 200) return null;
    var body = JSON.parse(res.getContentText());
    if (!body || typeof body.access_token !== 'string' || !body.access_token) return null;
    var life = Number(body.expires_in);
    if (!isFinite(life) || life <= 0) life = 3600;
    props.setProperty('KIS_TOKEN', body.access_token);
    props.setProperty('KIS_TOKEN_EXP', String(Date.now() + life * 1000));
    return body.access_token;
  } catch (err) { return null; } finally { lock.releaseLock(); }
}

// 토큰 발급도 예산에 포함한다(이미 락을 잡은 상태에서 호출).
function hasKisSpend_Unlocked_(props) {
  var day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var used = parseInt(props.getProperty('KIS_BUDGET_' + day) || '0', 10) || 0;
  if (used >= HAS_KIS_DAILY_BUDGET) return false;
  props.setProperty('KIS_BUDGET_' + day, String(used + 1));
  return true;
}

function hasKisDaily_(ticker, token, key, secret) {
  var end = new Date(), start = new Date(end.getTime() - HAS_KIS_LOOKBACK_DAYS * 86400000);
  var q = {
    FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker,
    FID_INPUT_DATE_1: Utilities.formatDate(start, 'Asia/Seoul', 'yyyyMMdd'),
    FID_INPUT_DATE_2: Utilities.formatDate(end, 'Asia/Seoul', 'yyyyMMdd'),
    FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '1'
  };
  var qs = Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  var res = UrlFetchApp.fetch(HAS_KIS_BASE + '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?' + qs, {
    method: 'get', muteHttpExceptions: true, followRedirects: false,
    headers: {
      'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + token,
      appkey: key, appsecret: secret, tr_id: 'FHKST03010100', custtype: 'P'
    }
  });
  if (res.getResponseCode() !== 200) return null;
  return hasKisParse_(res.getContentText(), ticker);
}

function hasKisParse_(text, ticker) {
  try {
    if (typeof text !== 'string' || !text.length || text.length > 1048576) return null;
    var d = JSON.parse(text);
    if (!d || d.rt_cd !== '0' || !Array.isArray(d.output2)) return null;
    var byDate = Object.create(null), order = [];
    for (var i = 0; i < d.output2.length; i++) {
      var row = d.output2[i], ds = row && row.stck_bsop_date, c = row && Number(row.stck_clpr);
      if (typeof ds !== 'string' || !/^\d{8}$/.test(ds)) continue;   // 빈 행은 건너뜀
      if (!isFinite(c) || c < HAS_KIS_MIN_PRICE || c > HAS_KIS_MAX_PRICE) return null;
      var iso = ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8);
      if (new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso) return null;
      if (Object.prototype.hasOwnProperty.call(byDate, iso)) {
        if (byDate[iso] !== c) return null;                          // 같은 날 다른 값은 모호
      } else { byDate[iso] = c; order.push(iso); }
    }
    if (order.length < 2) return null;
    order.sort();
    return {
      source: 'kis-daily', symbol: ticker, currency: 'KRW', exchange: 'KRX', timezone: 'Asia/Seoul',
      adjustment: 'raw-per-kis-flag-1', barCount: order.length,
      bars: order.map(function (x) { return { d: x, c: byDate[x] }; })
    };
  } catch (err) { return null; }
}

// 콜백 이름과 종목코드 검증(이 파일 안에서 자체 제공).
function hasKisCallback_(callback) {
  return typeof callback === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(callback) &&
    !/^(?:await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield|constructor|prototype|__proto__)$/.test(callback);
}

function hasKisTicker_(ticker) {
  return typeof ticker === 'string' && ticker.length === 6 && /^[0-9][0-9A-Z]{5}$/.test(ticker);
}
