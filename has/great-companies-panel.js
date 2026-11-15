/* HAS 위대한 기업 탭 (운영 앱 연결 — 2026-11-15 순태씨 '진행' 결정, ORDER GPT-20261115-1326 1단계 다음 단위)
   - 지연 로딩: portfolio_v5.html은 이 파일을 defer로 넣지 않고, 탭을 처음 누를 때만 주입한다. 이 파일이 엔진(has/great-companies.js)과
     화면 도우미(has/great-companies-lab.js — #lab 요소가 없으면 스스로 그리지 않음)를 이어서 1회 불러온다. 재진입은 결과를 재사용한다.
   - 읽기 전용: 보유 종목 목록(genStocks·domStocks·ovStocks·penStocks 사본)과 투자원칙 기록(v5_investPrinciples)을 읽기만 한다.
     저장·삭제·서버 전송·AI 호출·주문이 없다. 비중은 HASPortfolioReader(앱 입력 평가액 기준, 미검증)를 그대로 쓴다.
   - 재무 공시(SEC)·밸류에이션·가격 위치 자료는 아직 앱에 연결되지 않았다 → 엔진이 모든 종목을 '판단 보류'로 낸다(꾸며 채우지 않음).
   - 매수·매도 검토 게이트는 엔진 계약대로 항상 닫힘. 최종 결정은 순태씨. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASGreatCompaniesPanel = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ACCOUNTS = [['gen', '일반', 'KR'], ['dom', 'ISA', 'KR'], ['ov', '해외', 'US'], ['pen', '연금', 'KR']];
  var LOGIC_KO = { maintained: '유지', weakened: '일부 약화', broken: '붕괴' };
  var STATE_CLS = { priority: 'ok', recheck: 'warn', erosion: 'bad', hold: 'hold' };
  /* ETF 추정(이름·티커 기준, 미검증): 기업 평가 대상이 아니므로 '판단 보류(ETF)'로 따로 표시한다. */
  var KR_ETF = /(^|\s)(KODEX|TIGER|KBSTAR|HANARO|ARIRANG|KOSEF|TIMEFOLIO|KIWOOM|ACE|RISE|SOL|PLUS)(\s|$)|ETF/i;
  var US_ETF = { SPY: 1, VOO: 1, IVV: 1, SPLG: 1, VTI: 1, VT: 1, QQQ: 1, QQQM: 1, TQQQ: 1, SCHD: 1, SCHG: 1, VUG: 1, VIG: 1, VYM: 1, DIA: 1, IWM: 1, VEA: 1, VWO: 1, JEPI: 1, JEPQ: 1, SOXX: 1, SMH: 1, SOXL: 1, XLK: 1, ARKK: 1, GLD: 1, IAU: 1, SLV: 1, TLT: 1, TMF: 1, IEF: 1, SHY: 1, SGOV: 1, BIL: 1, BND: 1, AGG: 1, UPRO: 1 };
  var TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

  function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function fin(x) { return typeof x === 'number' && isFinite(x); }
  function guessEtf(market, ticker, name) { return market === 'US' ? !!US_ETF[ticker] : KR_ETF.test(String(name || '')); }

  /* 순태씨 투자원칙 기록 → 엔진 thesis(읽기 전용 매핑). 정성 확인일(moat·capital)은 기록 칸이 없어 넣지 않는다(엔진이 '미확인'으로 처리). */
  function thesisOf(p) {
    if (!plain(p)) return null;
    var cps = Array.isArray(p.checkpoints) ? p.checkpoints.filter(function (c) { return plain(c) && typeof c.text === 'string' && c.text.trim() && c.text.length <= 300; }) : [];
    var t = { logicState: LOGIC_KO[p.logicState] ? p.logicState : null, checkpoints: cps.map(function (c) { return c.text.trim(); }) };
    if (typeof p.logicBreak === 'string' && p.logicBreak.trim() && p.logicBreak.length <= 500) t.logicBreak = p.logicBreak.trim();
    return { thesis: t, record: { hasThesis: typeof p.thesis === 'string' && !!p.thesis.trim(), logicState: t.logicState, checkpoints: cps.length, done: cps.filter(function (c) { return c.done === true; }).length } };
  }

  /* 순수: 보유 목록 사본 → 엔진 입력. lists = {gen,dom,ov,pen: 배열}, principles = {'gen-<id>': 기록}, weights = {'KR:005930': 비중%} */
  function buildInputs(lists, principles, weights, day) {
    var rows = [], seen = {}, pr = plain(principles) ? principles : {}, w = plain(weights) ? weights : {};
    ACCOUNTS.forEach(function (a) {
      var list = lists && Array.isArray(lists[a[0]]) ? lists[a[0]] : [];
      list.forEach(function (s) {
        if (!plain(s) || typeof s.ticker !== 'string' || /^DEP_/.test(s.ticker) || !fin(s.quantity) || s.quantity <= 0) return;
        var t = s.ticker.trim().toUpperCase(), m = a[2], k = m + ':' + t, name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 120) : null;
        var th = thesisOf(pr[a[0] + '-' + s.id]);
        if (seen[k]) { var r0 = seen[k]; if (r0.accounts.indexOf(a[1]) < 0) r0.accounts.push(a[1]); if (!r0.input.thesis && th) { r0.input.thesis = th.thesis; r0.record = th.record; } return; }
        var row = { key: k, accounts: [a[1]], weightPct: fin(w[k]) ? w[k] : null, record: th ? th.record : null, validTicker: TICKER.test(t),
          input: { schema: 'hasGreatCompanyInput.v1', generatedAt: day, company: { ticker: t, market: m, name: name, listType: 'holding', kind: guessEtf(m, t, name) ? 'etf' : 'company' }, fundamental: null, thesis: th ? th.thesis : null, price: null } };
        seen[k] = row; rows.push(row);
      });
    });
    return rows;
  }

  function recordLine(r) {
    if (!r) return '순태씨 투자원칙 기록: 없음';
    return '순태씨 투자원칙 기록: 투자논리 ' + (r.logicState ? LOGIC_KO[r.logicState] : '상태 미기록') + ' · 점검 항목 ' + r.checkpoints + '개 중 확인 ' + r.done + '개' + (r.hasThesis ? '' : ' · 투자 이유 미작성');
  }

  function create(env) {
    var W = env.win, D = env.doc, evaluator = null, firstMs = null, shows = 0, loading = false, failed = null;
    function E(tag, cls, text) { var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function host() { return D.getElementById('panel-greatco'); }
    function load(src) {
      return new Promise(function (res, rej) { var s = D.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(Error(src)); }; D.head.appendChild(s); });
    }
    function css() { if (D.getElementById('hgc-css')) return; var l = D.createElement('link'); l.id = 'hgc-css'; l.rel = 'stylesheet'; l.href = 'has/great-companies-panel.css'; D.head.appendChild(l); }
    function ensure() {
      if (W.HASGreatCompanies && W.HASGreatCompaniesLab) return Promise.resolve();
      if (!W.HASFundamentalFilter) return Promise.reject(Error('재무 필터 모듈 없음'));
      return (W.HASGreatCompanies ? Promise.resolve() : load('has/great-companies.js')).then(function () { return W.HASGreatCompaniesLab ? null : load('has/great-companies-lab.js'); });
    }
    function rows() {
      var day = new Date(env.now()).toISOString().slice(0, 10), weights = {}, src = env.source();
      if (W.HASPortfolioReader) { try { var p = W.HASPortfolioReader.read(src.getter, { basis: 'real' }); p.holdings.forEach(function (h) { var k = h.market + ':' + String(h.ticker).toUpperCase(); if (fin(h.weightPct)) weights[k] = Math.round(((weights[k] || 0) + h.weightPct) * 10) / 10; }); } catch (e) { weights = {}; } }
      return buildInputs(src.lists, src.principles, weights, day);
    }
    function tag(text, cls) { return E('span', 'hgc-tag ' + cls, text); }
    function ul(items) { var u = E('ul'); items.forEach(function (t) { u.appendChild(E('li', null, t)); }); return u; }
    function card(r, a, L) {
      var p = a.priceRelation || {}, c = E('article', 'hgc-card');
      c.setAttribute('data-testid', 'hgc-card');
      c.appendChild(E('h3', null, (a.name || r.input.company.name || '이름 없음') + ' · ' + r.input.company.ticker));
      c.appendChild(E('p', 'hgc-sub', (r.input.company.market === 'US' ? '미국' : '국내') + ' · ' + r.accounts.join('·') + ' 계좌 · 비중 ' + (r.weightPct == null ? '미확인' : r.weightPct + '%') + ' (앱 입력 평가액 기준, 미검증)'));
      var tags = E('div', 'hgc-tags'); tags.appendChild(tag(a.stateKo, STATE_CLS[a.state] || 'hold')); tags.appendChild(tag('의견: ' + a.opinion, 'plain'));
      if (r.input.company.kind === 'etf') tags.appendChild(tag('ETF 추정', 'plain'));
      if (L.caution(a)) tags.appendChild(tag('주의', 'bad'));
      c.appendChild(tags);
      c.appendChild(E('p', null, (a.state === 'hold' ? '판단 보류 사유: ' : '판정 이유: ') + a.reason));
      c.appendChild(E('p', null, recordLine(r.record)));
      var d = E('details'), s = E('summary', null, '자세히 보기'); d.appendChild(s);
      var cl = L.cautionLines(a); if (cl.length) { d.appendChild(E('h4', null, '주의 근거')); d.appendChild(ul(cl)); }
      d.appendChild(E('p', null, L.valuationLine(a)));
      if (a.domains && a.domains.length) { d.appendChild(E('h4', null, '6개 영역')); d.appendChild(ul(a.domains.map(function (x) { return x.no + '. ' + x.name + ' — ' + x.statusKo + ' · 근거: ' + x.evidence + ' · 반론: ' + x.counter; }))); }
      if (a.reasonsToHold && a.reasonsToHold.length) { d.appendChild(E('h4', null, '보유할 이유')); d.appendChild(ul(a.reasonsToHold)); }
      if (a.risks && a.risks.length) { d.appendChild(E('h4', null, '위험·반론')); d.appendChild(ul(a.risks)); }
      if (a.sources && a.sources.length) { d.appendChild(E('h4', null, '출처·기준일')); d.appendChild(ul(a.sources.map(function (x) { return x.kind + ' · ' + x.ref + ' · ' + (x.asOf || '기준일 없음'); }))); }
      if (a.unknowns && a.unknowns.length) { d.appendChild(E('h4', null, '미확인·누락')); d.appendChild(ul(a.unknowns)); }
      d.appendChild(E('h4', null, '검토 게이트'));
      d.appendChild(ul(['매수 검토: 닫힘 — 빠진 것: ' + ((p.buyGate && p.buyGate.missing) || []).join(' · '), '매도·축소 검토: 닫힘 — 빠진 것: ' + ((p.sellGate && p.sellGate.missing) || []).join(' · ')]));
      c.appendChild(d);
      return c;
    }
    function draw() {
      var h = host(); if (!h) return;
      var G = W.HASGreatCompanies, L = W.HASGreatCompaniesLab;
      if (!evaluator) evaluator = G.createEvaluator();
      var rs = rows(), t0 = Date.now(), out = evaluator.evaluate(rs.map(function (r) { return r.input; }), { now: env.now() }), ms = Date.now() - t0;
      if (firstMs === null) firstMs = ms;
      var wrap = E('div', 'hgc'); wrap.setAttribute('data-testid', 'hgc-root');
      wrap.appendChild(E('h2', null, '🏛️ 위대한 기업 — 장기보유 판단 보조'));
      var n = E('div', 'hgc-notice');
      n.appendChild(E('p', null, '곡소리에 분할매수 · 환호에 분할매도 · 위대한 기업은 오래 보유. 보유 종목마다 보유할 이유와 보유 논리 훼손 신호를 6개 영역(경쟁우위·성장·수익성·재무안정·자본배분·지속가능성)으로 점검합니다.'));
      n.appendChild(E('p', null, '매수·매도 권유가 아닌 판단 보조이며 최종 결정은 순태씨가 합니다. 보유 자료와 투자원칙 기록을 읽기만 하고 저장·전송하지 않습니다.'));
      wrap.appendChild(n);
      var st = E('div', 'hgc-status'); st.setAttribute('data-testid', 'hgc-data-status');
      st.appendChild(E('strong', null, '자료 연결 상태'));
      st.appendChild(ul(['미국 재무 공시(SEC): 미연결 — 앱으로 가져오는 연결(GAS)이 아직 없어 평가하지 않습니다.', '국내 재무 공시(DART): 미연결', '밸류에이션·가격 위치(52주 고점 대비): 미연결', '그래서 지금은 모든 종목이 ‘판단 보류’입니다. 자료를 꾸며 채우지 않습니다.']));
      wrap.appendChild(st);
      if (!rs.length) wrap.appendChild(E('p', 'hgc-empty', '보유 종목이 없거나 읽지 못했습니다. 판단 보류.'));
      else {
        var cnt = {}; out.forEach(function (a) { cnt[a.stateKo] = (cnt[a.stateKo] || 0) + 1; });
        wrap.appendChild(E('p', 'hgc-sum', '보유 ' + rs.length + '종목 · ' + Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ')));
        rs.forEach(function (r, i) { wrap.appendChild(card(r, out[i], L)); });
      }
      var s = evaluator.stats();
      wrap.appendChild(E('p', 'hgc-perf', '평가 ' + rs.length + '건 · 계산 ' + s.computed + '회 · 재사용 ' + s.cacheHits + '회 · 첫 평가 ' + firstMs + 'ms(이 기기 측정, 목표치 검증 아님) · 탭 진입 ' + shows + '회'));
      while (h.firstChild) h.removeChild(h.firstChild);
      h.appendChild(wrap);
    }
    function message(text) { var h = host(); if (!h) return; while (h.firstChild) h.removeChild(h.firstChild); var p = E('p', 'hgc-empty', text); p.setAttribute('data-testid', 'hgc-msg'); h.appendChild(p); }
    function show() {
      shows++;
      if (W.HASGreatCompanies && W.HASGreatCompaniesLab) { try { draw(); } catch (e) { message('위대한 기업 평가 중 오류 — 판단 보류. (' + String(e && e.message || e).slice(0, 80) + ')'); } return Promise.resolve(); }
      if (loading) return loading;
      css(); message('위대한 기업 화면을 불러오는 중…');
      loading = ensure().then(function () { loading = false; failed = null; draw(); }, function (e) { loading = false; failed = String(e && e.message || e); message('위대한 기업 화면을 불러오지 못했습니다(' + failed.slice(0, 60) + '). 탭을 다시 누르면 다시 시도합니다. 판단 보류.'); });
      return loading;
    }
    return { show: show, onTabChange: function (tab) { if (tab === 'greatco') return show(); }, stats: function () { return { shows: shows, firstMs: firstMs, engine: evaluator ? evaluator.stats() : null }; } };
  }

  /* 앱 안에서: 전역 보유 목록 사본과 투자원칙 기록을 읽기 전용으로 넘긴다. */
  function appSource(W) {
    return function () {
      function arr(n) { try { var v = W[n]; return Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : []; } catch (e) { return []; } }
      var lists = { gen: arr('genStocks'), dom: arr('domStocks'), ov: arr('ovStocks'), pen: arr('penStocks') }, principles = {};
      try { var raw = W.localStorage.getItem('v5_investPrinciples'); principles = raw ? JSON.parse(raw) : {}; } catch (e) { principles = {}; }
      var getter = function (k) {
        try {
          var m = { v5_gen: 'gen', v5_dom: 'dom', v5_ov: 'ov', v5_pen: 'pen' }[k];
          if (m) return JSON.stringify(lists[m]);
          if (k === 'v5_fx') { var f = W.document.getElementById('usdKrw'); return f ? String(f.value) : null; }
          if (k === 'v5_cma_amount') return W.localStorage.getItem('v5_cma_amount');
        } catch (e) { return null; }
        return null;
      };
      return { lists: lists, principles: principles, getter: getter };
    };
  }

  var api = { buildInputs: buildInputs, thesisOf: thesisOf, recordLine: recordLine, guessEtf: guessEtf, create: create };
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(typeof module === 'object' && module.exports)) {
    var inst = create({ win: window, doc: document, now: function () { return Date.now(); }, source: appSource(window) });
    api.show = inst.show; api.onTabChange = inst.onTabChange; api.stats = inst.stats;
  }
  return Object.freeze(api);
});
