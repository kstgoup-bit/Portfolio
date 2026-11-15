/* HAS 위대한 기업 시험 화면 (ORDER GPT-20261115-1326 3절 5)·6)) — 시험 게이트(?test=1)에서만 그린다.
   - 가상 자료(has/great-companies-fixtures.js)만 평가한다. 실제 보유·시세·투자기록·백업을 읽거나 쓰지 않는다.
   - 계산은 has/great-companies.js 엔진(createEvaluator 메모리 캐시)에 맡기고, 화면은 결과를 글자(textContent)로만 그린다.
   - 지연 평가: 게이트가 열리고 목록을 처음 그릴 때 한 번 평가한다. 목록↔상세 전환은 같은 결과를 재사용(재계산 없음).
     새로고침은 새 인스턴스라 다시 계산한다(저장소 사용 없음).
   - 화면 경고 규칙(엔진 계약): warning(경쟁력 훼손) 또는 riskWarning(집중·밸류에이션 위험) 중 하나라도 true면 주의 표시, 문구는 따로.
   - 밸류에이션 보류 사유(reason)는 모든 분기에서 따로 보여 준다(GPT-REVIEW-great-companies-20261115-1927 후속). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASGreatCompaniesLab = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function gateOn(search) { try { return new URLSearchParams(search || '').get('test') === '1'; } catch (e) { return false; } }
  var VAL_REASON_KO = { missing: '미연결', stale: '기준일 오래됨 — 확인 전 판단 보류', unverified: '입력 미검증(가상 입력)' };
  var SIGNAL_KO = { fear: '가격 하락(곡소리 후보 위치)', euphoria: '고점권(환호성 후보 위치)', stale: '가격 기준일 오래됨', none: '가격 위치 신호 없음' };
  var STATE_CLS = { priority: 'ok', recheck: 'warn', erosion: 'bad', hold: 'hold' };
  /* 밸류에이션 줄: 엔진 출력 그대로(사유 + 원문). 판단 보류 출력(holdOut)에는 valuation이 없다. */
  function valuationLine(a) {
    var v = a && a.priceRelation && a.priceRelation.valuation;
    if (!v) return '밸류에이션: 평가하지 않음(판단 보류 상태)';
    return '밸류에이션: ' + (VAL_REASON_KO[v.reason] || '사유 미상') + ' · ' + v.text;
  }
  function caution(a) { var p = a.priceRelation || {}; return !!(p.warning || p.riskWarning); }
  function cautionLines(a) {
    var p = a.priceRelation || {}, out = [];
    if (p.warning) out.push('경쟁력 경고: ' + (p.warningText || '보유 논리 훼손 우려'));
    (p.riskBasis || []).forEach(function (r) { out.push('위험 근거(' + (r.verified ? '검증' : '미검증') + '): ' + r.text + (r.source ? ' · 출처 ' + r.source : '')); });
    return out;
  }
  function parseHash(h) { var m = /^#d=([A-Z0-9.\-]{1,12})$/.exec(h || ''); return m ? m[1] : null; }

  /* 상태: 평가 결과는 처음 한 번만 만든다(지연). stats는 엔진 캐시 통계. */
  function createModel(G, X) {
    var ev = G.createEvaluator(), list = null, ms = null;
    function results() {
      if (list) return list;
      var t0 = Date.now(), sc = X.scenarios(), out = ev.evaluate(sc.map(function (s) { return s.input; }), { now: X.NOW });
      list = sc.map(function (s, i) { return { id: s.id, label: s.label, a: out[i] }; }); ms = Date.now() - t0;
      return list;
    }
    function find(id) { return results().filter(function (r) { return r.id === id; })[0] || null; }
    return { results: results, find: find, stats: function () { return Object.assign({ firstMs: ms }, ev.stats()); }, evaluated: function () { return !!list; } };
  }

  function mount(doc, win, G, X) {
    var host = doc.getElementById('lab');
    var E = function (tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    if (!gateOn(win.location.search)) {
      host.appendChild(E('div', 'gate-off', '시험 게이트가 닫혀 있습니다. 주소 끝에 ?test=1 을 붙여야 가상 자료 평가를 보여 줍니다. 이 화면은 운영 앱 메뉴와 연결되어 있지 않습니다.'));
      return { model: null, render: function () {}, renders: function () { return 0; } };
    }
    if (!G || !X) { host.appendChild(E('div', 'gate-off', '평가 엔진을 불러오지 못해 판단 보류합니다.')); return { model: null, render: function () {}, renders: function () { return 0; } }; }
    var model = createModel(G, X), renders = 0, fromList = false;
    function tag(text, cls) { return E('span', 'tag ' + cls, text); }
    function ul(items, cls) { var u = E('ul', cls || 'items'); items.forEach(function (t) { u.appendChild(E('li', null, t)); }); return u; }
    function section(title, body) { var s = E('section', 'block'); s.appendChild(E('h3', null, title)); s.appendChild(body); return s; }
    function perfLine() { var s = model.stats(); return '가상 평가 ' + model.results().length + '건 · 계산 ' + s.computed + '회 · 재사용 ' + s.cacheHits + '회 · 첫 평가 ' + s.firstMs + 'ms(이 기기·이 브라우저 측정, 목표치 검증 아님) · 화면 전환 ' + renders + '회'; }
    function listView() {
      var wrap = E('div', 'view list');
      wrap.appendChild(E('p', 'muted', '평가 기준시각(가상 고정): ' + X.NOW_ISO.slice(0, 10) + ' · 모든 기업·숫자·출처는 가상 자료입니다.'));
      model.results().forEach(function (r) {
        var a = r.a, p = a.priceRelation || {}, card = E('article', 'card co');
        var head = E('div', 'co-head');
        var nm = E('div', 'co-name'); nm.appendChild(E('strong', null, (a.name || '이름 없음') + ' · ' + (a.ticker || '?'))); nm.appendChild(E('span', 'scen', r.label));
        head.appendChild(nm); head.appendChild(tag('가상 자료', 'syn')); card.appendChild(head);
        var tags = E('div', 'tags'); tags.appendChild(tag(a.stateKo, STATE_CLS[a.state] || 'hold')); tags.appendChild(tag('의견: ' + a.opinion, 'plain'));
        if (caution(a)) tags.appendChild(tag('주의', 'bad'));
        card.appendChild(tags);
        card.appendChild(E('p', 'line', SIGNAL_KO[p.signal] || SIGNAL_KO.none));
        card.appendChild(E('p', 'line', valuationLine(a)));
        var b = E('button', 'open', '자세히 보기'); b.type = 'button'; b.setAttribute('data-id', r.id);
        b.addEventListener('click', function () { fromList = true; win.location.hash = 'd=' + r.id; });
        card.appendChild(b); wrap.appendChild(card);
      });
      return wrap;
    }
    function detailView(r) {
      var a = r.a, p = a.priceRelation || {}, wrap = E('div', 'view detail');
      var back = E('button', 'back-list', '← 목록으로'); back.type = 'button';
      back.addEventListener('click', function () { if (fromList && win.history) { fromList = false; win.history.back(); } else win.location.hash = ''; });
      wrap.appendChild(back);
      var card = E('article', 'card');
      var head = E('div', 'co-head'); head.appendChild(E('h2', null, (a.name || '이름 없음') + ' · ' + (a.ticker || '?'))); head.appendChild(tag('가상 자료', 'syn')); card.appendChild(head);
      card.appendChild(E('p', 'scen', r.label));
      var tags = E('div', 'tags'); tags.appendChild(tag(a.stateKo, STATE_CLS[a.state] || 'hold')); tags.appendChild(tag('의견: ' + a.opinion, 'plain')); if (caution(a)) tags.appendChild(tag('주의', 'bad')); card.appendChild(tags);
      card.appendChild(E('p', 'reason', '판정 이유: ' + a.reason));
      if (a.asOf) card.appendChild(E('p', 'muted', '재무 기준일(가상 결산) ' + a.asOf + (a.fundamentalLabelKo ? ' · 재무 필터 라벨 ' + a.fundamentalLabelKo : '')));
      var cl = cautionLines(a); if (cl.length) card.appendChild(section('주의 근거', ul(cl, 'items warnlist')));
      var pr = E('div'); pr.appendChild(E('p', 'line', SIGNAL_KO[p.signal] || SIGNAL_KO.none)); if (p.signals && p.signals.length) pr.appendChild(ul(p.signals));
      pr.appendChild(E('p', 'line', p.text || '')); pr.appendChild(E('p', 'line', valuationLine(a)));
      if (p.conflicts && p.conflicts.length) pr.appendChild(E('p', 'line', '상충 신호: ' + p.conflicts.join(' · ')));
      if (p.scenario) pr.appendChild(E('p', 'scenario', p.scenario));
      card.appendChild(section('관련 가격 신호', pr));
      if (a.domains && a.domains.length) {
        var dl = E('div', 'domains');
        a.domains.forEach(function (d) {
          var box = E('div', 'domain'), h = E('div', 'domain-head'); h.appendChild(E('strong', null, d.no + '. ' + d.name)); h.appendChild(tag(d.statusKo, { pass: 'ok', warn: 'warn', fail: 'bad' }[d.status] || 'hold')); box.appendChild(h);
          box.appendChild(E('p', 'line', '근거: ' + d.evidence)); box.appendChild(E('p', 'line', '반론: ' + d.counter));
          if (d.unknowns && d.unknowns.length) box.appendChild(E('p', 'line muted', '미확인: ' + d.unknowns.join(' · ')));
          dl.appendChild(box);
        });
        card.appendChild(section('6개 영역', dl));
      }
      card.appendChild(section('보유할 이유', a.reasonsToHold && a.reasonsToHold.length ? ul(a.reasonsToHold) : E('p', 'muted', '없음(판단 보류)')));
      card.appendChild(section('위험·반론', a.risks && a.risks.length ? ul(a.risks) : E('p', 'muted', '없음(판단 보류)')));
      card.appendChild(section('변경사항', a.changes && a.changes.length ? ul(a.changes) : E('p', 'muted', '직전 평가 대비 변경 없음 또는 직전 평가 없음')));
      card.appendChild(section('출처·기준일(가상)', a.sources && a.sources.length ? ul(a.sources.map(function (s) { return s.kind + ' · ' + s.ref + ' · ' + s.asOf; })) : E('p', 'muted', '출처 없음(판단 보류)')));
      if (a.unknowns && a.unknowns.length) card.appendChild(section('미확인·누락', ul(a.unknowns)));
      var gates = E('div'); gates.appendChild(E('p', 'line', '매수 검토 게이트: 닫힘 — 빠진 것: ' + ((p.buyGate && p.buyGate.missing) || []).join(' · ')));
      gates.appendChild(E('p', 'line', '매도·축소 검토 게이트: 닫힘 — 빠진 것: ' + ((p.sellGate && p.sellGate.missing) || []).join(' · ')));
      card.appendChild(section('검토 게이트', gates));
      if (a.auxScore) card.appendChild(E('p', 'muted', '참고 점수 ' + (a.auxScore.value == null ? '없음' : a.auxScore.value) + ' — ' + (a.auxScore.note || '상태 결정에 쓰지 않음')));
      wrap.appendChild(card);
      return wrap;
    }
    function render() {
      renders++;
      while (host.firstChild) host.removeChild(host.firstChild);
      var id = parseHash(win.location.hash), r = id ? model.find(id) : null;
      host.appendChild(r ? detailView(r) : listView());
      host.appendChild(E('p', 'perf', perfLine()));
    }
    win.addEventListener('hashchange', function () { render(); if (win.scrollTo) try { win.scrollTo(0, 0); } catch (e) { /* jsdom */ } });
    render();
    return { model: model, render: render, renders: function () { return renders; } };
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('lab')) mount(document, window, window.HASGreatCompanies || null, window.HASGreatCompaniesFixtures || null);
  return Object.freeze({ gateOn: gateOn, valuationLine: valuationLine, cautionLines: cautionLines, caution: caution, parseHash: parseHash, createModel: createModel, mount: mount, VAL_REASON_KO: VAL_REASON_KO });
});
