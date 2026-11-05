/* HAS 25단계 — 앱 안의 "위험관리 > AI 참모" 화면과 투자 첫 화면 브리핑 띠. 읽기 전용: 앱의 보유·가계부·백업 자료를 읽기만 하고 쓰지 않는다.
   이 파일은 sessionStorage·IndexedDB·캐시·네트워크를 쓰지 않고, localStorage 는 CMA 금액(v5_cma_amount) 한 키를 getItem 으로 읽기만 한다(정적 시험으로 보호). 외부 AI를 호출하지 않는다.
   모듈이 하나라도 없거나 오류가 나면 이 화면만 '사용할 수 없음'으로 표시하고 기존 앱은 영향을 받지 않는다. */
(function () {
  'use strict';
  // 모듈은 쓸 때마다 전역에서 찾는다(없거나 바뀌어도 이 화면만 '사용 불가'로 처리).
  var W = window;
  var mode = 'real', root = null, lastBrief = null, lastBridge = null, compareText = '', compareTicker = '', cached = null, ROLE_NOTE = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ready() { return !!(W.HASPortfolioReader && W.HASAdvisorBridge && W.HASBriefingModel && W.HASOpinionConflict); }
  function nowISO() { return new Date().toISOString(); }
  /* 앱 화면의 현재 메모리 자료를 getter 로만 읽는다(복사본 문자열). 환율은 입력칸 값, CMA 는 저장된 값 읽기. */
  function liveGetter() {
    return function (k) {
      try {
        if (k === 'v5_gen') return Array.isArray(genStocks) ? JSON.stringify(genStocks) : null; if (k === 'v5_dom') return Array.isArray(domStocks) ? JSON.stringify(domStocks) : null;
        if (k === 'v5_ov') return Array.isArray(ovStocks) ? JSON.stringify(ovStocks) : null; if (k === 'v5_pen') return Array.isArray(penStocks) ? JSON.stringify(penStocks) : null;
        if (k === 'v5_fx') { var f = document.getElementById('usdKrw'); return f ? String(f.value) : null; }
        if (k === 'v5_cma_amount') return localStorage.getItem('v5_cma_amount'); if (k === 'v5_quote_meta') return typeof quoteMeta === 'object' ? JSON.stringify(quoteMeta) : null;
      } catch (e) { return null; }
      return null;
    };
  }
  function names() { var m = {}; var lists = []; try { lists = [genStocks, domStocks, ovStocks, penStocks]; } catch (e) { } lists.forEach(function (a) { if (Array.isArray(a)) a.forEach(function (s) { if (s && typeof s.ticker === 'string' && typeof s.name === 'string') m[s.ticker] = s.name; }); }); return m; }
  function compute() {
    var out = { ok: false, brief: null, bridge: null, error: null, names: {} };
    try {
      if (!ready()) throw new Error('필요한 모듈을 불러오지 못했습니다');
      var now = nowISO(), getter, ext, basis;
      if (mode === 'synthetic' && W.HASAdvisorSynthetic) { var d = W.HASAdvisorSynthetic.DATA; getter = function (k) { return d[k] === undefined ? null : d[k]; }; ext = W.HASAdvisorSynthetic.externals(); basis = 'synthetic'; now = W.HASAdvisorSynthetic.NOW; }
      else { getter = liveGetter(); ext = {}; basis = 'real'; out.names = names(); }
      var p = W.HASPortfolioReader.read(getter, { basis: basis, asOf: now }), b = W.HASAdvisorBridge.run(getter, ext, now, { basis: basis });
      out.brief = W.HASBriefingModel.build(p, b, now); out.bridge = b; out.ok = b.status !== 'error';
      if (mode === 'synthetic') { ['SYN-KR1', 'SYN-US1'].forEach(function (t) { }); out.names = { 'SYN-KR1': '합성 국내 우량A', 'SYN-US1': '합성 미국 성장B' }; }
    } catch (e) { out.error = String(e && e.message || e); }
    return out;
  }
  function tag(text, kind) { return el('span', 'hs-tag ' + (kind || ''), text); }
  function opKind(o) { return o === '매수 검토' ? 'ok' : (o === '비중 축소 검토' ? 'bad' : 'warn'); }
  function won(n) { return typeof n === 'number' && isFinite(n) ? Math.round(n).toLocaleString('ko-KR') + '원' : '미확인'; }
  function pct(n) { return typeof n === 'number' && isFinite(n) ? n + '%' : '미확인'; }
  function list(title, arr) { var f = document.createDocumentFragment(); if (!arr || !arr.length) return f; f.appendChild(el('h3', '', title)); var u = el('ul'); arr.forEach(function (x) { u.appendChild(el('li', '', typeof x === 'string' ? x : x.text + (x.source ? ' (출처 ' + x.source + ')' : ''))); }); f.appendChild(u); return f; }
  function nm(t, names) { return names && names[t] ? names[t] + ' (' + t + ')' : t; }
  function section(tid, title) { var s = el('section', 'hs-card'); s.setAttribute('data-testid', tid); s.appendChild(el('h2', '', title)); return s; }

  function render() {
    if (!root) return; root.replaceChildren();
    root.appendChild(el('h2', '', '🧭 AI 투자참모 (읽기 전용)'));
    if (!ready()) { var w = el('div', 'hs-warn', 'AI 참모 모듈을 불러오지 못해 이 화면을 사용할 수 없습니다. 기존 투자·백업 기능에는 영향이 없습니다.'); w.setAttribute('role', 'alert'); w.setAttribute('data-testid', 'hs-unavailable'); root.appendChild(w); return; }
    var c = compute(); cached = c;
    var ban = el('div', 'hs-banner' + (mode === 'synthetic' ? ' syn' : ''), mode === 'synthetic' ? '합성 예시 · 가짜 보유·시세·재무입니다 · 실제 내 기록이 아닙니다 · 아무것도 저장하지 않습니다' : '내 실제 기록을 읽기만 합니다 · 아무것도 저장·변경하지 않습니다 · 외부 AI로 보내지 않습니다'); ban.setAttribute('data-testid', 'hs-banner'); ban.setAttribute('role', 'status'); root.appendChild(ban);
    if (c.error || !c.brief) { var e = el('div', 'hs-warn', '분석 중 오류가 발생해 결과를 표시하지 못했습니다: ' + (c.error || '알 수 없음') + ' — 기존 앱·기록은 영향이 없습니다.'); e.setAttribute('role', 'alert'); e.setAttribute('data-testid', 'hs-error'); root.appendChild(e); root.appendChild(controls()); return; }
    var b = c.brief, st = b.state; lastBrief = b; lastBridge = c.bridge;
    var n = el('div', 'hs-note', b.monitoring); n.setAttribute('data-testid', 'hs-monitor'); root.appendChild(n);
    var s0 = section('hs-headline', '오늘의 투자 브리핑'); s0.appendChild(el('div', 'hs-big', b.headline)); s0.appendChild(el('div', 'hs-kv', '점검 시각 ' + b.generatedAt + ' · 분석 상태 ' + b.status)); if (b.errors.length) b.errors.forEach(function (x) { s0.appendChild(el('div', 'hs-warn', '오류: ' + x)); }); root.appendChild(s0);
    // ① 포트폴리오 상태
    var s1 = section('hs-state', '① 내 포트폴리오 상태'); s1.appendChild(el('div', 'hs-big', '전체 ' + won(st.totalKRW) + ' (예수금·CMA 포함)')); s1.appendChild(el('div', 'hs-note', b.priceNote));
    st.accounts.forEach(function (a) { var r = el('div', 'hs-row'); r.appendChild(el('span', 'hs-kv', a.label + ' 계좌' + (a.ok ? '' : ' (자료 오류 — 제외)'))); r.appendChild(el('span', 'hs-kv', won(a.valueKRW) + ' · ' + pct(a.weightPct))); s1.appendChild(r); });
    s1.appendChild(el('div', 'hs-kv', '공격(창) ' + pct(st.spearPct) + ' · 방어(방패) ' + pct(st.shieldPct) + ' (예수금·CMA는 방어로 계산, 역할 미지정 종목은 앱 규칙대로 창)'));
    var cash = el('div', 'hs-kv', '현금 비중 ' + (st.cashKnown ? pct(st.cashPct) + ' (' + won(st.cashKRW) + ')' + (st.cashMissingAccounts && st.cashMissingAccounts.length ? ' — 일부만 기록됨(예수금 없는 계좌: ' + st.cashMissingAccounts.join('·') + ')' : '') : '미확인 — 예수금·CMA 기록 없음')); cash.setAttribute('data-testid', 'hs-cash'); s1.appendChild(cash);
    if (st.zeroQty) s1.appendChild(el('div', 'hs-note', '수량 0인 항목 ' + st.zeroQty + '건은 보유로 세지 않았습니다.')); if (!st.top.length) s1.appendChild(el('div', 'hs-warn', '보유종목이 없습니다.')); st.top.forEach(function (h) { var r = el('div', 'hs-row'); r.appendChild(el('span', 'hs-kv', nm(h.ticker, c.names))); r.appendChild(el('span', 'hs-kv', pct(h.weightPct) + (h.role === 'shield' ? ' 🛡' : ' ⚔️'))); r.setAttribute('data-testid', 'hs-top'); s1.appendChild(r); }); root.appendChild(s1);
    // ② 주의할 위험
    var s2 = section('hs-risk', '② 주의할 위험'); if (!b.risks.length) s2.appendChild(el('div', 'hs-kv', '확인된 위험 신호 없음'));
    b.risks.forEach(function (r) { var d = el('div', 'hs-item'); d.setAttribute('data-testid', 'hs-risk-item'); var row = el('div', 'hs-row'); row.appendChild(el('span', r.type === 'concentration' || r.type === 'loss' || r.type === 'cash-low' ? 'hs-warn' : 'hs-kv', r.text)); row.appendChild(tag(r.basis, r.type === 'data' || r.type === 'stale' ? 'warn' : 'blue')); d.appendChild(row); s2.appendChild(d); }); root.appendChild(s2);
    // ③ 매수 기회 후보
    var s3 = section('hs-buy', '③ 매수 기회 후보'); if (b.watchlistNote) s3.appendChild(el('div', 'hs-kv', b.watchlistNote));
    if (!b.buyCandidates.length) s3.appendChild(el('div', 'hs-kv', '지금 매수 검토 후보 없음')); b.buyCandidates.forEach(function (a) { s3.appendChild(card(a, c.names, st.weights)); });
    if (lastBridge) lastBridge.advices.filter(function (a) { return !(a.holding && a.holding.held) && a.opinion !== '매수 검토'; }).forEach(function (a) { s3.appendChild(card(a, c.names, st.weights)); });
    s3.appendChild(el('div', 'hs-note', '가격 하락만으로 후보가 되지 않습니다. 매수·매도 결정과 주문은 직접 하십시오.')); root.appendChild(s3);
    // ④ AI 종합 의견
    var s4 = section('hs-opinion', '④ AI 종합 의견 (보유종목)'); if (!b.opinions.length) s4.appendChild(el('div', 'hs-kv', '분석할 보유종목이 없습니다.')); b.opinions.forEach(function (a) { s4.appendChild(card(a, c.names, st.weights)); }); root.appendChild(s4);
    // 역할 구분 + 충돌 표시
    var s5 = section('hs-roles', '⑤ 규칙 엔진 vs Gemini 자문'); s5.appendChild(el('div', 'hs-note', W.HASAdvisorBridge.ROLES.rules)); s5.appendChild(el('div', 'hs-note', W.HASAdvisorBridge.ROLES.gemini)); s5.appendChild(el('div', 'hs-note', '내 보유정보는 Gemini로 자동 전송되지 않습니다. Gemini의 답을 아래에 직접 붙여 넣으면 이 기기 안에서만 규칙 엔진과 비교합니다(저장하지 않음).'));
    var all = (lastBridge ? lastBridge.advices : []); if (all.length) { var sel = el('select'); sel.setAttribute('data-testid', 'hs-cmp-ticker'); sel.setAttribute('aria-label', '비교할 종목'); all.forEach(function (a) { var o = el('option', '', nm(a.ticker, c.names)); o.value = a.ticker; sel.appendChild(o); }); sel.value = compareTicker || all[0].ticker; sel.addEventListener('change', function () { compareTicker = sel.value; }); s5.appendChild(sel);
      var ta = el('textarea'); ta.setAttribute('data-testid', 'hs-cmp-text'); ta.setAttribute('aria-label', 'Gemini 의견 붙여넣기'); ta.placeholder = 'Gemini의 의견을 여기에 붙여 넣으세요(선택)'; ta.value = compareText; ta.addEventListener('input', function () { compareText = ta.value; }); s5.appendChild(ta);
      var out = el('div', 'hs-kv'); out.setAttribute('data-testid', 'hs-cmp-result'); var btn = el('button', 'primary', '규칙 엔진과 비교'); btn.setAttribute('data-testid', 'hs-cmp-btn'); btn.addEventListener('click', function () { compareTicker = sel.value; var adv = all.filter(function (a) { return a.ticker === sel.value; })[0] || null, r = W.HASOpinionConflict.compare(adv, ta.value); showCompare(out, r); }); s5.appendChild(btn); s5.appendChild(out); }
    else s5.appendChild(el('div', 'hs-kv', '비교할 보유종목이 없습니다.')); root.appendChild(s5);
    root.appendChild(controls());
  }
  function showCompare(out, r) { out.replaceChildren(); var h = el('div', r.status === 'conflict' ? 'hs-warn' : 'hs-kv', r.message); h.setAttribute('data-testid', 'hs-cmp-status'); h.setAttribute('data-status', r.status); out.appendChild(h);
    if (r.ungroundedNumbers.length) { var w = el('div', 'hs-warn', '확인되지 않은 수치(규칙 엔진 자료에 없음 — 사실로 취급하지 않음): ' + r.ungroundedNumbers.join(', ')); w.setAttribute('data-testid', 'hs-cmp-ungrounded'); out.appendChild(w); } }
  function card(a, names, weights) {
    var d = el('div', 'hs-item'); d.setAttribute('data-testid', 'hs-adv-' + a.ticker); var r = el('div', 'hs-row'); r.appendChild(el('b', '', nm(a.ticker, names))); var t = tag(a.opinion, opKind(a.opinion)); t.setAttribute('data-testid', 'hs-op-' + a.ticker); r.appendChild(t); d.appendChild(r);
    d.appendChild(el('div', 'hs-kv', '비중 ' + (a.holding && typeof a.holding.weightPct === 'number' ? a.holding.weightPct + '%' : (weights && typeof weights[a.ticker] === 'number' ? weights[a.ticker] + '%' : (a.holding && a.holding.held ? '미확인' : '미보유 0%'))) + ' · ' + (a.reasonsAgainst[0] || '')));
    var det = el('details'); det.appendChild(el('summary', '', '근거·반대 근거·확인되지 않은 정보')); det.appendChild(el('div', 'hs-kv', '공격형 관점 ' + a.aggressive.stance + ' / 방어형 관점 ' + a.defensive.stance + ' (같은 엔진의 두 역할)'));
    det.appendChild(list('확인된 사실', a.facts)); det.appendChild(list('추정(확인되지 않음)', a.estimates)); det.appendChild(list('의견의 근거', a.reasonsFor)); det.appendChild(list('반대 근거', a.reasonsAgainst)); det.appendChild(list('확인되지 않은 정보', a.unknown)); det.appendChild(list('주요 위험', a.risks)); det.appendChild(list('검토할 매수 조건', a.conditions.buyReview)); det.appendChild(list('검토할 매도 조건', a.conditions.sellReview)); det.appendChild(list('추가 확인이 필요한 사항', a.checks)); det.appendChild(el('div', 'hs-note', a.notice)); d.appendChild(det); return d; }
  function controls() { var b = el('div', 'hs-btns'); var again = el('button', 'primary', '다시 점검'); again.setAttribute('data-testid', 'hs-refresh'); again.addEventListener('click', function () { render(); refreshStrip(); }); b.appendChild(again);
    var sw = el('button', '', mode === 'real' ? '합성 예시 보기' : '내 실제 기록으로 돌아가기'); sw.setAttribute('data-testid', 'hs-mode'); sw.addEventListener('click', function () { mode = mode === 'real' ? 'synthetic' : 'real'; compareText = ''; compareTicker = ''; render(); }); b.appendChild(sw); return b; }
  function refreshStrip() {
    var s = document.getElementById('hasBriefStrip'); if (!s) return; s.replaceChildren();
    try {
      if (!ready()) { s.hidden = true; return; } s.hidden = false; var prev = mode; var c = (function () { var m = mode; mode = 'real'; var x = compute(); mode = m; return x; })();
      var t = el('span', '', '🧭 오늘의 투자 브리핑: ' + (c.brief ? c.brief.headline : '점검 불가') + ' (내 기록 기준 · 시장 감시 아님)'); t.setAttribute('data-testid', 'hs-strip-text'); s.appendChild(t);
      var b = el('button', '', '자세히'); b.setAttribute('data-testid', 'hs-strip-open'); b.addEventListener('click', function () { if (window.switchTab) window.switchTab('staff'); }); s.appendChild(b);
    } catch (e) { s.hidden = true; }
  }
  var HASH = '#has-staff', prevTab = 'dashboard';
  function onTabChange(tab) {
    if (tab === 'staff') {
      root = document.getElementById('panel-staff'); mode = 'real'; compareText = ''; compareTicker = '';
      if (location.hash !== HASH) { try { history.pushState({ hasStaff: true }, '', location.pathname + location.search + HASH); } catch (e) { } }
      try { render(); } catch (e) { if (root) { root.replaceChildren(); var w = el('div', 'hs-warn', 'AI 참모 화면 오류로 표시하지 못했습니다. 기존 앱은 영향이 없습니다.'); w.setAttribute('role', 'alert'); w.setAttribute('data-testid', 'hs-error'); root.appendChild(w); } }
    } else {
      if (location.hash === HASH) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
      if (root) root.replaceChildren(); prevTab = tab;
    }
  }
  window.addEventListener('popstate', function () { var panel = document.getElementById('panel-staff'); if (location.hash === HASH && window.switchTab) window.switchTab('staff'); else if (panel && panel.childNodes.length && window.switchTab) window.switchTab(prevTab); });
  // 앱이 처음 그려진 뒤·앱으로 돌아왔을 때 브리핑 띠를 갱신(타이머 없음)
  window.addEventListener('load', function () { try { refreshStrip(); } catch (e) { } });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { try { refreshStrip(); } catch (e) { } } });
  window.HASAdvisorPanel = { onTabChange: onTabChange, refresh: function () { try { refreshStrip(); } catch (e) { } } };
})();
