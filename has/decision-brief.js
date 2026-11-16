/* HAS — 위험관리 상단 "오늘의 투자 판단" 요약과 같은 버튼 펼치기/접기 (GPT-20261116-1030).
   읽기 전용: 브리핑 계산 결과(advisor-panel compute)만 받아 분류·표시한다. 저장소·네트워크·주문 없음, 입력을 바꾸지 않는다.
   분류 원칙: 규칙 엔진(advisor-core)이 근거를 모두 갖춰 낸 의견만 후보로 센다 — '매수 검토'(재무·투자 논리 이상 없음 + 가격 조건),
   '비중 축소 검토'(가치·재무·경쟁력·비용·재진입 위험 검토 완료) → 매도 검토, '보유'(재무·투자 논리 이상 없음) → 장기보유.
   그 밖의 모든 의견·알 수 없는 값, 그리고 verify() 검증 계약(자료 신뢰성·근거·반론·출처 사실·기준 시각·실제/합성·보유 여부·상충)을 못 넘은 의견은 판단 보류(사유 표시). 가격 하락·고점 근접만으로는 어떤 후보도 되지 않는다(엔진이 판단 보류로 냄).
   가격 신뢰도·중요 위험 한 줄은 접힌 상태에서도 항상 보인다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASDecisionBrief = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KINDS = Object.freeze([
    { key: 'buy', opinion: '매수 검토', title: '매수 검토', empty: '검증된 매수 검토 후보 0건' },
    { key: 'sell', opinion: '비중 축소 검토', title: '매도 검토', empty: '검증된 매도(비중 축소) 검토 후보 0건' },
    { key: 'hold', opinion: '보유', title: '장기보유', empty: '재무·투자 논리가 확인된 장기보유 0건' }
  ]);
  var IMPORTANT = Object.freeze(['concentration', 'loss', 'cash-low']);
  var NOTE = '가격 하락·고점 근접만으로는 후보가 되지 않습니다. 재무·투자 논리·출처·기준일이 확인된 규칙 엔진 의견만 셉니다. 매수·매도 결정과 주문은 직접 하십시오.';
  function str(x) { return typeof x === 'string' ? x : ''; }
  function first(a) { return Array.isArray(a) && a.length ? str(typeof a[0] === 'object' && a[0] ? a[0].text : a[0]) : ''; }
  function texts(a) { return Array.isArray(a) ? a.map(function (x) { return str(typeof x === 'object' && x ? x.text : x).trim(); }).filter(Boolean) : []; }
  /* 검증된 후보 계약(fail-closed, GPT-REVIEW-risk-briefing-20261116-1230 CR-2): 원본 엔진·가드를 통과했더라도 여기서 다시 확인한다.
     하나라도 빠지거나 상충하면 후보로 세지 않고 판단 보류 + 사유. 반환: 보류 사유 문자열 또는 ''(통과). */
  function verify(a, k, brief) {
    var b = str(a.basis), bb = str(brief.basis);
    if (b !== 'real' && b !== 'synthetic') return '자료 구분(실제/합성) 없음';
    if (b === 'synthetic' && bb !== 'synthetic') return '실제 화면에 합성 자료 의견';
    if (b === 'real' && bb === 'synthetic') return '합성 화면에 실제 자료 의견';
    // CR-4: 상위 브리핑도 실제/합성이 확정돼야 하고 조언과 명시적으로 같아야 함(누락·빈 값 = 보류)
    if (bb !== 'real' && bb !== 'synthetic') return '브리핑 자료 구분(실제/합성) 없음';
    if (b !== bb) return '브리핑과 의견의 자료 구분 불일치';
    if (!a.dataQuality || a.dataQuality.ok !== true) return '자료 신뢰성 미확인';
    if (!texts(a.reasonsFor).length) return '근거 없음';
    if (!texts(a.reasonsAgainst).length) return '반론 없음';
    if (!Array.isArray(a.facts) || !a.facts.length || a.facts.some(function (f) { return !f || typeof f !== 'object' || !str(f.text).trim() || !str(f.source).trim(); })) return '출처가 확인된 사실 없음';
    var t = Date.parse(str(a.asOf)); if (!str(a.asOf) || isNaN(t)) return '기준 시각 없음';
    // CR-4: 판단 시각(brief.generatedAt)은 필수 — 없거나 손상이면 미래 여부를 확인할 수 없으므로 보류
    var g = Date.parse(str(brief.generatedAt)); if (!str(brief.generatedAt) || isNaN(g)) return '브리핑 판단 시각 없음';
    if (t > g + 60000) return '기준 시각이 미래';
    var held = !!(a.holding && a.holding.held === true);
    if ((k === 'sell' || k === 'hold') && !held) return k === 'sell' ? '미보유 종목의 매도 검토' : '미보유 종목의 장기보유';
    return '';
  }
  /* CR-3: 같은 종목(다계좌·중복)의 모든 기록을 검사 — 한 건이라도 검증 실패하거나 보유 여부·기준 시각·시장·자료 구분이
     서로 다르면 종목 전체를 판단 보류. 순서와 무관. 유효하고 속성이 같은 중복은 1건으로 센다. */
  function held(x) { return !!(x.holding && x.holding.held === true); }
  function verifyGroup(g, k, brief) {
    for (var i = 0; i < g.length; i++) { var w = verify(g[i], k, brief); if (w) return g.length > 1 ? '같은 종목 ' + g.length + '건 중 검증 실패: ' + w : w; }
    if (g.length < 2) return '';
    var a = g[0], ta = Date.parse(str(a.asOf));
    for (var j = 1; j < g.length; j++) {
      var x = g[j];
      if (held(x) !== held(a)) return '같은 종목 기록 상충(보유 여부)';
      if (Date.parse(str(x.asOf)) !== ta) return '같은 종목 기록 상충(기준 시각)';
      if (str(x.market) !== str(a.market)) return '같은 종목 기록 상충(시장)';
      if (str(x.basis) !== str(a.basis)) return '같은 종목 기록 상충(실제/합성)';
    }
    return '';
  }
  /* brief: briefing-model 결과. 반환값은 새 객체(입력 불변). */
  function classify(brief) {
    var out = { buy: [], sell: [], hold: [], pending: [], risks: [], checks: [], total: 0, ok: false };
    if (!brief || typeof brief !== 'object') return out;
    var advices = [].concat(Array.isArray(brief.opinions) ? brief.opinions : [], Array.isArray(brief.buyCandidates) ? brief.buyCandidates : []);
    // CR-3: 프로토타입 없는 맵 — 'constructor'·'__proto__' 같은 티커도 일반 키로만 다룬다
    var groups = Object.create(null), order = [];
    advices.forEach(function (a) {
      if (!a || typeof a !== 'object' || typeof a.ticker !== 'string' || !a.ticker) return;
      if (!groups[a.ticker]) { groups[a.ticker] = []; order.push(a.ticker); } groups[a.ticker].push(a);
    });
    order.forEach(function (tk) {
      var g = groups[tk], a = g[0]; out.total++;
      var item = { ticker: tk, opinion: str(a.opinion), held: !!(a.holding && a.holding.held === true), reason: '', against: first(a.reasonsAgainst), asOf: str(a.asOf || a.generatedAt), basis: str(a.basis) };
      var k = null; KINDS.forEach(function (x) { if (x.opinion === a.opinion) k = x.key; });
      var why = '';
      // 같은 종목에 서로 다른 의견이 있으면 상충 → 판단 보류
      if (g.some(function (x) { return str(x.opinion) !== item.opinion; })) why = '같은 종목 의견 상충';
      else if (k) why = verifyGroup(g, k, brief);
      if (k && !why) { item.reason = texts(a.reasonsFor)[0]; item.verified = true; out[k].push(item); }
      else { item.reason = why || item.against || first(a.unknown) || '근거 부족'; item.verified = false; out.pending.push(item); }
    });
    (Array.isArray(brief.risks) ? brief.risks : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return; var t = { id: str(r.id), type: str(r.type), text: str(r.text), basis: str(r.basis) };
      (IMPORTANT.indexOf(t.type) >= 0 ? out.risks : out.checks).push(t);
    });
    out.ok = true; return out;
  }
  function summaryText(c) {
    return '매수 검토 ' + c.buy.length + ' · 매도 검토 ' + c.sell.length + ' · 장기보유 ' + c.hold.length + ' · 판단 보류 ' + c.pending.length + ' · 중요 위험 ' + c.risks.length;
  }

  /* ---------- 화면(브라우저 전용) ---------- */
  var openState = {}, registry = [];
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var uid = 0;
  /* 같은 버튼 1회 → 펼침, 다시 1회 → 접힘. details/summary(키보드 Enter/Space·터치·스크린리더 기본 동작) + 버튼 모양·문구·aria-expanded 동기화. */
  function wire(d, key, body) {
    var s = d.querySelector(':scope > summary'); if (!s) return d;
    s.classList.add('hdb-toggle'); s.setAttribute('role', 'button');
    if (body) { if (!body.id) body.id = 'hdb-body-' + (++uid); s.setAttribute('aria-controls', body.id); }
    d.setAttribute('data-hdb-key', key);
    function sync() { var o = d.open; s.textContent = o ? '접기 ▲' : '펼치기 ▼'; s.setAttribute('aria-expanded', o ? 'true' : 'false'); openState[key] = o; }
    // 클릭(터치·Enter·Space 모두 click으로 들어옴)에서 직접 열고 닫아 문구·aria-expanded가 즉시 일치하게 한다.
    s.addEventListener('click', function (e) { e.preventDefault(); d.open = !d.open; sync(); });
    d.addEventListener('toggle', sync); d.open = !!openState[key]; sync();
    registry.push(d); return d;
  }
  function collapsible(key, label) { var d = el('details', 'hdb-det'); d.appendChild(el('summary', '', '펼치기 ▼')); if (label) d.querySelector('summary').setAttribute('aria-label', label); return d; }
  function prune() { registry = registry.filter(function (d) { return d.isConnected; }); }
  function closeAll() { prune(); openState = {}; registry.forEach(function (d) { d.open = false; }); }
  function onTabChange() { closeAll(); }
  function item(it, kind) {
    var li = el('div', 'hdb-item'); li.setAttribute('data-testid', 'hdb-item-' + kind);
    var row = el('div', 'hdb-row'); row.appendChild(el('b', '', it.ticker)); row.appendChild(el('span', 'hdb-op', it.opinion || '판단 보류')); li.appendChild(row);
    var d = collapsible('item|' + kind + '|' + it.ticker, it.ticker + ' 상세 근거'); var body = el('div', 'hdb-body');
    body.appendChild(el('div', '', (kind === 'pending' ? '보류 사유: ' : '근거: ') + it.reason));
    if (kind !== 'pending') body.appendChild(el('div', '', '반론·제약: ' + (it.against || '반대 근거는 자료에서 확인되지 않음(검토 필요)')));
    body.appendChild(el('div', 'hdb-note', '기준: 앱을 연 시점의 내 기록 점검' + (it.asOf ? ' · ' + it.asOf : '') + ' · 실제 시장 감시 아님'));
    d.appendChild(body); li.appendChild(wire(d, 'item|' + kind + '|' + it.ticker, body)); return li;
  }
  function renderStrip(box, computed, openStaff) {
    prune(); box.replaceChildren(); box.classList.add('hdb'); box.setAttribute('role', 'region'); box.setAttribute('aria-label', '오늘의 투자 판단');
    var c = classify(computed && computed.brief);
    var head = el('div', 'hdb-head'); var t = el('span', 'hdb-sum'); t.setAttribute('data-testid', 'hs-strip-text');
    t.appendChild(el('strong', '', '🧭 오늘의 투자 판단: '));
    t.appendChild(document.createTextNode(computed && computed.brief ? summaryText(c) : '점검 불가')); t.appendChild(el('span', 'hdb-basis', ' (내 기록 기준 · 시장 감시 아님)'));
    head.appendChild(t);
    var d = collapsible('strip', '오늘의 투자 판단 상세'); head.appendChild(d); box.appendChild(head);
    // 첫 화면(접힌 상태)에도 보이는 3분할 상태 카드 — 정확한 건수만, 종목·사유는 펼친 뒤에 (CR-1)
    var mini = el('div', 'hdb-mini'); mini.setAttribute('data-testid', 'hdb-mini');
    KINDS.forEach(function (k) {
      var m = el('div', 'hdb-mc hdb-' + k.key); m.setAttribute('data-testid', 'hdb-card-' + k.key); m.setAttribute('aria-label', k.title + ' ' + c[k.key].length + '건');
      m.appendChild(el('span', 'hdb-mc-t', k.title)); m.appendChild(el('b', 'hdb-mc-n', c[k.key].length + '건')); mini.appendChild(m);
    });
    box.appendChild(mini);
    // 중요 위험 한 줄은 접혀 있어도 항상 보인다.
    if (c.risks.length) { var w = el('div', 'hdb-risk', '⚠️ 중요 위험: ' + c.risks[0].text + (c.risks.length > 1 ? ' 외 ' + (c.risks.length - 1) + '건' : '')); w.setAttribute('role', 'alert'); w.setAttribute('data-testid', 'hdb-risk-line'); box.appendChild(w); }
    var body = el('div', 'hdb-body'); body.setAttribute('data-testid', 'hdb-body');
    var grid = el('div', 'hdb-cards');
    KINDS.forEach(function (k) {
      var card = el('section', 'hdb-card hdb-' + k.key); card.setAttribute('data-testid', 'hdb-list-' + k.key);
      card.appendChild(el('h3', '', k.title + ' ' + c[k.key].length + '건'));
      if (!c[k.key].length) card.appendChild(el('div', 'hdb-note', k.empty + (c.pending.length ? ' — 판단 보류 ' + c.pending.length + '건은 아래 사유 참고' : '')));
      c[k.key].forEach(function (it) { card.appendChild(item(it, k.key)); });
      grid.appendChild(card);
    });
    body.appendChild(grid);
    var pend = el('section', 'hdb-card hdb-pending'); pend.setAttribute('data-testid', 'hdb-card-pending'); pend.appendChild(el('h3', '', '판단 보류 ' + c.pending.length + '건'));
    var reasons = {}; c.pending.forEach(function (it) { reasons[it.reason] = (reasons[it.reason] || 0) + 1; });
    Object.keys(reasons).slice(0, 3).forEach(function (r) { pend.appendChild(el('div', 'hdb-note', '· ' + r + ' (' + reasons[r] + '건)')); });
    c.pending.forEach(function (it) { pend.appendChild(item(it, 'pending')); });
    body.appendChild(pend);
    if (c.risks.length || c.checks.length) { var rs = el('section', 'hdb-card hdb-risks'); rs.appendChild(el('h3', '', '위험·자료 확인 ' + (c.risks.length + c.checks.length) + '건'));
      c.risks.concat(c.checks).forEach(function (r) { rs.appendChild(el('div', IMPORTANT.indexOf(r.type) >= 0 ? 'hdb-warn' : 'hdb-note', r.text + (r.basis ? ' [' + r.basis + ']' : ''))); }); body.appendChild(rs); }
    body.appendChild(el('div', 'hdb-note', NOTE));
    var go = el('button', 'hdb-go', 'AI 참모에서 자세히'); go.type = 'button'; go.setAttribute('data-testid', 'hs-strip-open'); go.addEventListener('click', function (e) { e.stopPropagation(); if (openStaff) openStaff(); }); body.appendChild(go);
    d.appendChild(body); wire(d, 'strip', body);
  }
  /* 가격 신뢰도 띠: 원본(price-trust-ui, 보호 파일)이 그린 details를 같은 버튼 패턴으로만 바꾼다. 경고 문구는 그대로·항상 보임. */
  function enhancePriceTrust() {
    var box = document.getElementById('hasPriceTrust'); if (!box) return;
    var d = box.querySelector(':scope > details'); if (!d || d.getAttribute('data-hdb-key')) return;
    var body = el('div', 'hdb-body'); Array.prototype.slice.call(d.childNodes).forEach(function (n) { if (n.nodeName !== 'SUMMARY') body.appendChild(n); }); d.appendChild(body);
    d.querySelector('summary').setAttribute('aria-label', '가격 신뢰도 상세'); wire(d, 'price', body);
  }
  function install() {
    if (typeof window === 'undefined') return;
    var P = window.HASPriceTrustUI; if (P && typeof P.refresh === 'function' && !P.__hdb) { var orig = P.refresh; P.refresh = function () { var r = orig.apply(this, arguments); try { enhancePriceTrust(); } catch (e) { } return r; }; P.__hdb = true; }
    try { enhancePriceTrust(); } catch (e) { }
  }
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', install);
  return Object.freeze({ KINDS: KINDS, NOTE: NOTE, classify: classify, verify: verify, summaryText: summaryText, renderStrip: renderStrip, enhancePriceTrust: enhancePriceTrust, closeAll: closeAll, onTabChange: onTabChange, install: install });
});
