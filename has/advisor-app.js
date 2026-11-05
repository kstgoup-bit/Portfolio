/* HAS 24단계 — AI 투자참모·알림 화면(시험용, 합성 데이터). 저장소·네트워크·타이머를 쓰지 않는다. 포폴앱에는 연결되어 있지 않다.
   포폴앱 자료는 getter 로만 읽는다(advisor-bridge). 알림은 앱 안에서만 표시되며 실제 푸시가 아니다. */
(function () {
  'use strict';
  var Q = HASQuoteModel, W = HASWatchEngine, L = HASAlertsCore, B = HASAdvisorBridge;
  var NOW = '2026-11-05T14:00:00+09:00', LATER = '2026-11-13T14:00:00+09:00';
  var $ = function (id) { return document.getElementById(id); };
  function el(t, text, cls) { var e = document.createElement(t); if (text !== undefined && text !== null) e.textContent = text; if (cls) e.className = cls; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  var DATA = { v5_gen: JSON.stringify([{ id: 1, name: '합성 국내 우량A', ticker: 'SYN-KR1', quantity: 10, avgPrice: 100, currentPrice: 60 }, { id: 2, name: '예수금', ticker: 'DEP_GEN', quantity: 1, avgPrice: 1, currentPrice: 150 }]),
    v5_ov: JSON.stringify([{ id: 3, name: '합성 미국 성장B', ticker: 'SYN-US1', quantity: 3, avgPrice: 100, currentPrice: 92 }]), v5_dom: '[]', v5_pen: '[]', v5_fx: '1', v5_cma_amount: '0' };
  var getter = function (k) { return DATA[k] === undefined ? null : DATA[k]; };
  var raw = function (o) { return Object.assign({ kind: 'close', asOfDate: '2026-11-05', asOfTime: '2026-11-05T09:00:00+09:00', fetchedAt: NOW, source: '합성 시험 공급자', verification: 'independent-verified', synthetic: true }, o); };
  var RAWS = { 'SYN-KR1': raw({ ticker: 'SYN-KR1', market: 'KR', currency: 'KRW', price: 60 }), 'SYN-US1': raw({ ticker: 'SYN-US1', market: 'US', currency: 'USD', price: 92 }),
    'SYN-KR2': raw({ ticker: 'SYN-KR2', market: 'KR', currency: 'KRW', price: 60 }), 'SYN-US2': raw({ ticker: 'SYN-US2', market: 'US', currency: 'USD', price: 55, verification: 'unverified' }) };
  var FUND = { asOfDate: '2026-09-30', source: '합성 재무', revenueGrowthPct: 8, freeCashFlow: 100, freeCashFlowPrev: 90, debtToEquity: 0.6, debtToEquityPrev: 0.6 };
  var WATCH = [{ ticker: 'SYN-KR2', name: '합성 국내 우량C', market: 'KR' }, { ticker: 'SYN-US2', name: '합성 미국 대형D(시세 미검증)', market: 'US' }];
  var mk = function (m) { return { price: 100, asOfDate: '2026-11-05', source: '합성 시험 공급자' }; };
  var ret = { stockPct: -30, benchPct: -5, periodDays: 20, asOfDate: '2026-11-05', source: '합성 시험 공급자' };
  var scenario = { fail: false, vix: 32 }, alertState = L.emptyState(), alerts = [], prevLevel = {}, acked = {}, result = null, lastNote = '';

  function externals() {
    var quotes = {}; if (!scenario.fail) Object.keys(RAWS).forEach(function (t) { var n = Q.normalize(RAWS[t]); if (n.ok) quotes[t] = n.quote; });
    var hi = {}, rt = {}, fd = {}, th = {}; Object.keys(RAWS).forEach(function (t) { hi[t] = mk(); rt[t] = ret; fd[t] = Object.assign({}, FUND); th[t] = { intact: true, note: '합성' }; });
    fd['SYN-US1'] = Object.assign({}, FUND, { freeCashFlow: -5 }); th['SYN-US1'] = { intact: false, note: '합성: 핵심 제품 경쟁력 약화' };
    return { quotes: quotes, high52w: hi, returns: rt, fundamentals: fd, thesis: th, watchlist: WATCH, market: { vix: { level: scenario.vix, change5dPct: 10, asOfDate: '2026-11-05', source: '합성 시험 공급자' } } };
  }
  function compute() { result = B.run(getter, externals(), NOW, { basis: 'synthetic' }); if (typeof window !== 'undefined') window.__advResult = result; }
  function tag(text, kind) { return el('span', text, 'tag ' + (kind || '')); }
  function opKind(o) { return o === '매수 검토' ? 'ok' : (o === '비중 축소 검토' ? 'bad' : 'warn'); }
  function list(title, arr) { var f = document.createDocumentFragment(); if (!arr || !arr.length) return f; f.appendChild(el('h3', title)); var u = el('ul'); arr.forEach(function (x) { u.appendChild(el('li', typeof x === 'string' ? x : x.text + (x.source ? ' (출처 ' + x.source + ')' : ''))); }); f.appendChild(u); return f; }
  function advCard(a, link) { var d = el('div', null, 'item'); d.setAttribute('data-testid', 'adv-' + a.ticker); var r = el('div', null, 'row'); r.appendChild(el('b', a.name)); var t = tag(a.opinion, opKind(a.opinion)); t.setAttribute('data-testid', 'op-' + a.ticker); r.appendChild(t); d.appendChild(r);
    d.appendChild(el('div', '비중 ' + (a.holding.weightPct == null ? '해당 없음' : a.holding.weightPct + '%') + ' · ' + (a.reasonsAgainst[0] || ''), 'kv'));
    if (link) { var b = el('button', '근거·반대 근거 보기'); b.setAttribute('data-testid', 'open-' + a.ticker); b.addEventListener('click', function () { location.hash = '#stock-' + a.ticker; }); d.appendChild(b); } return d; }

  function renderStaff() {
    var v = clear($('view-staff')), adv = result.advices, held = adv.filter(function (a) { return a.holding.held; }), watch = adv.filter(function (a) { return !a.holding.held; });
    var cnt = {}; adv.forEach(function (a) { cnt[a.opinion] = (cnt[a.opinion] || 0) + 1; });
    var s1 = el('section', null, 'card'); s1.setAttribute('data-testid', 'sec-summary'); s1.appendChild(el('h2', '오늘의 투자 요약'));
    s1.appendChild(el('div', '기준 ' + NOW + ' · 상태 ' + result.status, 'kv'));
    s1.appendChild(el('div', Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ') || '분석 대상 없음', 'big'));
    var use = adv.filter(function (a) { return a.dataQuality && a.dataQuality.ok; }).length; s1.appendChild(el('div', '실제 활성 감시 0개 · 합성 시험 ' + use + '개 활성 / ' + (adv.length - use) + '개 자료 부족', 'kv'));
    s1.appendChild(el('div', '실제 외부 호출 0회 · 가격은 모두 합성입니다', 'note')); var bt = el('div', null, 'btns');
    var f = el('button', '시세 조회 실패 시뮬레이션'); f.setAttribute('data-testid', 'btn-fail'); f.addEventListener('click', function () { scenario.fail = true; refresh('시세 조회가 실패했다고 가정했습니다. 확인된 시세가 없으면 모든 의견이 판단 보류입니다.'); });
    var r = el('button', '다시 조회', 'primary'); r.className = 'primary'; r.setAttribute('data-testid', 'btn-retry'); r.addEventListener('click', function () { scenario.fail = false; refresh('합성 시세를 다시 불러왔습니다.'); }); bt.appendChild(f); bt.appendChild(r); s1.appendChild(bt);
    var n = el('div', lastNote, 'warnline'); n.setAttribute('data-testid', 'app-note'); s1.appendChild(n); v.appendChild(s1);
    var s2 = el('section', null, 'card'); s2.setAttribute('data-testid', 'sec-risk'); s2.appendChild(el('h2', '보유종목 위험 경고'));
    var risky = held.filter(function (a) { return a.risks.length || a.opinion === '비중 축소 검토'; }); if (!risky.length) s2.appendChild(el('div', '확인된 위험 신호 없음 (자료 부족이면 판단 보류)', 'kv'));
    risky.forEach(function (a) { var d = advCard(a, true); d.appendChild(el('div', '위험: ' + a.risks.join(', '), 'warnline')); s2.appendChild(d); }); v.appendChild(s2);
    var s3 = el('section', null, 'card'); s3.setAttribute('data-testid', 'sec-buy'); s3.appendChild(el('h2', '관심 우량주 매수 기회 후보'));
    var cand = watch.filter(function (a) { return a.opinion === '매수 검토'; }); if (!cand.length) s3.appendChild(el('div', '지금 매수 검토 후보 없음', 'kv')); cand.forEach(function (a) { s3.appendChild(advCard(a, true)); });
    watch.filter(function (a) { return a.opinion !== '매수 검토'; }).forEach(function (a) { s3.appendChild(advCard(a, true)); }); s3.appendChild(el('div', '가격 하락만으로 후보가 되지 않습니다. 매수·매도 결정과 주문은 직접 하십시오.', 'note')); v.appendChild(s3);
    var s4 = el('section', null, 'card'); s4.setAttribute('data-testid', 'sec-cash'); s4.appendChild(el('h2', '현금·자산배분 점검'));
    s4.appendChild(el('div', '현금 비중 ' + (result.portfolio.cashPct == null ? '미확인' : result.portfolio.cashPct + '%') + ' (최소 ' + W.DEFAULTS.minCashPct + '%)', 'big'));
    result.portfolio.holdings.forEach(function (h) { s4.appendChild(el('div', h.ticker + ' 비중 ' + h.weightPct + '% (한도 ' + W.DEFAULTS.concentrationPct + '%)', 'kv')); });
    result.portfolioSignals.forEach(function (g) { s4.appendChild(el('div', g.type + ': ' + g.evidence.join(' / ') + ' (출처 ' + g.source + ')', 'warnline')); }); result.portfolioMissing.forEach(function (m) { s4.appendChild(el('div', '미확인: ' + m, 'kv')); }); v.appendChild(s4);
    var s5 = el('section', null, 'card'); s5.setAttribute('data-testid', 'sec-fresh'); s5.appendChild(el('h2', '데이터 최신성·검증 상태'));
    Object.keys(RAWS).forEach(function (t) { var q = scenario.fail ? null : Q.normalize(RAWS[t]).quote, c = q ? Q.classify(q, NOW) : null, u = Q.usableForSignals(q, NOW); var d = el('div', null, 'item'); var r2 = el('div', null, 'row'); r2.appendChild(el('b', t)); r2.appendChild(tag(c ? c.label : '미확인', c && c.kind !== 'unknown' ? 'blue' : 'warn')); d.appendChild(r2);
      d.appendChild(el('div', q ? '기준일 ' + q.asOfDate + ' · 출처 ' + q.source + ' · ' + (u.ok ? '독립 대조 완료' : '판단에 사용 불가: ' + u.why.join(', ')) : '시세 없음 — 판단에 사용 불가', u.ok ? 'kv' : 'warnline')); s5.appendChild(d); }); v.appendChild(s5);
    var s6 = el('section', null, 'card'); s6.appendChild(el('div', B.ROLES.rules, 'note')); s6.appendChild(el('div', B.ROLES.gemini, 'note')); v.appendChild(s6);
  }
  function renderDetail(t) {
    var d = clear($('view-detail')), a = result.advices.filter(function (x) { return x.ticker === t; })[0]; var back = el('button', '← 돌아가기'); back.setAttribute('data-testid', 'btn-back'); back.addEventListener('click', function () { history.back(); }); d.appendChild(back);
    if (!a) { d.appendChild(el('div', '해당 종목이 없습니다.', 'warnline')); return; }
    var c = el('section', null, 'card'); c.setAttribute('data-testid', 'detail-card'); var r = el('div', null, 'row'); r.appendChild(el('h2', a.name)); r.appendChild(tag(a.opinion, opKind(a.opinion))); c.appendChild(r);
    c.appendChild(el('div', '기준시각 ' + a.asOf + ' · 공격형 관점 ' + a.aggressive.stance + ' / 방어형 관점 ' + a.defensive.stance, 'kv'));
    c.appendChild(list('확인된 사실', a.facts)); c.appendChild(list('추정(확인되지 않음)', a.estimates)); c.appendChild(list('의견의 근거', a.reasonsFor)); c.appendChild(list('반대 근거', a.reasonsAgainst)); c.appendChild(list('확인되지 않은 정보', a.unknown));
    c.appendChild(list('주요 위험', a.risks)); c.appendChild(list('검토할 매수 조건', a.conditions.buyReview)); c.appendChild(list('검토할 매도 조건', a.conditions.sellReview)); c.appendChild(list('추가 확인이 필요한 사항', a.checks)); c.appendChild(el('div', a.notice, 'note')); d.appendChild(c);
  }
  /* 알림: 신호 → 후보 → 선택(쿨다운·상한). 신규/변화(단계 상승)/확인 완료를 구분하고 중요도(priority)순으로 정렬한다. */
  function items() { var out = [];
    result.advices.forEach(function (a) { (a.signals || []).forEach(function (g) { var kind = g.type === 'drawdown' ? null : g.type; if (kind) out.push({ id: g.id, kind: kind, ticker: a.ticker, level: g.level, dataOk: a.dataQuality.ok, evidence: g.evidence, asOfDate: g.asOfDate, source: g.source }); });
      if (a.opinion === '매수 검토') { var dg = (a.signals || []).filter(function (x) { return x.type === 'drawdown'; })[0]; if (dg) out.push({ id: 'oq|' + a.ticker, kind: 'drawdown+advice', ticker: a.ticker, level: dg.level, dataOk: true, evidence: dg.evidence, asOfDate: dg.asOfDate, source: dg.source }); } });
    result.portfolioSignals.forEach(function (g) { out.push({ id: g.id, kind: g.type, scope: g.scope || null, ticker: null, level: g.level, dataOk: true, evidence: g.evidence, asOfDate: g.asOfDate, source: g.source }); }); return out; }
  var log = '';
  function runAlerts(nowISO) { var c = L.candidates(items(), nowISO), r = L.select(c.candidates, nowISO, alertState); alertState = r.state;
    r.shown.forEach(function (a) { var p = prevLevel[a.key]; a.badge = p === undefined ? '신규' : (a.level > p ? '변화(악화)' : '신규'); prevLevel[a.key] = a.level; delete acked[a.key]; var i = alerts.findIndex(function (x) { return x.key === a.key; }); if (i >= 0) alerts[i] = a; else alerts.push(a); });
    log = '이번 점검: 새로 표시 ' + r.shown.length + '건 · 반복·상한으로 억제 ' + r.suppressed.length + '건' + (r.suppressed.length ? ' (' + r.suppressed.map(function (x) { return x.reason; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).join(' / ') + ')' : '') + ' · 후보 제외 ' + c.rejected.length + '건(자료 불충분 등)'; }
  function renderAlerts() { var v = clear($('view-alerts')), open = alerts.filter(function (a) { return !acked[a.key]; }).sort(function (a, b) { return a.priority - b.priority || b.level - a.level; }), done = alerts.filter(function (a) { return acked[a.key]; });
    $('alert-badge').textContent = open.length ? '(' + open.length + ')' : ''; var s = el('section', null, 'card'); s.appendChild(el('h2', '새 알림 · 중요도순')); s.setAttribute('data-testid', 'alerts-open');
    if (!open.length) s.appendChild(el('div', '확인할 새 알림 없음', 'kv'));
    open.forEach(function (a) { var d = el('div', null, 'item'); d.setAttribute('data-testid', 'alert'); d.setAttribute('data-priority', String(a.priority)); var r = el('div', null, 'row'); r.appendChild(el('b', a.label + (a.ticker ? ' · ' + a.ticker : ''))); r.appendChild(tag(a.badge, a.badge === '신규' ? 'blue' : 'bad')); d.appendChild(r);
      d.appendChild(el('div', a.evidence.join(' / '), 'kv')); d.appendChild(el('div', '기준일 ' + a.asOfDate + ' · 출처 ' + a.source + ' · 중요도 ' + a.priority + '순위', 'note'));
      var b = el('button', '확인 완료'); b.setAttribute('data-testid', 'btn-ack'); b.addEventListener('click', function () { acked[a.key] = true; renderAlerts(); }); d.appendChild(b); s.appendChild(d); }); v.appendChild(s);
    var s2 = el('section', null, 'card'); s2.setAttribute('data-testid', 'alerts-done'); s2.appendChild(el('h2', '확인 완료한 알림')); if (!done.length) s2.appendChild(el('div', '아직 없음', 'kv')); done.forEach(function (a) { s2.appendChild(el('div', '✔ ' + a.label + (a.ticker ? ' · ' + a.ticker : ''), 'kv')); }); v.appendChild(s2);
    var s3 = el('section', null, 'card'); s3.appendChild(el('h2', '반복 알림 제한')); s3.appendChild(el('div', '같은 신호는 ' + L.DEFAULTS.cooldownDays + '일 동안 다시 알리지 않고, 단계가 올라갈 때만 알립니다. 하루 최대 ' + L.DEFAULTS.dailyMax + '건.', 'kv'));
    var lg = el('div', log, 'note'); lg.setAttribute('data-testid', 'alert-log'); s3.appendChild(lg); var bt = el('div', null, 'btns');
    [['같은 신호 다시 점검', 'btn-again', function () { runAlerts(NOW); }], ['8일 뒤 점검', 'btn-later', function () { runAlerts(LATER); }], ['시장 위험 악화(VIX 38)', 'btn-worse', function () { scenario.vix = 38; compute(); runAlerts(NOW); renderStaff(); }]].forEach(function (x) {
      var b = el('button', x[0]); b.setAttribute('data-testid', x[1]); b.addEventListener('click', function () { x[2](); renderAlerts(); }); bt.appendChild(b); }); s3.appendChild(bt); s3.appendChild(el('div', L.DELIVERY_NOTICE, 'note')); v.appendChild(s3); }
  function refresh(note) { lastNote = note || ''; compute(); renderStaff(); renderAlerts(); route(); }
  function route() { var h = location.hash || '#staff', m = /^#stock-(.+)$/.exec(h), tab = h === '#alerts' ? 'alerts' : 'staff';
    $('view-staff').hidden = !(tab === 'staff' && !m); $('view-alerts').hidden = tab !== 'alerts'; $('view-detail').hidden = !m; $('tab-staff').setAttribute('aria-selected', String(tab === 'staff')); $('tab-alerts').setAttribute('aria-selected', String(tab === 'alerts'));
    if (m) renderDetail(decodeURIComponent(m[1])); window.scrollTo(0, 0); }
  $('tab-staff').addEventListener('click', function () { location.hash = '#staff'; }); $('tab-alerts').addEventListener('click', function () { location.hash = '#alerts'; });
  window.addEventListener('hashchange', route);
  compute(); runAlerts(NOW); renderStaff(); renderAlerts(); route();
})();
