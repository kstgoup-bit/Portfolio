/* HAS: 국내 보유 종목 확정 종가를 두 공급자(Yahoo 이력 · KIS 일봉)로 대조해 보여주기만 한다.
 * 같은 사용자 GAS를 거치지만 GAS는 전달수단일 뿐이고, 원천 공급자는 Yahoo와 KIS로 서로 다르다.
 * 평가가격·신호·투자기록·백업을 바꾸지 않는다. 대조 요약만 별도 키(has_kisCrossLog_v1)에 날짜별로 남긴다(이 기기 전용, 백업에 포함).
 * 앱을 연 날 한 번 자동 대조(한국 날짜 기준), 이후는 버튼으로만.
 * 오늘(한국 날짜) 막대는 확정 종가가 아니므로 비교하지 않는다. 주문·계좌 경로 없음. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASKISCrossCheck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TOLERANCE_PCT = 0.5, WINDOW = 20, LOG_KEY = 'has_kisCrossLog_v1', LOG_MAX = 90, GOAL = 20, MAX_TICKERS = 15, KIS_CHUNK = 5, HISTORY_CHUNK = 12, MIN_GAP_MS = 600000, STALE_DAYS = 6, AUTO_MAX = 2;
  var SOURCES = { yahoo: 'yahoo-chart-v8', kis: 'kis-daily' };

  function plain(o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === Object.prototype || p === null; }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function validPrice(x) { return typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 1e8; }
  function validTicker(t) { return typeof t === 'string' && /^[0-9][0-9A-Z]{5}$/.test(t); }
  // 달력 날짜 차이(일). 공식 거래 달력이 아니므로 '오래됨' 판정에만 쓴다(주말·연휴 포함 6일 넘으면 오래됨).
  function dayGap(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function weekday(d) { var w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; }
  // 대조 종목 집합 지문(정렬한 종목코드의 짧은 해시). 집합이 바뀌면 연속 일치가 끊긴다.
  function fingerprint(tickers) { var t = tickers.slice().sort().join(','), h = 5381; for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return ('0000000' + h.toString(16)).slice(-8); }
  function kstDate(now) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)); }

  // 공급자 응답에서 확정 종가만 날짜→값으로 뽑는다. 모양이 어긋나면 null(대조 안 함).
  function closes(raw, kind, ticker, today) {
    if (!plain(raw) || raw.source !== SOURCES[kind] || raw.currency !== 'KRW' || !Array.isArray(raw.bars) || raw.bars.length < 1 || raw.bars.length > 400) return null;
    if (kind === 'kis' && raw.symbol !== ticker) return null;
    if (kind === 'yahoo' && [ticker + '.KS', ticker + '.KQ'].indexOf(raw.symbol) < 0) return null;
    var out = Object.create(null);
    for (var i = 0; i < raw.bars.length; i++) {
      var b = raw.bars[i];
      if (!plain(b) || !validDate(b.d) || !validPrice(b.c)) return null;
      if (b.d >= today || b.finality === 'provisional' || b.confirmed === false) continue;
      if (Object.prototype.hasOwnProperty.call(out, b.d) && out[b.d] !== b.c) return null;
      out[b.d] = b.c;
    }
    return out;
  }

  function diffPct(a, b) { return Math.abs(a - b) / b * 100; }

  // 같은 날짜 확정 종가 비교. 최근 공통 거래일 WINDOW개까지.
  function compare(yahooRaw, kisRaw, options) {
    var o = options || {}, ticker = o.ticker, today = kstDate(o.now == null ? Date.now() : o.now);
    if (!validTicker(ticker)) return { ok: false, status: 'invalid-ticker' };
    var y = closes(yahooRaw, 'yahoo', ticker, today), k = closes(kisRaw, 'kis', ticker, today);
    if (!k) return { ok: false, status: 'missing-kis' };
    if (!y) return { ok: false, status: 'missing-yahoo' };
    var common = Object.keys(k).filter(function (d) { return Object.prototype.hasOwnProperty.call(y, d); }).sort().reverse().slice(0, WINDOW);
    if (!common.length) return { ok: false, status: 'no-common-date' };
    var rows = common.map(function (d) { var p = diffPct(y[d], k[d]); return { d: d, yahoo: y[d], kis: k[d], diffPct: p, match: p <= TOLERANCE_PCT }; });
    var mismatches = rows.filter(function (r) { return !r.match; }), latest = rows[0];
    var kl = Object.keys(k).sort().pop(), yl = Object.keys(y).sort().pop();
    // 지피 사후 검토 CR-2(순태씨 D2 승인): 두 출처의 최신 확정일이 다르거나(한쪽 지연) 비교한 종가가 오래되면 '일치'로 보지 않는다.
    var stale = latest.d !== kl || latest.d !== yl ? 'source-lag' : dayGap(latest.d, today) > STALE_DAYS ? 'old' : '';
    return {
      ok: true, status: !latest.match ? 'mismatch' : stale ? 'stale' : mismatches.length ? 'partial' : 'match', stale: stale,
      latest: latest, checked: rows.length, matched: rows.length - mismatches.length, mismatches: mismatches.slice(0, 5),
      kisLatest: Object.keys(k).sort().pop(), yahooLatest: Object.keys(y).sort().pop(), kisDates: Object.keys(k).sort()
    };
  }

  // ---- 일별 기록(순수 함수) ----
  function validRow(r) {
    return plain(r) && validDate(r.d) && typeof r.at === 'number' && Number.isFinite(r.at) && Number.isInteger(r.n) && r.n >= 0 && r.n <= 50 &&
      Number.isInteger(r.matched) && r.matched >= 0 && r.matched <= r.n && Array.isArray(r.bad) && r.bad.length <= 50 && r.bad.every(validTicker) &&
      (r.total === undefined || (Number.isInteger(r.total) && r.total >= r.n && r.total <= 500)) && (r.fp === undefined || (typeof r.fp === 'string' && /^[0-9a-f]{8}$/.test(r.fp)));
  }
  function parseLog(text) {
    if (text == null) return { v: 1, autoDay: '', rows: [] };
    try { var o = JSON.parse(text); if (plain(o) && o.v === 1 && typeof o.autoDay === 'string' && Array.isArray(o.rows) && o.rows.length <= LOG_MAX && o.rows.every(validRow)) return o; } catch (e) {}
    return null;
  }
  // 이번 대조를 '가장 최근 확정 거래일' 한 줄로 요약. 그날 종가가 두 출처 모두 있고 같아야 일치.
  // total = 보유 국내 종목 전체 수(15개 제한 등으로 일부만 대조하면 n < total), fp = 대조 종목 집합 지문.
  function recordFrom(results, at, total) {
    var d = '';
    results.forEach(function (x) { if (x.r && x.r.ok && x.r.latest.d > d) d = x.r.latest.d; });
    if (!d) return null;
    var bad = [], matched = 0;
    results.forEach(function (x) { if (x.r && x.r.ok && x.r.latest.d === d && x.r.latest.match && x.r.status !== 'stale') matched++; else bad.push(x.ticker); });
    var n = results.length, tot = Number.isInteger(total) && total >= n ? total : n;
    return { d: d, at: at, n: n, matched: matched, bad: bad.slice(0, 50), total: tot, fp: fingerprint(results.map(function (x) { return x.ticker; })) };
  }
  function mergeLog(log, rec, autoDay) {
    var rows = log.rows.filter(function (r) { return r.d !== rec.d; }).concat([rec]).sort(function (a, b) { return a.d < b.d ? -1 : 1; }).slice(-LOG_MAX);
    return { v: 1, autoDay: autoDay || log.autoDay, rows: rows };
  }
  // 연속 일치(지피 CR-3, 순태씨 D3 승인): KIS가 준 거래일(주말 제외)을 최근부터 거꾸로 따라가며 센다.
  // 가장 최근 거래일 기록이 없으면 0, 빠진 거래일·일부만 대조한 날·종목 집합이 바뀐 날·지문 없는 옛 기록(11-25 이전)에서 끊긴다.
  function countable(r) { return !!r && typeof r.fp === 'string' && r.total === r.n && r.n > 0 && r.matched === r.n; }
  function streak(log, tradingDays) {
    var byD = Object.create(null); log.rows.forEach(function (r) { byD[r.d] = r; });
    var days = (tradingDays || []).filter(function (d) { return validDate(d) && weekday(d); }).sort().reverse(), n = 0, fp = null;
    for (var i = 0; i < days.length; i++) {
      var r = byD[days[i]];
      if (!countable(r)) break;
      if (fp === null) fp = r.fp; else if (r.fp !== fp) break;
      n++;
    }
    return n;
  }
  // 가격 신뢰도 띠 문구(순수 함수). 신선도는 조회 시각이 아니라 비교한 종가 날짜(row.d)로 판정한다.
  function trustSummary(row, now, hasUS) {
    if (!row || !(row.n > 0)) return null;
    var us = hasUS ? ' · 미국 가격은 미검증' : '', gap = dayGap(row.d, kstDate(now == null ? Date.now() : now));
    if (!(gap >= 0) || gap > STALE_DAYS) return { text: '국내 KIS 대조 기준 종가가 오래됨(' + row.d + ') — 펼쳐서 다시 대조' + us, sev: 'warn' };
    if (row.matched !== row.n) return { text: '⚠️ 국내 KIS 대조 불일치·미검증 ' + (row.n - row.matched) + '건' + (row.bad && row.bad.length ? '(' + row.bad.slice(0, 3).join(', ') + ')' : '') + ' — 펼쳐서 확인' + us, sev: 'warn' };
    if (row.total === undefined) return { text: '국내 KIS 대조 일치 ' + row.matched + '/' + row.n + ' (' + row.d + ' 종가 · 대조 범위 미기록)' + us, sev: 'info' };
    if (row.total > row.n) return { text: '⚠️ 국내 KIS 대조는 일부만: 보유 ' + row.total + '종목 중 ' + row.n + '종목 일치 (' + row.d + ' 종가)' + us, sev: 'warn' };
    return { text: '✅ 국내 가격 KIS 대조 일치 (' + row.matched + '/' + row.n + ', ' + row.d + ' 종가)' + us, sev: hasUS ? 'info' : 'ok' };
  }

  // ---- 화면(브라우저 전용) ----
  var W = typeof window !== 'undefined' ? window : null, state = { busy: false, error: '', results: null, at: 0, names: {}, days: [], logNote: '' }, mounts = [], cbSeq = 0;
  function readLog() { try { return parseLog(W.localStorage.getItem(LOG_KEY)); } catch (e) { return null; } }
  function writeLog(log) { try { W.localStorage.setItem(LOG_KEY, JSON.stringify(log)); return true; } catch (e) { return false; } }

  function holdings() {
    var list = [], seen = {}, names = {};
    ['domStocks', 'penStocks', 'genStocks'].forEach(function (k) {
      var arr = W && Array.isArray(W[k]) ? W[k] : [];
      arr.forEach(function (s) {
        if (!s || !validTicker(s.ticker) || !(s.quantity > 0) || seen[s.ticker]) return;
        seen[s.ticker] = true; list.push(s.ticker); names[s.ticker] = typeof s.name === 'string' && s.name ? s.name : s.ticker;
      });
    });
    return { tickers: list, names: names };
  }
  function endpoint() {
    var u = new URL(W && typeof W.gasUrl === 'string' ? W.gasUrl : '');
    if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || u.port || u.username || u.password || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)) throw Error('gas-url');
    u.search = ''; u.hash = ''; return u;
  }
  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      var u; try { u = endpoint(); } catch (e) { reject(e); return; }
      var cb = 'hasKisCross_' + (++cbSeq), script = document.createElement('script'), done = false, timer;
      function finish(err, data) { if (done) return; done = true; clearTimeout(timer); script.onerror = null; script.remove(); try { delete W[cb]; } catch (e) { W[cb] = undefined; } if (err) reject(err); else resolve(data); }
      W[cb] = function (data) { finish(null, data); };
      Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
      u.searchParams.set('callback', cb); script.referrerPolicy = 'no-referrer'; script.src = u.href;
      script.onerror = function () { finish(Error('gas-failed')); };
      timer = setTimeout(function () { finish(Error('gas-timeout')); }, 20000);
      try { document.head.appendChild(script); } catch (e) { finish(e); }
    });
  }
  function chunks(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
  var KIS_ERRORS = { 'kis-not-configured': 'GAS에 KIS 키가 설정되지 않았습니다', 'kis-token': 'KIS 접근 토큰 발급 실패', 'kis-budget': '오늘 KIS 호출 한도(150회)에 도달했습니다', 'bad-request': 'KIS 요청 형식 오류', 'kis-failed': 'KIS 중계 오류' };

  function run(auto) {
    if (state.busy || !W) return;
    if (auto === true) { var td = kstDate(Date.now()); if (!state.autoTry || state.autoTry.day !== td) state.autoTry = { day: td, n: 0, at: 0 }; state.autoTry.n++; state.autoTry.at = Date.now(); }
    if (auto !== true && state.results && Date.now() - state.at < MIN_GAP_MS) { state.error = 'KIS 호출 한도를 아끼려고 10분 안에는 다시 조회하지 않습니다.'; renderAll(); return; }
    var h = holdings(), list = h.tickers.slice(0, MAX_TICKERS);
    try { endpoint(); } catch (e) { state.error = '설정 탭의 GAS 주소를 먼저 확인해 주세요.'; renderAll(); return; }
    if (!list.length) { state.error = '대조할 국내 보유 종목이 없습니다.'; renderAll(); return; }
    state.busy = true; state.error = h.tickers.length > MAX_TICKERS ? '국내 종목이 많아 앞의 ' + MAX_TICKERS + '개만 대조합니다.' : ''; state.names = h.names; renderAll();
    var yahoo = {}, kis = {}, kisError = '';
    var seq = Promise.resolve();
    chunks(list, HISTORY_CHUNK).forEach(function (c) { seq = seq.then(function () { return jsonp({ type: 'history', tickers: c.join(','), market: 'KR' }).then(function (d) { if (plain(d)) c.forEach(function (t) { yahoo[t] = d[t]; }); }, function () {}); }); });
    chunks(list, KIS_CHUNK).forEach(function (c) { seq = seq.then(function () { if (kisError) return; return jsonp({ type: 'kis', tickers: c.join(',') }).then(function (d) { if (plain(d) && typeof d.error === 'string') { kisError = KIS_ERRORS[d.error] || 'KIS 오류'; return; } if (plain(d)) c.forEach(function (t) { kis[t] = d[t]; }); }, function () { kisError = 'GAS 응답 실패'; }); }); });
    seq.then(function () {
      var now = Date.now();
      state.results = list.map(function (t) { return { ticker: t, r: compare(yahoo[t], kis[t], { ticker: t, now: now }) }; });
      state.at = now; if (kisError) state.error = (state.error ? state.error + ' ' : '') + kisError + ' · 받은 종목만 표시합니다.';
      var days = {}; state.results.forEach(function (x) { (x.r.kisDates || []).forEach(function (d) { days[d] = true; }); }); state.days = Object.keys(days);
      var log = readLog(), rec = recordFrom(state.results, now, h.tickers.length);
      state.logNote = '';
      if (!log) state.logNote = '일별 기록이 손상되어 새로 쓰지 않았습니다.';
      else if (rec && !kisError) {
        state.logNote = writeLog(mergeLog(log, rec, kstDate(now))) ? (rec.total > rec.n ? '이번 기록은 보유 ' + rec.total + '종목 중 ' + rec.n + '종목만 대조해 연속 일치에 세지 않습니다.' : rec.matched < rec.n ? '이번 기록은 일부 종목이 불일치·미검증이라 연속 일치가 끊깁니다.' : '') : '일별 기록을 저장하지 못했습니다.';
        if (W.HASPriceTrustUI && W.HASPriceTrustUI.refresh) setTimeout(function () { try { W.HASPriceTrustUI.refresh(); } catch (e) {} }, 0);
      }
      else if (auto === true) state.logNote = '오늘 자동 대조 실패(' + state.autoTry.n + '/' + AUTO_MAX + '회)' + (state.autoTry.n < AUTO_MAX ? ' — 10분 뒤 앱을 다시 열면 한 번 더 시도합니다.' : ' — 오늘 자동 시도는 끝났습니다. 버튼으로 대조해 주세요.');
    }).catch(function () { state.error = '대조 중 오류가 났습니다.'; }).then(function () { state.busy = false; renderAll(); });
  }

  function node(tag, text, css) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; return e; }
  function won(x) { return Math.round(x).toLocaleString('ko-KR') + '원'; }
  function md(d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)); }
  var STATUS = {
    match: ['✅ 일치', '#1b5e20'], partial: ['⚠ 최근 일치 · 과거 일부 차이', '#8a4b00'], mismatch: ['❗ 최근 종가 차이', '#8b2020'],
    stale: ['⏳ 미검증 · 두 출처 최신 종가 날짜가 다르거나 오래됨', '#8a4b00'], 'missing-kis': ['KIS 자료 없음', '#333'], 'missing-yahoo': ['Yahoo 자료 없음', '#333'], 'no-common-date': ['같은 날짜 자료 없음', '#333'], 'invalid-ticker': ['대조 불가 종목', '#333']
  };
  function render(box) {
    box.replaceChildren();
    var wrap = node('div', null, 'margin-top:8px;padding-top:8px;border-top:1px solid #c9d3e0;font-size:13px;color:#333;line-height:1.6');
    wrap.setAttribute('data-testid', 'kis-crosscheck');
    wrap.appendChild(node('strong', '🇰🇷 국내 종가 두 출처 대조 (Yahoo · KIS)'));
    wrap.appendChild(node('div', '오늘을 뺀 확정 종가만 같은 날짜끼리 비교 · 허용 차이 0.5% · 가격·신호·투자 기록은 바꾸지 않습니다.'));
    var b = node('button', state.busy ? '대조 중…' : '국내 종목 KIS 대조', 'min-height:44px;margin:6px 0;padding:0 14px;font-size:14px');
    b.type = 'button'; b.disabled = state.busy; b.addEventListener('click', run); wrap.appendChild(b);
    if (state.error) { var s = node('div', state.error, 'color:#8b2020'); s.setAttribute('role', 'status'); wrap.appendChild(s); }
    var log = readLog();
    if (log && log.rows.length) {
      var last = log.rows[log.rows.length - 1], st2 = state.days.length ? streak(log, state.days) : null;
      wrap.appendChild(node('div', '📒 일별 기록: ' + log.rows.length + '거래일 · 최근 ' + md(last.d) + ' ' + last.matched + '/' + last.n + ' 일치' + (st2 == null ? '' : ' · 연속 전 종목 일치 ' + st2 + '거래일 (목표 ' + GOAL + ' · 11/25 새 기준 이후 기록만 셈)'), 'font-weight:700;margin-top:4px'));
      if (last.bad.length) wrap.appendChild(node('div', '최근 기록에서 일치하지 않거나 자료 없는 종목: ' + last.bad.map(function (t) { return state.names[t] || t; }).join(', '), 'color:#8b2020'));
    }
    else if (log) wrap.appendChild(node('div', '📒 일별 기록: 아직 없음 · 오늘 첫 자동 대조가 끝나면 생깁니다(앱을 켜 두고 20초쯤 기다려 주세요).', 'margin-top:4px'));
    if (state.logNote) wrap.appendChild(node('div', state.logNote, 'color:#8b2020'));
    if (state.results) {
      var ok = state.results.filter(function (x) { return x.r.ok && x.r.status === 'match'; }).length;
      wrap.appendChild(node('div', '결과: ' + state.results.length + '종목 중 ' + ok + '종목 일치 · 조회 ' + new Date(state.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), 'font-weight:700'));
      state.results.forEach(function (x) {
        var r = x.r, st = STATUS[r.status] || ['확인 불가', '#333'], item = node('div', null, 'padding:4px 0;border-bottom:1px solid #e3e8ef');
        item.appendChild(node('div', (state.names[x.ticker] || x.ticker) + ' (' + x.ticker + ') · ' + st[0], 'color:' + st[1] + ';font-weight:700'));
        if (r.ok) {
          item.appendChild(node('div', md(r.latest.d) + ' 종가 Yahoo ' + won(r.latest.yahoo) + ' / KIS ' + won(r.latest.kis) + (r.latest.diffPct ? ' · 차이 ' + r.latest.diffPct.toFixed(2) + '%' : '')));
          item.appendChild(node('div', '최근 ' + r.checked + '거래일 중 ' + r.matched + '일 일치' + (r.mismatches.length ? ' · 차이 난 날: ' + r.mismatches.map(function (m) { return md(m.d) + '(' + m.diffPct.toFixed(1) + '%)'; }).join(', ') : '')));
        }
        wrap.appendChild(item);
      });
      wrap.appendChild(node('div', '일치해도 매수·매도 신호의 판단 보류는 그대로입니다. 앱을 연 날마다 한 번 자동 대조해 직전 거래일 결과를 이 기기에 기록하며(백업에 포함, 복원하면 이 기록도 되살아남), 연속 ' + GOAL + '거래일 전 종목 일치가 쌓이면 보류 해제를 검토합니다. 차이가 나면 분할·배당 조정 차이일 수 있으니 증권사 앱 값을 확인해 주세요.'));
    }
    box.appendChild(wrap);
  }
  function renderAll() { mounts = mounts.filter(function (m) { return m.isConnected; }); mounts.forEach(render); }
  // 하루 첫 자동 대조. 앱을 새로 열 때뿐 아니라 백그라운드에서 다시 켤 때도 확인한다.
  // 보유종목·GAS 주소가 아직 준비되지 않았으면 잠시 뒤 다시 시도(최대 5회).
  var autoTimer = null, autoTries = 0;
  function autoOnce() {
    autoTimer = null;
    if (!W || state.busy || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    var log = readLog(), today = kstDate(Date.now());
    if (!log || log.autoDay === today) return;
    // 실패하면 같은 날 최대 AUTO_MAX회, 10분 간격으로만 다시 시도(KIS 호출 한도 150회 보호: 1회 최대 3번 호출).
    if (state.autoTry && state.autoTry.day === today && (state.autoTry.n >= AUTO_MAX || Date.now() - state.autoTry.at < MIN_GAP_MS)) return;
    var ready = true; try { endpoint(); } catch (e) { ready = false; }
    if (!ready || !holdings().tickers.length) { if (++autoTries <= 5) schedule(10000); return; }
    state.logNote = '오늘 자동 대조 중…'; renderAll();
    run(true);
  }
  function schedule(ms) { if (autoTimer) clearTimeout(autoTimer); autoTimer = setTimeout(autoOnce, ms); }
  if (W && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () { schedule(5000); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { autoTries = 0; schedule(3000); } });
  }
  function mount(container) { if (!container) return; mounts = mounts.filter(function (m) { return m !== container && m.isConnected; }); mounts.push(container); render(container); }

  // 가장 최근 대조 기록(가격 신뢰도 띠 문구용, 읽기 전용).
  function latestRow() { var l = readLog(); return l && l.rows.length ? l.rows[l.rows.length - 1] : null; }
  return { latestRow: latestRow, trustSummary: trustSummary, fingerprint: fingerprint, STALE_DAYS: STALE_DAYS, AUTO_MAX: AUTO_MAX, autoState: function () { return state.autoTry || null; }, TOLERANCE_PCT: TOLERANCE_PCT, WINDOW: WINDOW, LOG_KEY: LOG_KEY, compare: compare, closes: closes, parseLog: parseLog, recordFrom: recordFrom, mergeLog: mergeLog, streak: streak, mount: mount, run: run };
});
