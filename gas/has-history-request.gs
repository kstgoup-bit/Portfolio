// =====================================================================
// HAS 추가분: 일별 종가 요청 (type=history) — 기존 요청(주식·환율)의 응답은 바꾸지 않는다.
// 요청: ?type=history&tickers=QQQ,MSFT&market=US&callback=cb   /   ?type=history&tickers=005930&market=KR&callback=cb
// 응답: { "QQQ": { source, symbol, currency, exchange, timezone, instrumentType, regularMarketTime, regularMarketPrice,
//                  fiftyTwoWeekHigh, adjustment, barCount, bars:[{d:"2026-11-09", c:671.1}, ...] } , "없는종목": null }
// 가격 출처는 기존과 같은 야후 파이낸스(비공식)이며, 이 응답은 '미검증'이다. 키·비밀번호는 쓰지 않는다.
// =====================================================================
var HAS_HISTORY_MAX_TICKERS = 12;

function hasHistoryResponse_(e, callback) {
  var json;
  try {
    json = JSON.stringify(hasGetHistories_(e.parameter.tickers, e.parameter.market));
  } catch (err) {
    json = JSON.stringify({ error: 'history-failed' });
  }
  var cb = (typeof callback === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(callback)) ? callback : null;
  var out = ContentService.createTextOutput(cb ? cb + '(' + json + ')' : json);
  out.setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  return out;
}

function hasGetHistories_(tickers, market) {
  var result = {};
  if (typeof tickers !== 'string' || (market !== 'US' && market !== 'KR')) return { error: 'bad-request' };
  var list = tickers.split(',').slice(0, HAS_HISTORY_MAX_TICKERS);
  list.forEach(function (raw) {
    var t = String(raw).trim();
    if (!/^[A-Za-z0-9.\-^=]{1,15}$/.test(t)) { if (t) result[t.slice(0, 15)] = null; return; }
    var symbols = (market === 'KR') ? [t + '.KS', t + '.KQ'] : [t];
    result[t] = null;
    for (var i = 0; i < symbols.length && !result[t]; i++) {
      try { result[t] = hasFetchYahooHistory_(symbols[i]); } catch (err) { result[t] = null; }
    }
  });
  return result;
}

function hasFetchYahooHistory_(symbol) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=1y';
  var response = UrlFetchApp.fetch(url, { method: 'get', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return null;
  return hasParseYahooChart_(response.getContentText(), symbol);
}

function hasParseYahooChart_(text, symbol) {
  var data = JSON.parse(text);
  var r = data && data.chart && data.chart.result && data.chart.result[0];
  if (!r || !r.meta || !r.timestamp || !r.indicators || !r.indicators.quote || !r.indicators.quote[0]) return null;
  var tz = r.meta.exchangeTimezoneName, ts = r.timestamp, cl = r.indicators.quote[0].close;
  if (!tz || !Array.isArray(ts) || !Array.isArray(cl) || ts.length !== cl.length) return null;
  var byDate = {}, order = [];
  for (var i = 0; i < ts.length; i++) {
    var c = cl[i];
    if (typeof c !== 'number' || !isFinite(c) || c <= 0 || typeof ts[i] !== 'number') continue;
    var d = Utilities.formatDate(new Date(ts[i] * 1000), tz, 'yyyy-MM-dd');
    if (!(d in byDate)) order.push(d);
    byDate[d] = Math.round(c * 10000) / 10000;
  }
  order.sort();
  if (order.length < 2) return null;
  var bars = order.map(function (d) { return { d: d, c: byDate[d] }; });
  var m = r.meta;
  return {
    source: 'yahoo-chart-v8',
    symbol: symbol,
    currency: m.currency || null,
    exchange: m.fullExchangeName || m.exchangeName || null,
    timezone: tz,
    instrumentType: m.instrumentType || null,
    regularMarketTime: (typeof m.regularMarketTime === 'number') ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    regularMarketPrice: (typeof m.regularMarketPrice === 'number') ? m.regularMarketPrice : null,
    fiftyTwoWeekHigh: (typeof m.fiftyTwoWeekHigh === 'number') ? m.fiftyTwoWeekHigh : null,
    adjustment: 'unverified',
    barCount: bars.length,
    bars: bars
  };
}
