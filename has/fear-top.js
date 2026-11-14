/* 곡소리 후보 Top 10 (3개 먼저, 나머지는 펼치기). 가격 위치만 본 임시 순위이며 매수 의견을 만들지 않는다.
 * 네트워크: 사용자가 '곡소리 후보 조회'를 누를 때만 GAS 요약 1회(JSONP, type=screen). 자동 조회 없음.
 * 저장: 메모리 캐시만(한국시간 날짜 기준), localStorage·백업 쓰기 없음. 재무 확인(2차) 연결 전이라 모든 항목 '판단 보류'. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASFearTop = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var LIMIT = 10, VISIBLE = 3;
  function select(summary, now, rank) {
    now = now == null ? Date.now() : now;
    var ranked = [], aged = false;
    if (summary && Array.isArray(summary.items) && typeof rank === 'function') {
      ranked = rank(summary, now).slice(0, LIMIT);
      aged = now - Date.parse(summary.generatedAt) > 86400000;
    }
    return { rows: ranked, visible: ranked.slice(0, VISIBLE), hidden: ranked.slice(VISIBLE), aged: aged, total: ranked.length };
  }
  function kstDay(t) { return new Date(t + 32400000).toISOString().slice(0, 10); }
  function pct(x) { return Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(1) + '%' : '자료 부족'; }
  function mount(container, deps) {
    if (!container || typeof document === 'undefined') return null;
    var W = typeof window !== 'undefined' ? window : {};
    deps = deps || {};
    var screen = deps.screen || W.HASUniverseScreen, now = deps.now || Date.now;
    var state = { summary: null, busy: false, error: '', expanded: false, cache: null, serial: 0 };
    function node(tag, text) { var e = document.createElement(tag); if (text != null) e.textContent = text; return e; }
    function endpoint() {
      if (deps.endpoint) return deps.endpoint();
      var v = typeof W.gasUrl === 'string' ? W.gasUrl : '';
      return W.HASLivePriceReference.validateEndpoint(v);
    }
    function transport(ep) {
      if (deps.transport) return deps.transport(ep);
      return new Promise(function (resolve, reject) {
        var u = new URL(ep), cb = 'hasFearTop_' + (++state.serial), s = document.createElement('script'), done = false, timer;
        function end(err, data) { if (done) return; done = true; clearTimeout(timer); s.remove(); W[cb] = function () {}; if (err) reject(err); else resolve(data); }
        W[cb] = function (data) { end(null, data); };
        u.searchParams.set('type', 'screen'); u.searchParams.set('callback', cb); u.searchParams.set('_', String(Date.now()));
        s.src = u.href; s.referrerPolicy = 'no-referrer';
        s.onerror = function () { end(Error('요약 조회 실패')); };
        timer = setTimeout(function () { end(Error('요약 응답 시간 초과')); }, 12000);
        document.head.appendChild(s);
      });
    }
    function reason(e) {
      var m = e && e.message || '';
      if (/^Invalid URL/.test(m) || /GAS/.test(m) || m === 'invalid-gas-endpoint') return 'GAS가 연결되지 않았거나 주소 확인이 필요합니다';
      return /^[a-z0-9-]+$/.test(m) ? '자료 확인 필요 (' + m + ')' : (m || '조회 실패');
    }
    function synthetic(s) {
      return /synthetic|test-only/i.test(String(s.generation)) || (s.sources || []).some(function (x) { var v = x && x.source || {}; return /synthetic|test-only|example\.invalid/i.test(String(v.version) + ' ' + String(v.url)); });
    }
    function card(r, i, aged) {
      var a = node('article');
      a.appendChild(node('strong', (i + 1) + '. ' + r.ticker + ' · ' + r.market));
      a.appendChild(node('p', (aged ? '지난 요약 · ' : '') + '52주 고점 대비 ' + pct(r.drawdownPct) + ' · 자료 기준일 ' + (r.asOf || '없음')));
      a.appendChild(node('p', '가격 참고값 ' + (Number.isFinite(r.price) ? r.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' ' + (r.currency || '통화 미상') : '없음') + ' · 종가 확정·조정기준 미검증'));
      a.appendChild(node('p', 'AI 의견: 판단 보류 · 기업 확인(재무) 전'));
      var d = node('details'); d.appendChild(node('summary', '근거·반론 보기'));
      d.appendChild(node('p', '근거: 고점 대비 하락폭이 후보 200종목 중 큰 편입니다. 반론: 가격 하락은 기업가치 훼손일 수도 있습니다. 재무·실적·공시 확인 전에는 매수를 권하지 않습니다.'));
      [1, 3, 6].forEach(function (n) {
        var x = r.returns && r.returns[n], ok = x && Number.isFinite(x.value);
        d.appendChild(node('p', n + '개월 ' + pct(x && x.value) + (ok && x.startDate ? ' (' + x.startDate + '~' + x.endDate + ')' : '') + ' · 지수 초과 ' + (x && Number.isFinite(x.excessPct) ? x.excessPct.toFixed(1) + '%p' : '자료 부족')));
      });
      d.appendChild(node('p', (r.source || '출처 없음') + ' · ' + (r.currency || '통화 미상') + ' · 조정/종가확정 미검증'));
      a.appendChild(d); return a;
    }
    function render() {
      container.replaceChildren(); container.dataset.testid = 'fear-top'; container.style.overflowWrap = 'anywhere';
      container.appendChild(node('h3', '곡소리 후보 Top 10'));
      container.appendChild(node('p', '200종목 중 가격 하락폭만 본 임시 순위입니다. 기업 확인(재무) 전이며 매수 권유가 아닙니다. 최종 결정은 순태씨가 합니다.'));
      var btn = node('button', state.busy ? '조회 중…' : '곡소리 후보 조회'); btn.type = 'button'; btn.disabled = state.busy; btn.style.minHeight = '44px'; btn.addEventListener('click', refresh); container.appendChild(btn);
      var st = node('p', state.error || (state.summary ? '' : '버튼을 누르면 설정된 GAS에서 오늘의 요약을 1회 조회합니다.')); st.setAttribute('role', 'status'); container.appendChild(st);
      if (!state.summary) return;
      var sel = select(state.summary, now(), screen && screen.rank);
      st.textContent = state.error || ((synthetic(state.summary) ? '합성 시험 자료(실제 시세 아님) · ' : '') + '요약 ' + state.summary.generatedAt + ' · 후보 ' + sel.total + '개');
      if (!sel.total) { container.appendChild(node('p', '표시할 후보 없음 · 판단 보류 (자료가 오래됐거나 부족합니다)')); return; }
      sel.visible.forEach(function (r, i) { container.appendChild(card(r, i, sel.aged)); });
      if (sel.hidden.length) {
        var more = node('div'); more.id = 'fear-top-more'; more.hidden = !state.expanded;
        sel.hidden.forEach(function (r, i) { more.appendChild(card(r, i + VISIBLE, sel.aged)); });
        var tg = node('button', state.expanded ? '나머지 접기' : '나머지 ' + sel.hidden.length + '개 펼치기'); tg.type = 'button'; tg.style.minHeight = '44px';
        tg.setAttribute('aria-expanded', String(state.expanded)); tg.setAttribute('aria-controls', 'fear-top-more');
        tg.addEventListener('click', function () { state.expanded = !state.expanded; render(); });
        container.appendChild(tg); container.appendChild(more);
      }
    }
    function accept(s) { state.summary = screen.validateSummary(s, now()); state.error = ''; }
    function refresh() {
      if (state.busy) return Promise.resolve();
      var ep;
      try { ep = endpoint(); } catch (e) { state.error = '조회 보류: ' + reason(e) + ' · 판단 보류'; render(); return Promise.resolve(); }
      var day = kstDay(now());
      if (state.cache && state.cache.ep === ep && state.cache.day === day) { try { accept(state.cache.value); render(); return Promise.resolve(); } catch (e) { state.cache = null; } }
      state.busy = true; state.error = ''; render();
      return transport(ep).then(function (s) { accept(s); state.cache = { ep: ep, day: day, value: s }; })
        .catch(function (e) { state.error = '조회 보류: ' + reason(e) + (state.summary ? ' · 아래는 지난 성공 자료입니다.' : ' · 판단 보류'); })
        .then(function () { state.busy = false; render(); });
    }
    render();
    return { refresh: refresh };
  }
  return Object.freeze({ select: select, mount: mount, LIMIT: LIMIT, VISIBLE: VISIBLE });
});
