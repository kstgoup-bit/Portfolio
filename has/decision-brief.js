/* HAS — 위험관리 상단 "오늘의 투자 판단" 요약과 같은 버튼 펼치기/접기 (GPT-20261116-1030).
   읽기 전용: 브리핑 계산 결과(advisor-panel compute)만 받아 분류·표시한다. 저장소·네트워크·주문 없음, 입력을 바꾸지 않는다.
   분류 원칙: 규칙 엔진(advisor-core)이 근거를 모두 갖춰 낸 의견만 후보로 센다 — '매수 검토'(재무·투자 논리 이상 없음 + 가격 조건),
   '비중 축소 검토'(가치·재무·경쟁력·비용·재진입 위험 검토 완료) → 매도 검토, '보유'(재무·투자 논리 이상 없음) → 장기보유.
   그 밖의 모든 의견·알 수 없는 값은 판단 보류(사유 표시). 가격 하락·고점 근접만으로는 어떤 후보도 되지 않는다(엔진이 판단 보류로 냄).
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
  /* brief: briefing-model 결과. 반환값은 새 객체(입력 불변). */
  function classify(brief) {
    var out = { buy: [], sell: [], hold: [], pending: [], risks: [], checks: [], total: 0, ok: false };
    if (!brief || typeof brief !== 'object') return out;
    var advices = [].concat(Array.isArray(brief.opinions) ? brief.opinions : [], Array.isArray(brief.buyCandidates) ? brief.buyCandidates : []);
    var seen = {};
    advices.forEach(function (a) {
      if (!a || typeof a !== 'object' || typeof a.ticker !== 'string') return;
      if (seen[a.ticker]) return; seen[a.ticker] = 1; out.total++;
      var item = { ticker: a.ticker, opinion: str(a.opinion), held: !!(a.holding && a.holding.held), reason: '', against: first(a.reasonsAgainst), asOf: str(a.asOf || a.generatedAt), basis: str(a.basis) };
      var k = null; KINDS.forEach(function (x) { if (x.opinion === a.opinion) k = x.key; });
      // 장기보유는 보유 종목만, 합성 자료는 실제 후보로 세지 않는다.
      if (k === 'hold' && !item.held) k = null; if (item.basis === 'synthetic' && brief.basis !== 'synthetic') k = null;
      if (k) { item.reason = first(a.reasonsFor) || '규칙 엔진 근거'; out[k].push(item); }
      else { item.reason = item.against || first(a.unknown) || '근거 부족'; out.pending.push(item); }
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
    // 중요 위험 한 줄은 접혀 있어도 항상 보인다.
    if (c.risks.length) { var w = el('div', 'hdb-risk', '⚠️ 중요 위험: ' + c.risks[0].text + (c.risks.length > 1 ? ' 외 ' + (c.risks.length - 1) + '건' : '')); w.setAttribute('role', 'alert'); w.setAttribute('data-testid', 'hdb-risk-line'); box.appendChild(w); }
    var body = el('div', 'hdb-body'); body.setAttribute('data-testid', 'hdb-body');
    var grid = el('div', 'hdb-cards');
    KINDS.forEach(function (k) {
      var card = el('section', 'hdb-card hdb-' + k.key); card.setAttribute('data-testid', 'hdb-card-' + k.key);
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
  return Object.freeze({ KINDS: KINDS, NOTE: NOTE, classify: classify, summaryText: summaryText, renderStrip: renderStrip, enhancePriceTrust: enhancePriceTrust, closeAll: closeAll, onTabChange: onTabChange, install: install });
});
