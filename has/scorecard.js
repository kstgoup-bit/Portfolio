/* HAS: 클로 추천 성적표. reviews/index.json에 적힌 과거 검토 카드(고치지 않는 기록)를 읽고,
 * 설정된 GAS의 일봉 이력(type=history)으로 검토일 종가 대비 지금까지 수익률과 지수(국내 069500·미국 QQQ) 대비 초과수익을 계산한다.
 * 버튼을 누를 때만 조회. 성적은 메모리에만 두고 투자기록·신호를 바꾸지 않는다. 배당·분할 조정 미검증 원주가 기준.
 * '내 실전 검증': 순태씨가 추천을 소액으로 실제 사 본 기록만 별도 키(has_trialTrades_v1)에 저장(기존 투자기록·백업과 분리). */
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
  // ---- 내 실전 검증(순수 함수) ----
  var TRIAL_KEY = 'has_trialTrades_v1';
  function validTicker(t, m) { return typeof t === 'string' && (m === 'KR' ? /^[0-9][0-9A-Z]{5}$/.test(t) : m === 'US' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)); }
  function validTrade(x) {
    return x && typeof x.id === 'string' && x.id.length <= 40 && (x.market === 'KR' || x.market === 'US') && validTicker(x.ticker, x.market) &&
      typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && isFinite(x.qty) && x.qty > 0 && x.qty < 1e9 && isFinite(x.price) && x.price > 0 && x.price < 1e12 &&
      (x.kind == null || x.kind === 'exception') &&
      (x.sellDate == null || (/^\d{4}-\d{2}-\d{2}$/.test(x.sellDate) && x.sellDate >= x.date && isFinite(x.sellPrice) && x.sellPrice > 0));
  }
  function parseTrades(text) { if (text == null) return []; try { var a = JSON.parse(text); if (Array.isArray(a) && a.length <= 500 && a.every(validTrade)) return a; } catch (e) {} return null; }
  // 매도 기록: 전량이면 그 기록에 매도일·가격을 붙이고, 일부면 판 수량만큼 새 기록으로 나눈다(원래 산 날짜·가격 유지).
  function applySell(trades, id, sell, newId) {
    var i = trades.findIndex(function (t) { return t.id === id; }); if (i < 0) return { error: '기록을 찾지 못했습니다.' };
    var t = trades[i], q = Number(sell.qty), pr = Number(sell.price);
    if (t.sellDate) return { error: '이미 매도한 기록입니다.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sell.date || '') || sell.date < t.date) return { error: '매도 날짜는 산 날짜 이후여야 합니다.' };
    if (!(q > 0) || q > t.qty + 1e-9) return { error: '매도 수량은 보유 수량(' + t.qty + ') 이하로 입력해 주세요.' };
    if (!(pr > 0) || !isFinite(pr)) return { error: '매도 가격을 확인해 주세요.' };
    var out = trades.slice();
    if (Math.abs(q - t.qty) < 1e-9) out[i] = Object.assign({}, t, { sellDate: sell.date, sellPrice: pr });
    else { out[i] = Object.assign({}, t, { qty: +(t.qty - q).toFixed(8) }); out.splice(i + 1, 0, Object.assign({}, t, { id: newId, qty: q, sellDate: sell.date, sellPrice: pr })); }
    return out.every(validTrade) ? { trades: out } : { error: '매도 기록 형식 오류' };
  }
  // trades의 수익률(매도했으면 매도가, 아니면 최근 종가)과 같은 기간 지수 대비 초과수익. 클로 카드가 있으면 그 판단을 붙인다.
  function trialScore(trades, series, cards) {
    var byT = {}; (cards || []).forEach(function (c) { byT[c.market + ':' + c.ticker] = c; });
    var tot = { KR: { cost: 0, val: 0 }, US: { cost: 0, val: 0 } }, ex = [];
    var rows = trades.map(function (t) {
      var bars = series[t.market + ':' + t.ticker], bb = series[t.market + ':' + BENCH[t.market]], r = { trade: t, card: byT[t.market + ':' + t.ticker] || null };
      var endD = t.sellDate || (bars && bars.length ? bars[bars.length - 1].d : null), last = t.sellDate ? t.sellPrice : (bars && bars.length ? bars[bars.length - 1].c : null);
      if (!last) return r;
      r.last = last; r.endDate = endD; r.ret = (last / t.price - 1) * 100;
      tot[t.market].cost += t.price * t.qty; tot[t.market].val += last * t.qty;
      if (bb) { var x0 = closeOnOrBefore(bb, t.date), x1 = closeOnOrBefore(bb, endD); if (x0 && x1 && x1.d > x0.d) { r.benchRet = (x1.c / x0.c - 1) * 100; r.excess = r.ret - r.benchRet; ex.push(r.excess); } }
      return r;
    });
    var realized = { KR: 0, US: 0 }; rows.forEach(function (r) { if (r.trade.sellDate) realized[r.trade.market] += (r.trade.sellPrice - r.trade.price) * r.trade.qty; });
    // 예외 정찰(하락 추세 중 1순위 5%)과 일반 매수의 평균 수익률을 따로 본다 — 예외 규칙을 계속 쓸지 판단하는 근거.
    var grp = { exception: [], normal: [] }; rows.forEach(function (r) { if (isFinite(r.ret)) grp[r.trade.kind === 'exception' ? 'exception' : 'normal'].push(r.ret); });
    function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : NaN; }
    return { byKind: { exception: { n: grp.exception.length, avg: avg(grp.exception) }, normal: { n: grp.normal.length, avg: avg(grp.normal) } }, realized: realized, rows: rows, total: tot, avgExcess: ex.length ? ex.reduce(function (a, b) { return a + b; }, 0) / ex.length : NaN };
  }
  // ---- 화면 ----
  var W = typeof window !== 'undefined' ? window : null, state = { busy: false, error: '', result: null, at: 0, trial: null, cards: [], series: {}, formMsg: '' }, cb = 0;
  function readTrades() { try { return parseTrades(W.localStorage.getItem(TRIAL_KEY)); } catch (e) { return null; } }
  function writeTrades(a) { try { W.localStorage.setItem(TRIAL_KEY, JSON.stringify(a)); return W.localStorage.getItem(TRIAL_KEY) === JSON.stringify(a); } catch (e) { return false; } }
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
      (readTrades() || []).forEach(function (t) { want[t.market][t.ticker] = true; want[t.market][BENCH[t.market]] = true; });
      var series = {}, seq = Promise.resolve();
      ['KR', 'US'].forEach(function (m) { var list = Object.keys(want[m]); for (var i = 0; i < list.length; i += 12) (function (chunk) { seq = seq.then(function () { return jsonp({ type: 'history', tickers: chunk.join(','), market: m }).then(function (d) { chunk.forEach(function (t) { var b = cleanBars(d && d[t]); if (b) series[m + ':' + t] = b; }); }, function () {}); }); })(list.slice(i, i + 12)); });
      return seq.then(function () { return series; });
    }).then(function (series) { state.series = series; state.cards = entries; state.result = score(entries, series, Date.now()); state.trial = trialScore(readTrades() || [], series, entries); state.at = Date.now(); })
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
    var R = state.result; if (!R) { body.appendChild(renderTrial()); return; }
    var tot = { s: 0, h: 0 }; Object.keys(R.groups).forEach(function (k) { tot.s += R.groups[k].scored; tot.h += R.groups[k].hits; });
    body.appendChild(node('p', '전체 맞힘 ' + tot.h + ' / ' + tot.s + (tot.s ? ' (' + Math.round(tot.h / tot.s * 100) + '%)' : '') + ' · 계산 ' + new Date(state.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), 'font-weight:800;font-size:16px'));
    Object.keys(LABEL).forEach(function (k) { var g = R.groups[k]; if (!g) return; body.appendChild(node('div', LABEL[k] + ' ' + g.n + '건 · 지수 대비 평균 ' + pct(g.nEx ? g.sumEx / g.nEx : NaN) + (SIDE[k] ? ' · 맞힘 ' + g.hits + '/' + g.scored : ' · 채점 안 함'))); });
    body.appendChild(renderTrial());
    body.appendChild(node('h3', '종목별 클로 성적', 'margin:16px 0 4px;padding-top:12px;border-top:3px solid #4a148c'));
    R.rows.slice().sort(function (a, c) { return (c.excess || 0) - (a.excess || 0); }).forEach(function (r) {
      var line = node('div', null, 'border-top:1px solid #d5dbe3;padding:6px 0');
      line.appendChild(node('div', r.name + ' (' + r.ticker + ') · ' + LABEL[r.verdict] + (typeof r.hit === 'boolean' ? (r.hit ? ' · ✅ 맞힘' : ' · ❌ 틀림') : ''), 'font-weight:700;color:' + (r.hit === true ? '#1b5e20' : r.hit === false ? '#8b2020' : '#333')));
      line.appendChild(node('div', r.status === 'ok' ? (r.baseDate + ' 이후 ' + r.days + '일 · 수익 ' + pct(r.ret) + ' · 지수 ' + pct(r.benchRet) + ' · 초과 ' + pct(r.excess)) : r.status === 'too-early' ? r.baseDate + ' 검토 · 아직 새 종가 없음' : '가격 이력 없음'));
      body.appendChild(line);
    });
    body.appendChild(node('p', '원주가 기준(배당·분할 조정 미검증)이며 과거 성적이 미래 수익을 보장하지 않습니다.', 'font-size:14px;margin-top:8px'));
  }
  function money(x, m) { return m === 'US' ? '$' + x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.round(x).toLocaleString('ko-KR') + '원'; }
  function renderTrial() {
    var box = node('div', null, 'margin-top:16px;padding-top:12px;border-top:3px solid #4a148c'); box.setAttribute('data-testid', 'trial');
    box.appendChild(node('h3', '🧪 내 실전 검증', 'margin:4px 0 8px'));
    box.appendChild(node('p', '클로 추천을 소액으로 실제 사 본 기록입니다. 산 날 이후 수익률과 같은 기간 지수 대비 성과를 계산해 위 성적표와 비교합니다. 이 기록은 이 휴대폰에 저장되고 백업 파일에도 함께 들어갑니다.', 'font-size:14px'));
    var trades = readTrades();
    if (trades === null) { box.appendChild(node('p', '저장된 실전 기록이 손상되어 표시하지 않습니다. 새로 저장하지 않았습니다.', 'color:#8b2020')); return box; }
    // 입력 폼
    var f = node('form', null, 'display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;align-items:end;margin:6px 0'); f.noValidate = true;
    var fld = 'width:100%;box-sizing:border-box;min-height:44px;font-size:15px;padding:6px;border:1px solid #777;border-radius:8px;color:#222';
    function lab(t, el) { var l = node('label', null, 'display:block;font-size:14px;color:#333'); l.appendChild(node('span', t)); l.appendChild(el); return l; }
    var mk = node('select', null, fld); [['KR', '국내'], ['US', '미국']].forEach(function (o) { var op = node('option', o[1]); op.value = o[0]; mk.appendChild(op); });
    var tk = node('input', null, fld); tk.placeholder = '예: 001440, MSFT'; tk.autocapitalize = 'characters';
    var dt = node('input', null, fld); dt.type = 'date'; dt.max = kstDate(Date.now()); dt.value = kstDate(Date.now());
    var qy = node('input', null, fld); qy.inputMode = 'decimal'; qy.placeholder = '수량';
    var pr = node('input', null, fld); pr.inputMode = 'decimal'; pr.placeholder = '1주 매수가';
    var exl = node('label', null, 'grid-column:1 / -1;display:flex;align-items:center;gap:8px;min-height:44px;font-size:15px;color:#222'), exb = node('input'); exb.type = 'checkbox'; exb.style.cssText = 'width:22px;height:22px';
    exl.appendChild(exb); exl.appendChild(node('span', '🔎 예외 정찰 (하락 추세 중 1순위 종목, 계획 금액의 5%·1회)'));
    var dr = state.draft; if (dr) { mk.value = dr.m; tk.value = dr.tk; if (dr.dt) dt.value = dr.dt; qy.value = dr.qy; pr.value = dr.pr; exb.checked = dr.ex; }
    function saveDraft() { state.draft = { m: mk.value, tk: tk.value, dt: dt.value, qy: qy.value, pr: pr.value, ex: exb.checked }; }
    // 미국 종목은 산 날짜 기본값을 뉴욕 날짜로(한국 새벽에 산 주문은 미국 전날 거래) — 지수 비교 기준일이 하루 밀리지 않게.
    function nyDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    function syncDate() { var k = kstDate(Date.now()), n = nyDate(); if (mk.value === 'US' && dt.value === k) dt.value = n; else if (mk.value === 'KR' && dt.value === n && n !== k) dt.value = k; }
    mk.addEventListener('change', syncDate);
    // 종목코드로 시장을 맞춘다: 영문 티커면 미국, 6자리 숫자면 국내(시장 선택을 깜빡해도 기록이 거절되지 않게).
    tk.addEventListener('input', function () { var v = tk.value.trim().toUpperCase(); if (/^[A-Z]/.test(v)) mk.value = 'US'; else if (/^[0-9]{6}$/.test(v)) mk.value = 'KR'; syncDate(); if (state.formMsg) { state.formMsg = ''; msg.textContent = ''; } });
    var add = node('button', '기록 추가', 'min-height:44px;font-size:15px;font-weight:700'); add.type = 'submit';
    [lab('시장', mk), lab('종목코드', tk), lab('산 날짜', dt), lab('수량', qy), lab('1주 가격(국내 원·미국 달러)', pr)].forEach(function (x) { f.appendChild(x); }); f.appendChild(exl); f.appendChild(add);
    var msg = node('p', state.formMsg, 'color:' + (/^✅/.test(state.formMsg) ? '#1b5e20' : '#8b2020') + ';margin:2px 0;font-weight:700'); msg.setAttribute('role', 'status');
    f.addEventListener('submit', function (e) {
      e.preventDefault(); saveDraft(); var tv = tk.value.trim().toUpperCase(); if (/^[A-Z]/.test(tv)) mk.value = 'US'; else if (/^[0-9]{6}$/.test(tv)) mk.value = 'KR'; var cur = readTrades(); if (cur === null) { state.formMsg = '기존 기록이 손상되어 저장하지 않았습니다.'; render(); return; }
      var t = { id: 'trial-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), market: mk.value, ticker: tk.value.trim().toUpperCase(), date: dt.value, qty: Number(String(qy.value).replace(/,/g, '')), price: Number(String(pr.value).replace(/,/g, '')) }; if (exb.checked) t.kind = 'exception';
      if (!validTicker(t.ticker, t.market)) { state.formMsg = t.market === 'KR' ? '국내 종목코드는 6자리입니다(예: 001440).' : '미국 종목은 영문 티커입니다(예: MSFT).'; render(); return; }
      if (!(t.qty > 0) || !(t.price > 0)) { state.formMsg = '수량과 1주 가격을 입력해 주세요(소수점 가능, 예: 0.0727).'; render(); return; }
      if (!validTrade(t) || t.date > kstDate(Date.now())) { state.formMsg = '날짜(미래 불가)·수량·가격을 확인해 주세요.'; render(); return; }
      if (!writeTrades(cur.concat([t]))) { state.formMsg = '저장하지 못했습니다(저장공간 확인).'; render(); return; }
      state.formMsg = '✅ 저장했습니다: ' + t.ticker + ' ' + t.qty + '주'; state.draft = null; state.trial = trialScore(readTrades() || [], state.series, state.cards); render();
    });
    box.appendChild(f); box.appendChild(msg);
    if (!trades.length) { box.appendChild(node('p', '아직 기록이 없습니다. 추천 종목을 소액으로 사신 뒤 위에 입력해 주세요.')); return box; }
    var T = state.trial && state.trial.rows.length === trades.length ? state.trial : trialScore(trades, state.series, state.cards);
    ['KR', 'US'].forEach(function (m) { var t = T.total[m]; if (t.cost > 0) box.appendChild(node('div', (m === 'KR' ? '국내' : '미국') + ' 합계: 투자 ' + money(t.cost, m) + ' → 지금 ' + money(t.val, m) + ' (' + pct((t.val / t.cost - 1) * 100) + ')', 'font-weight:800')); });
    ['KR', 'US'].forEach(function (m) { if (T.realized && T.realized[m]) box.appendChild(node('div', (m === 'KR' ? '국내' : '미국') + ' 매도 확정 손익 ' + (T.realized[m] > 0 ? '+' : '') + money(T.realized[m], m))); });
    if (T.byKind && T.byKind.exception.n) box.appendChild(node('div', '🔎 예외 정찰 평균 ' + pct(T.byKind.exception.avg) + ' (' + T.byKind.exception.n + '건) · 일반 매수 평균 ' + (T.byKind.normal.n ? pct(T.byKind.normal.avg) + ' (' + T.byKind.normal.n + '건)' : '기록 없음') + ' — 예외가 계속 못하면 규칙 폐기', 'font-weight:700;color:#4a148c'));
    if (isFinite(T.avgExcess)) box.appendChild(node('div', '지수 대비 평균 초과 ' + pct(T.avgExcess), 'font-weight:700'));
    if (!Object.keys(state.series).length) box.appendChild(node('div', '수익률은 위 [성적 계산하기]를 누르면 계산됩니다.'));
    T.rows.slice().reverse().forEach(function (r) {
      var t = r.trade, nm = r.card ? r.card.name + ' (' + t.ticker + ')' : t.ticker, line = node('div', null, 'border-top:1px solid #d5dbe3;padding:6px 0');
      line.appendChild(node('div', (t.kind === 'exception' ? '🔎 예외 정찰 · ' : '') + nm + ' · ' + t.date + ' · ' + t.qty + '주 × ' + money(t.price, t.market), 'font-weight:700'));
      line.appendChild(node('div', isFinite(r.ret) ? (t.sellDate ? '매도 ' + t.sellDate + ' ' : '최근 ' + r.endDate + ' ') + money(r.last, t.market) + ' · 수익 ' + pct(r.ret) + ' · 지수 ' + pct(r.benchRet) + ' · 초과 ' + pct(r.excess) : '가격 미계산'));
      if (r.card) line.appendChild(node('div', '클로 판단: ' + (LABEL[r.card.verdict] || r.card.verdict) + ' (' + kstDate(Date.parse(r.card.reviewedAt)) + ')'));
      else line.appendChild(node('div', '클로 검토 카드 없는 종목'));
      if (!t.sellDate) {
        var sb = node('button', '매도 기록', 'min-height:40px;font-size:14px;margin:4px 8px 0 0'); sb.type = 'button';
        var sf = node('div', null, 'display:none;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px');
        var sd = node('input', null, 'min-height:44px;font-size:15px;box-sizing:border-box;width:100%'); sd.type = 'date'; sd.value = kstDate(Date.now()); sd.min = t.date; sd.max = kstDate(Date.now()); sd.setAttribute('aria-label', '매도 날짜');
        var sq = node('input', null, 'min-height:44px;font-size:15px;box-sizing:border-box;width:100%'); sq.inputMode = 'decimal'; sq.value = String(t.qty); sq.setAttribute('aria-label', '매도 수량');
        var sp = node('input', null, 'min-height:44px;font-size:15px;box-sizing:border-box;width:100%'); sp.inputMode = 'decimal'; sp.placeholder = '매도 가격'; sp.setAttribute('aria-label', '1주 매도 가격');
        var ok = node('button', '매도 저장', 'grid-column:1 / -1;min-height:44px;font-size:15px;font-weight:700'); ok.type = 'button';
        [sd, sq, sp, ok].forEach(function (x) { sf.appendChild(x); });
        sb.addEventListener('click', function () { sf.style.display = sf.style.display === 'none' ? 'grid' : 'none'; });
        ok.addEventListener('click', function () {
          var cur = readTrades(); if (!cur) { state.formMsg = '기존 기록이 손상되어 저장하지 않았습니다.'; render(); return; }
          var res = applySell(cur, t.id, { date: sd.value, qty: Number(String(sq.value).replace(/,/g, '')), price: Number(String(sp.value).replace(/,/g, '')) }, 'trial-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
          if (res.error) { state.formMsg = res.error; render(); return; }
          if (!writeTrades(res.trades)) { state.formMsg = '저장하지 못했습니다(저장공간 확인).'; render(); return; }
          state.formMsg = ''; state.trial = trialScore(readTrades() || [], state.series, state.cards); render();
        });
        line.appendChild(sb); line.appendChild(sf);
      }
      var del = node('button', '이 기록 삭제', 'min-height:40px;font-size:14px;margin-top:4px'); del.type = 'button';
      del.addEventListener('click', function () { if (!W.confirm(nm + ' ' + t.date + ' 기록을 삭제할까요?')) return; var cur = readTrades(); if (!cur) return; if (!writeTrades(cur.filter(function (x) { return x.id !== t.id; }))) { state.formMsg = '삭제하지 못했습니다.'; } render(); });
      line.appendChild(del); box.appendChild(line);
    });
    return box;
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
  return { score: score, applySell: applySell, trialScore: trialScore, parseTrades: parseTrades, validTrade: validTrade, TRIAL_KEY: TRIAL_KEY, baseDate: baseDate, closeOnOrBefore: closeOnOrBefore, cleanBars: cleanBars, open: open, LABEL: LABEL };
});
