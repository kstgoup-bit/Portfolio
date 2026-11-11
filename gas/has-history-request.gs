// =====================================================================
// HAS 추가분: 일별 가격 요청 (type=history). 기존 주식·환율 요청은 변경하지 않는다.
// 요청: ?type=history&tickers=QQQ,MSFT&market=US&callback=cb
// 한국: ?type=history&tickers=005930&market=KR&callback=cb (.KS, .KQ 순서)
// bars:[{d:'YYYY-MM-DD',c:가격}]의 d는 거래소 날짜이며 마감 시각·종가 확정을 뜻하지 않는다.
// regularMarketTime은 공급자 최근 거래 시각이다. 각 bar의 마감 시각으로 사용하지 않는다.
// Yahoo 비공식 응답과 수정주가 기준은 계속 미검증이다. 달력·세션·공식성 검증을 만들지 않는다.
// =====================================================================
var HAS_HISTORY_MAX_TICKERS = 12;
var HAS_HISTORY_MAX_REQUEST_CHARS = 512;
var HAS_HISTORY_MAX_RESPONSE_CHARS = 1048576;
var HAS_HISTORY_MAX_BARS = 400;
var HAS_HISTORY_MIN_PRICE = 0.00000001;
var HAS_HISTORY_MAX_PRICE = 1000000000000;
var HAS_HISTORY_MIN_SECONDS = 946684800; // 2000-01-01, 이 경로의 지원 범위
var HAS_HISTORY_MAX_SPAN_SECONDS = 370 * 86400;

function hasHistoryResponse_(e, callback) {
  var json;
  try {
    var p = e && e.parameter;
    json = JSON.stringify(hasGetHistories_(p && p.tickers, p && p.market));
  } catch (err) {
    json = JSON.stringify({ error: 'history-failed' });
  }
  // HTML script 문맥에서도 입력을 실행 가능한 문자열로 반사하지 않는다.
  json = json.replace(/[<>&\u2028\u2029]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
  var cb = hasHistoryCallback_(callback) ? callback : null;
  var out = ContentService.createTextOutput(cb ? cb + '(' + json + ')' : json);
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}

function hasHistoryCallback_(callback) {
  return typeof callback === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(callback) && !/\s/.test(callback) &&
    !/^(?:await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield|constructor|prototype|__proto__)$/.test(callback);
}

function hasHistoryTicker_(ticker, market) {
  if (typeof ticker !== 'string' || ticker.length > 15 || /\s/.test(ticker)) return false;
  if (market === 'KR') return /^[0-9][0-9A-Z]{5}$/.test(ticker);
  return market === 'US' && /^[A-Z][A-Z0-9]*(?:[.\-][A-Z0-9]+)*$/.test(ticker) && !/\.(KS|KQ)$/.test(ticker);
}

function hasGetHistories_(tickers, market) {
  if (typeof tickers !== 'string' || tickers.length > HAS_HISTORY_MAX_REQUEST_CHARS ||
      (market !== 'US' && market !== 'KR')) return { error: 'bad-request' };
  var raw = tickers.split(',');
  if (!raw.length || raw.length > HAS_HISTORY_MAX_TICKERS) return { error: 'bad-request' };
  var list = [], seen = Object.create(null), result = Object.create(null);
  // 모든 입력을 확인한 뒤 조회한다. 잘린 입력·잘못된 키를 응답에 반사하지 않는다.
  for (var j = 0; j < raw.length; j++) {
    var t = raw[j].trim().toUpperCase();
    if (!hasHistoryTicker_(t, market)) return { error: 'bad-request' };
    if (!seen[t]) { seen[t] = true; list.push(t); }
  }
  list.forEach(function (t) {
    var symbols = (market === 'KR') ? [t + '.KS', t + '.KQ'] : [t];
    result[t] = null;
    for (var i = 0; i < symbols.length && !result[t]; i++) {
      try { result[t] = hasFetchYahooHistory_(symbols[i], market); } catch (err) { result[t] = null; }
    }
  });
  return result;
}

function hasFetchYahooHistory_(symbol, market) {
  if (!hasHistoryIdentity_(symbol, market)) return null;
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1y';
  var response = UrlFetchApp.fetch(url, { method: 'get', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, muteHttpExceptions: true, followRedirects: false });
  if (response.getResponseCode() !== 200) return null;
  return hasParseYahooChart_(response.getContentText(), symbol, market);
}

function hasHistoryIdentity_(symbol, market) {
  if (typeof symbol !== 'string') return null;
  if (market === 'KR' && symbol.length === 9 && /^[0-9][0-9A-Z]{5}\.(KS|KQ)$/.test(symbol)) {
    return { currency: 'KRW', timezone: 'Asia/Seoul', exchange: /\.KS$/.test(symbol) ? 'KSC' : 'KOE' };
  }
  if (hasHistoryTicker_(symbol, market) && market === 'US') {
    return { currency: 'USD', timezone: 'America/New_York', exchange: null };
  }
  return null;
}

function hasHistoryObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasHistoryPrice_(value) {
  return typeof value === 'number' && isFinite(value) && value >= HAS_HISTORY_MIN_PRICE && value <= HAS_HISTORY_MAX_PRICE;
}

function hasHistorySeconds_(value, now) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value &&
    value >= HAS_HISTORY_MIN_SECONDS && value <= now;
}

function hasHistoryExchange_(meta, identity) {
  // 공급자 코드의 보수적인 지원 목록이다. 공식 거래소 확인이나 출처 독립성을 뜻하지 않는다.
  var names = {
    NMS: ['NasdaqGS', 'Nasdaq'], NGM: ['NasdaqGM', 'Nasdaq'], NCM: ['NasdaqCM', 'Nasdaq'],
    NYQ: ['NYSE'], ASE: ['NYSE American', 'AMEX'], PCX: ['NYSEArca', 'NYSE Arca'],
    BATS: ['BATS', 'Cboe US'], KSC: ['KSE'], KOE: ['KOSDAQ']
  };
  var code = meta.exchangeName;
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(names, code)) return null;
  if (identity.exchange ? code !== identity.exchange : (code === 'KSC' || code === 'KOE')) return null;
  var full = meta.fullExchangeName;
  if (full !== undefined && full !== null && (typeof full !== 'string' || names[code].indexOf(full) < 0)) return null;
  return full || code;
}

function hasParseYahooChart_(text, symbol, market) {
  // 내부 직접 호출도 같은 경계를 적용하며 원문·공급자 오류를 응답에 노출하지 않는다.
  try {
    var identity = hasHistoryIdentity_(symbol, market);
    if (!identity || typeof text !== 'string' || !text.length || text.length > HAS_HISTORY_MAX_RESPONSE_CHARS) return null;
    var data = JSON.parse(text), chart = data && data.chart;
    if (!hasHistoryObject_(data) || !hasHistoryObject_(chart) || (chart.error !== undefined && chart.error !== null) ||
        !Array.isArray(chart.result) || chart.result.length !== 1) return null;
    var r = chart.result[0];
    if (!hasHistoryObject_(r) || !hasHistoryObject_(r.meta) || !hasHistoryObject_(r.indicators) ||
        !Array.isArray(r.indicators.quote) || r.indicators.quote.length !== 1 || !hasHistoryObject_(r.indicators.quote[0])) return null;
    var m = r.meta, exchange = hasHistoryExchange_(m, identity);
    if (m.symbol !== symbol || m.currency !== identity.currency || m.exchangeTimezoneName !== identity.timezone ||
        !exchange || (m.instrumentType !== 'EQUITY' && m.instrumentType !== 'ETF') || m.dataGranularity !== '1d') return null;
    var ts = r.timestamp, cl = r.indicators.quote[0].close;
    if (!Array.isArray(ts) || !Array.isArray(cl) || ts.length !== cl.length || ts.length < 2 || ts.length > HAS_HISTORY_MAX_BARS) return null;
    var now = Math.floor(Date.now() / 1000), byDate = Object.create(null), order = [], earliest = now, latest = 0;
    for (var i = 0; i < ts.length; i++) {
      var c = cl[i], seconds = ts[i];
      if (!hasHistorySeconds_(seconds, now) || (c !== null && !hasHistoryPrice_(c))) return null;
      var d = Utilities.formatDate(new Date(seconds * 1000), identity.timezone, 'yyyy-MM-dd');
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) !== d) return null;
      earliest = Math.min(earliest, seconds); latest = Math.max(latest, seconds);
      if (latest - earliest > HAS_HISTORY_MAX_SPAN_SECONDS) return null;
      if (Object.prototype.hasOwnProperty.call(byDate, d)) {
        // 같은 날짜의 다른 시각·값은 모호하다. 마지막 값으로 덮어쓰지 않는다.
        if (byDate[d].seconds !== seconds || byDate[d].close !== c) return null;
      } else {
        byDate[d] = { seconds: seconds, close: c };
        if (c !== null) order.push(d);
      }
    }
    if (order.length < 2) return null;
    order.sort();
    var regularTime = null, regularPrice = null, high = null;
    if (m.regularMarketTime !== undefined && m.regularMarketTime !== null) {
      if (!hasHistorySeconds_(m.regularMarketTime, now) || m.regularMarketTime < latest) return null;
      regularTime = new Date(m.regularMarketTime * 1000).toISOString();
    }
    if (m.regularMarketPrice !== undefined && m.regularMarketPrice !== null) {
      if (!hasHistoryPrice_(m.regularMarketPrice)) return null;
      regularPrice = m.regularMarketPrice;
    }
    if (m.fiftyTwoWeekHigh !== undefined && m.fiftyTwoWeekHigh !== null) {
      if (!hasHistoryPrice_(m.fiftyTwoWeekHigh)) return null;
      high = m.fiftyTwoWeekHigh;
    }
    return {
      source: 'yahoo-chart-v8', symbol: m.symbol, currency: m.currency, exchange: exchange,
      timezone: identity.timezone, instrumentType: m.instrumentType,
      regularMarketTime: regularTime, regularMarketPrice: regularPrice, fiftyTwoWeekHigh: high,
      adjustment: 'unverified', barCount: order.length,
      // 반올림으로 0을 만들거나 큰 수를 곱해 Infinity를 만들지 않는다.
      bars: order.map(function (d) { return { d: d, c: byDate[d].close }; })
    };
  } catch (err) { return null; }
}
