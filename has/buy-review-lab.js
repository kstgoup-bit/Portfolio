/* 매수 검토 게이트 실험실 — 합성 예시만 판정해 표시한다. 저장·전송·주문 없음. */
(function () {
  'use strict';
  var G = window.HASBuyReviewGate, F = window.HASBuyReviewFixtures;
  function node(tag, txt, cls) { var e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; }
  var SAMPLES = [
    ['SYN-A', '합성 우량기업 A (안전마진 25%)', null],
    ['SYN-B', '합성 우량기업 B (안전마진 35%)', function (d) { d.price.close = 52; d.price.crossCheck.quotes.forEach(function (q) { q.close = 52; }); }],
    ['SYN-C', '합성 기업 C (본질가치 미산정)', function (d) { d.price.close = 50; d.price.crossCheck.quotes.forEach(function (q) { q.close = 50; }); delete d.valuation; }],
    ['SYN-D', '합성 기업 D (차입 위험)', function (d) { d.riskFlags.liquidity = true; }],
    ['SYN-E', '합성 기업 E (교차검증 불일치)', function (d) { d.price.crossCheck.quotes[1].close = 61.5; }],
    ['SYN-F', '합성 기업 F (현금 미확인)', function (d) { d.price.close = 55; d.price.crossCheck.quotes.forEach(function (q) { q.close = 55; }); d.context.cash = { status: 'unknown' }; }],
    ['SYN-G', '합성 기업 G (-20% 미만)', function (d) { d.price.close = 85; d.price.crossCheck.quotes.forEach(function (q) { q.close = 85; }); }]
  ];
  var results = SAMPLES.map(function (s) {
    return G.evaluate(F.base(function (d) { F.withTicker(d, s[0]); d.name = s[1]; if (s[2]) s[2](d); }), F.NOW);
  });
  function pct(x) { return x == null ? '미산정' : x + '%'; }
  function card(r, detail) {
    var a = node('article'); a.dataset.ticker = r.ticker;
    a.appendChild(node('h3', r.name + ' (' + r.ticker + ')'));
    var st = node('span', 'AI 의견: ' + r.state, 'state'); st.dataset.state = r.state; a.appendChild(st);
    a.appendChild(node('p', '이유: ' + r.reasons.join(' · ')));
    a.appendChild(node('p', '증거 신선도: ' + (r.evidenceOldest || '없음') + ' ~ ' + (r.evidenceNewest || '없음') + ' · 합성 시험 자료(실제 시세 아님)', 'small'));
    if (!detail) return a;
    var d = node('details'); d.appendChild(node('summary', '근거·반론·무효화 조건 보기'));
    var p = r.price;
    d.appendChild(node('p', '가격: ' + (p.drawdownPct == null ? '검증 실패(' + p.reasons.join(' / ') + ')' : '52주 고점 대비 -' + p.drawdownPct + '% · 벤치마크 대비 ' + p.relativePp + '%p')));
    if (p.provenance) d.appendChild(node('p', '출처 ' + p.provenance.source + ' · ' + p.provenance.exchange + ' · ' + p.provenance.currency + ' · ' + p.provenance.priceType + ' · ' + p.provenance.asOf + ' · ' + p.provenance.adjustment, 'small'));
    var v = r.valuation;
    d.appendChild(node('p', '본질가치(보수/기준/낙관): ' + (v.status === 'computed' ? v.conservative + ' / ' + v.base + ' / ' + v.optimistic + ' ' + v.currency + ' · 보수 기준 안전마진 ' + pct(v.marginPct) : '미산정 — ' + v.reasons.join(' / '))));
    var gl = node('ul'); r.gates.forEach(function (g) { gl.appendChild(node('li', g.id + ' ' + g.label + ': ' + g.status + (g.reason ? ' — ' + g.reason : ''))); }); d.appendChild(node('p', '5게이트')); d.appendChild(gl);
    d.appendChild(node('p', '재무 위험: ' + (r.riskFlags.length ? r.riskFlags.join(', ') : '표시된 위험 없음(합성)')));
    var cl = node('ul'); r.counterArguments.forEach(function (t) { cl.appendChild(node('li', t)); }); d.appendChild(node('p', '반론')); d.appendChild(cl);
    var il = node('ul'); r.invalidation.forEach(function (t) { il.appendChild(node('li', t)); }); d.appendChild(node('p', '무효화 조건')); d.appendChild(il);
    var el = node('ul'); r.executability.items.forEach(function (x) { el.appendChild(node('li', x.label + ': ' + x.status + ' — ' + x.note)); });
    d.appendChild(node('p', '실행 가능성(투자 판단과 별도): ' + r.executability.status + ' · 수량·주문 제안 없음')); d.appendChild(el);
    d.appendChild(node('p', r.disclaimer, 'small'));
    a.appendChild(d); return a;
  }
  var today = document.getElementById('today-body'), list = document.getElementById('list-body');
  var top = G.shortlist(results);
  if (!top.length) today.appendChild(node('p', '신규 후보 없음 · 조건을 충족한 종목이 없습니다.'));
  top.forEach(function (r) { today.appendChild(card(r, true)); });
  results.forEach(function (r) { list.appendChild(card(r, true)); });
})();
