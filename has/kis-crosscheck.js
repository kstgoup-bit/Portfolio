/* HAS: 국내 보유 종목 확정 종가를 두 공급자(Yahoo 이력 · KIS 일봉)로 대조해 보여주기만 한다.
 * 같은 사용자 GAS를 거치지만 GAS는 전달수단일 뿐이고, 원천 공급자는 Yahoo와 KIS로 서로 다르다.
 * 표시 전용: 평가가격·신호·저장소(localStorage)·백업을 바꾸지 않는다. 결과는 메모리에만 두고 앱을 다시 열면 사라진다.
 * 오늘(한국 날짜) 막대는 확정 종가가 아니므로 비교하지 않는다. 주문·계좌 경로 없음. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASKISCrossCheck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TOLERANCE_PCT = 0.5, WINDOW = 20, MAX_TICKERS = 15, KIS_CHUNK = 5, HISTORY_CHUNK = 12, MIN_GAP_MS = 600000;
  var SOURCES = { yahoo: 'yahoo-chart-v8', kis: 'kis-daily' };

  function plain(o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === Object.prototype || p === null; }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function validPrice(x) { return typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 1e8; }
  function validTicker(t) { return typeof t === 'string' && /^[0-9][0-9A-Z]{5}$/.test(t); }
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
    return {
      ok: true, status: !latest.match ? 'mismatch' : mismatches.length ? 'partial' : 'match',
      latest: latest, checked: rows.length, matched: rows.length - mismatches.length, mismatches: mismatches.slice(0, 5),
      kisLatest: Object.keys(k).sort().pop(), yahooLatest: Object.keys(y).sort().pop()
    };
  }

  // ---- 화면(브라우저 전용) ----
  var W = typeof window !== 'undefined' ? window : null, state = { busy: false, error: '', results: null, at: 0, names: {} }, mounts = [], cbSeq = 0;

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

  function run() {
    if (state.busy || !W) return;
    if (state.results && Date.now() - state.at < MIN_GAP_MS) { state.error = 'KIS 호출 한도를 아끼려고 10분 안에는 다시 조회하지 않습니다.'; renderAll(); return; }
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
    }).catch(function () { state.error = '대조 중 오류가 났습니다.'; }).then(function () { state.busy = false; renderAll(); });
  }

  function node(tag, text, css) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; return e; }
  function won(x) { return Math.round(x).toLocaleString('ko-KR') + '원'; }
  function md(d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)); }
  var STATUS = {
    match: ['✅ 일치', '#1b5e20'], partial: ['⚠ 최근 일치 · 과거 일부 차이', '#8a4b00'], mismatch: ['❗ 최근 종가 차이', '#8b2020'],
    'missing-kis': ['KIS 자료 없음', '#333'], 'missing-yahoo': ['Yahoo 자료 없음', '#333'], 'no-common-date': ['같은 날짜 자료 없음', '#333'], 'invalid-ticker': ['대조 불가 종목', '#333']
  };
  function render(box) {
    box.replaceChildren();
    var wrap = node('div', null, 'margin-top:8px;padding-top:8px;border-top:1px solid #c9d3e0;font-size:13px;color:#333;line-height:1.6');
    wrap.setAttribute('data-testid', 'kis-crosscheck');
    wrap.appendChild(node('strong', '🇰🇷 국내 종가 두 출처 대조 (Yahoo · KIS)'));
    wrap.appendChild(node('div', '오늘을 뺀 확정 종가만 같은 날짜끼리 비교 · 허용 차이 0.5% · 표시만 하며 가격·신호·기록은 바꾸지 않습니다.'));
    var b = node('button', state.busy ? '대조 중…' : '국내 종목 KIS 대조', 'min-height:44px;margin:6px 0;padding:0 14px;font-size:14px');
    b.type = 'button'; b.disabled = state.busy; b.addEventListener('click', run); wrap.appendChild(b);
    if (state.error) { var s = node('div', state.error, 'color:#8b2020'); s.setAttribute('role', 'status'); wrap.appendChild(s); }
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
      wrap.appendChild(node('div', '일치해도 매수·매도 신호의 판단 보류는 그대로입니다(공식 휴장 달력·20거래일 관측 기록 전). 차이가 나면 분할·배당 조정 차이일 수 있으니 증권사 앱 값을 확인해 주세요.'));
    }
    box.appendChild(wrap);
  }
  function renderAll() { mounts = mounts.filter(function (m) { return m.isConnected; }); mounts.forEach(render); }
  function mount(container) { if (!container) return; mounts = mounts.filter(function (m) { return m !== container && m.isConnected; }); mounts.push(container); render(container); }

  return { TOLERANCE_PCT: TOLERANCE_PCT, WINDOW: WINDOW, compare: compare, closes: closes, mount: mount, run: run };
});
