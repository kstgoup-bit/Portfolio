/* HAS: 클로 추천 성적표. reviews/index.json에 적힌 과거 검토 카드(고치지 않는 기록)를 읽고,
 * 설정된 GAS의 일봉 이력(type=history)으로 검토일 종가 대비 지금까지 수익률과 지수(국내 069500·미국 QQQ) 대비 초과수익을 계산한다.
 * 버튼을 누를 때만 조회. 결과는 메모리에만 두고 저장소·투자기록·신호를 바꾸지 않는다. 배당·분할 조정 미검증 원주가 기준. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASScorecard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY = 86400000, BENCH = { KR: '069500', US: 'QQQ' };
  var LABEL = { 'buy-review': '매수 검토', 'add-review': '추가 매수 검토', 'trim-review': '비중 축소 검토', 'sell-review': '매도 검토', 'hold-long': '장기보유', 'wait': '관망' };
  // 맞힘 기준: 사라고 한 것은 지수보다 잘 갔는지, 줄이라고 한 것은 지수보다 못 갔는지. 관망은 채점하지 않는다.
  var SIDE = { 'buy-review': 1, 'add-review': 1, 'hold-long': 1, 'trim-review': -1, 'sell-review': -1 };
  function kstDate(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 10); }
  // 기준 종가일: 검토 시각에 이미 확정된 마지막 종가(KR 15:30 KST, US 16:00 뉴욕(한국 다음 날 06:00, 서머타임 05:00)). 검토 뒤에 나온 종가를 기준으로 쓰지 않는다.
  function baseDate(market, ms) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: market === 'US' ? 'America/New_York' : 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)), v = {};
    p.forEach(function (x) { v[x.type] = x.value; });
    var d = v.year + '-' + v.month + '-' + v.day, hm = Number(v.hour) * 60 + Number(v.minute), closeAt = market === 'US' ? 960 : 930;
    if (hm < closeAt) d = new Date(Date.parse(d + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
    return d;
  }
  function closeOnOrBefore(bars, d) { var hit = null; for (var i = 0; i < bars.length; i++) { if (bars[i].d <= d) hit = bars[i]; else break; } return hit; }
  function cleanBars(raw) {
    if (!raw || !Array.isArray(raw.bars)) return null;
    var out = raw.bars.filter(function (b) { return b && typeof b.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.d) && typeof b.c === 'number' && isFinite(b.c) && b.c > 0; }).map(function (b) { return { d: b.d, c: b.c }; });
    out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }); return out.length ? out : null;
  }
  // entries: [{ticker, market, name, verdict, reviewedAt}], series: {'KR:005930': bars, ...}
  function score(entries, series, now) {
    var today = kstDate(now);
    var rows = entries.map(function (e) {
      var base = baseDate(e.market, Date.parse(e.reviewedAt)), bars = series[e.market + ':' + e.ticker], bb = series[e.market + ':' + BENCH[e.market]];
      var r = { ticker: e.ticker, name: e.name, market: e.market, verdict: e.verdict, baseDate: base, days: Math.floor((Date.parse(today) - Date.parse(base)) / DAY), status: 'no-data' };
      if (!bars) return r;
      var b0 = closeOnOrBefore(bars, base), b1 = bars[bars.length - 1];
      if (!b0 || !b1 || b1.d <= b0.d) { r.status = b0 ? 'too-early' : 'no-data'; return r; }
      r.base = b0.c; r.last = b1.c; r.lastDate = b1.d; r.ret = (b1.c / b0.c - 1) * 100; r.status = 'ok';
      if (bb) { var x0 = closeOnOrBefore(bb, base), x1 = closeOnOrBefore(bb, b1.d); if (x0 && x1 && x1.d > x0.d) { r.benchRet = (x1.c / x0.c - 1) * 100; r.excess = r.ret - r.benchRet; } }
      var side = SIDE[e.verdict]; if (side && isFinite(r.excess)) r.hit = side > 0 ? r.excess > 0 : r.excess < 0;
      return r;
    });
    var groups = {};
    rows.forEach(function (r) { var g = groups[r.verdict] = groups[r.verdict] || { n: 0, scored: 0, hits: 0, sumEx: 0, nEx: 0 }; g.n++; if (typeof r.hit === 'boolean') { g.scored++; if (r.hit) g.hits++; } if (isFinite(r.excess)) { g.sumEx += r.excess; g.nEx++; } });
    return { rows: rows, groups: groups };
  }
  // ---- 화면 ----
  var W = typeof window !== 'undefined' ? window : null, state = { busy: false, error: '', result: null, at: 0 }, cb = 0;
  function endpoint() { var u = new URL(W && typeof W.gasUrl === 'string' ? W.gasUrl : ''); if (u.protocol !== 'https:' || u.hostname !== 'script.google.com' || u.port || u.username || u.password || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)) throw Error('gas-url'); u.search = ''; u.hash = ''; return u; }
  function jsonp(params) {
    return new Promise(function (resolve, reject) {
      var u; try { u = endpoint(); } catch (e) { reject(e); return; }
      var name = 'hasScore_' + (++cb), s = document.createElement('script'), done = false, t;
      function fin(err, d) { if (done) return; done = true; clearTimeout(t); s.onerror = null; s.remove(); try { delete W[name]; } catch (e) { W[name] = undefined; } if (err) reject(err); else resolve(d); }
      W[name] = function (d) { fin(null, d); }; Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); }); u.searchParams.set('callback', name);
      s.referrerPolicy = 'no-referrer'; s.src = u.href; s.onerror = function () { fin(Error('gas')); }; t = setTimeout(function () { fin(Error('timeout')); }, 20000);
      try { document.head.appendChild(s); } catch (e) { fin(e); }
    });
  }
  function getJSON(path) { return fetch(path, { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw Error(); return r.json(); }); }
  function loadEntries() {
    return getJSON('./reviews/index.json').then(function (ix) {
      var files = ix && Array.isArray(ix.files) ? ix.files.filter(function (f) { return /^[a-z0-9-]+\.json$/.test(f); }).slice(0, 60) : [];
      return Promise.all(files.map(function (f) { return getJSON('./reviews/' + f).catch(function () { return null; }); }));
    }).then(function (docs) {
      var out = [], V = W.HASReviewCards;
      docs.forEach(function (d) { var v = V && V.validate(d); if (!v) return; v.cards.forEach(function (c) { out.push({ ticker: c.ticker, market: c.market, name: c.name, verdict: c.verdict, reviewedAt: v.reviewedAt }); }); });
      return out;
    });
  }
  function run() {
    if (state.busy) return; state.busy = true; state.error = ''; render();
    var entries;
    loadEntries().then(function (e) {
      entries = e; if (!entries.length) throw Error('검토 기록이 없습니다.');
      try { endpoint(); } catch (x) { throw Error('설정 탭의 GAS 주소를 먼저 확인해 주세요.'); }
      var want = { KR: {}, US: {} }; entries.forEach(function (x) { want[x.market][x.ticker] = true; want[x.market][BENCH[x.market]] = true; });
      var series = {}, seq = Promise.resolve();
      ['KR', 'US'].forEach(function (m) { var list = Object.keys(want[m]); for (var i = 0; i < list.length; i += 12) (function (chunk) { seq = seq.then(function () { return jsonp({ type: 'history', tickers: chunk.join(','), market: m }).then(function (d) { chunk.forEach(function (t) { var b = cleanBars(d && d[t]); if (b) series[m + ':' + t] = b; }); }, function () {}); }); })(list.slice(i, i + 12)); });
      return seq.then(function () { return series; });
    }).then(function (series) { state.result = score(entries, series, Date.now()); state.at = Date.now(); })
      .catch(function (e) { state.error = e && e.message && /[가-힣]/.test(e.message) ? e.message : '성적표를 계산하지 못했습니다(인터넷·GAS 확인).'; })
      .then(function () { state.busy = false; render(); });
  }
  function node(tag, text, css) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; return e; }
  function pct(x) { return isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(1) + '%' : '—'; }
  var body = null;
  function render() {
    if (!body || !body.isConnected) return; body.replaceChildren(); body.setAttribute('data-testid', 'scorecard');
    body.style.cssText = 'color:#333;font-size:15px;line-height:1.6;overflow-wrap:anywhere';
    body.appendChild(node('h3', '📊 클로 추천 성적표', 'margin:4px 0 8px'));
    body.appendChild(node('p', '검토일 종가 대비 지금까지의 수익률을 같은 기간 지수(국내 KODEX 200·미국 QQQ)와 비교합니다. 매수·장기보유는 지수보다 잘 가면, 비중 축소·매도는 지수보다 못 가면 맞힘입니다. 관망은 채점하지 않습니다. 1개월·3개월이 지나야 의미 있는 성적입니다.', 'font-size:14px'));
    var b = node('button', state.busy ? '계산 중…' : (state.result ? '다시 계산' : '성적 계산하기'), 'min-height:44px;padding:0 16px;font-size:15px;margin:4px 0'); b.type = 'button'; b.disabled = state.busy; b.addEventListener('click', run); body.appendChild(b);
    if (state.error) body.appendChild(node('p', state.error, 'color:#8b2020'));
    var R = state.result; if (!R) return;
    var tot = { s: 0, h: 0 }; Object.keys(R.groups).forEach(function (k) { tot.s += R.groups[k].scored; tot.h += R.groups[k].hits; });
    body.appendChild(node('p', '전체 맞힘 ' + tot.h + ' / ' + tot.s + (tot.s ? ' (' + Math.round(tot.h / tot.s * 100) + '%)' : '') + ' · 계산 ' + new Date(state.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), 'font-weight:800;font-size:16px'));
    Object.keys(LABEL).forEach(function (k) { var g = R.groups[k]; if (!g) return; body.appendChild(node('div', LABEL[k] + ' ' + g.n + '건 · 지수 대비 평균 ' + pct(g.nEx ? g.sumEx / g.nEx : NaN) + (SIDE[k] ? ' · 맞힘 ' + g.hits + '/' + g.scored : ' · 채점 안 함'))); });
    R.rows.slice().sort(function (a, c) { return (c.excess || 0) - (a.excess || 0); }).forEach(function (r) {
      var line = node('div', null, 'border-top:1px solid #d5dbe3;padding:6px 0');
      line.appendChild(node('div', r.name + ' (' + r.ticker + ') · ' + LABEL[r.verdict] + (typeof r.hit === 'boolean' ? (r.hit ? ' · ✅ 맞힘' : ' · ❌ 틀림') : ''), 'font-weight:700;color:' + (r.hit === true ? '#1b5e20' : r.hit === false ? '#8b2020' : '#333')));
      line.appendChild(node('div', r.status === 'ok' ? (r.baseDate + ' 이후 ' + r.days + '일 · 수익 ' + pct(r.ret) + ' · 지수 ' + pct(r.benchRet) + ' · 초과 ' + pct(r.excess)) : r.status === 'too-early' ? r.baseDate + ' 검토 · 아직 새 종가 없음' : '가격 이력 없음'));
      body.appendChild(line);
    });
    body.appendChild(node('p', '원주가 기준(배당·분할 조정 미검증)이며 과거 성적이 미래 수익을 보장하지 않습니다.', 'font-size:14px;margin-top:8px'));
  }
  function open() {
    if (typeof document === 'undefined') return; var old = document.getElementById('hasScorecard'); if (old) old.remove();
    var bg = node('div', null, 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:12px'); bg.id = 'hasScorecard';
    var panel = node('section', null, 'background:#fff;border-radius:16px;padding:16px;width:100%;max-width:520px;max-height:90vh;overflow:auto;box-sizing:border-box'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    body = node('div'); panel.appendChild(body); render();
    var foot = node('div', null, 'position:sticky;bottom:-16px;margin:0 -16px -16px;padding:10px 16px 16px;background:#fff;border-top:1px solid #ddd');
    var c = node('button', '닫기', 'width:100%;min-height:44px;font-size:15px'); c.type = 'button'; c.addEventListener('click', function () { bg.remove(); }); foot.appendChild(c); panel.appendChild(foot);
    bg.addEventListener('click', function (e) { if (e.target === bg) bg.remove(); }); bg.appendChild(panel); document.body.appendChild(bg);
    if (!state.result && !state.busy) run();
  }
  return { score: score, baseDate: baseDate, closeOnOrBefore: closeOnOrBefore, cleanBars: cleanBars, open: open, LABEL: LABEL };
});
