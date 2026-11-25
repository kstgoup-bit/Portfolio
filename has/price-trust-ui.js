/* HAS (stage19): 앱 상단 "가격 신뢰도" 띠. 읽기 전용 — 저장소·네트워크 사용 없음, 앱 변수(domStocks 등)는 읽기만 한다. */
(function () {
  'use strict';
  var T = window.HASPriceTrust, box = null; if (!T) return;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function stocks() {
    var out = [];
    try { (ovStocks || []).forEach(function (s) { out.push({ ticker: s.ticker, market: 'US' }); }); [domStocks, penStocks, genStocks].forEach(function (a) { (a || []).forEach(function (s) { out.push({ ticker: s.ticker, market: 'KR' }); }); }); } catch (e) { return null; }
    return out;
  }
  // KIS 대조 결과를 띠 문구에 반영(순태씨 2026-11-25). 신선도는 종가 날짜 기준, 일부만 대조했으면 '일부만'(D2, 지피 CR-2).
  // 지피 1130 CR-B1: 현재 보유 집합·최근 조회 실패를 함께 넘기고, KIS 참고 대조는 기존 가격 경고(warn·error)를 낮추지 못한다(더 나쁜 쪽 유지).
  var RANK = { ok: 0, info: 1, warn: 2, error: 3 };
  function kisSummary(list) {
    var K = window.HASKISCrossCheck; if (!K || !K.latestRow || !K.trustSummary) return null;
    return K.trustSummary(K.latestRow(), Date.now(), (list || []).some(function (x) { return x.market === 'US'; }), K.currentSet ? K.currentSet() : null, K.lastFail ? K.lastFail() : true);
  }
  function refresh() {
    box = box || document.getElementById('hasPriceTrust'); if (!box) return;
    var list = stocks(), fresh = {}; try { fresh = freshPrice || {}; } catch (e) { }
    var counts = list ? T.sessionCounts(list, fresh) : null, n = T.sourceNotice('gas-jsonp', counts, new Date().toISOString());
    var ks = n.severity === 'error' ? null : kisSummary(list), sev = ks && RANK[ks.sev] > RANK[n.severity] ? ks.sev : n.severity; box.replaceChildren(); box.className = 'hpt hpt-' + sev; box.setAttribute('role', 'note');
    var head = el('div', 'hpt-head'); head.appendChild(el('strong', '', '💱 가격 신뢰도: ')); head.appendChild(el('span', '', n.label)); if (ks) { var kl = el('div', 'hpt-kis', ks.text); kl.setAttribute('data-testid', 'hpt-kis'); head.appendChild(kl); } box.appendChild(head);
    var d = el('details'); d.appendChild(el('summary', '', '자세히 보기')); n.lines.concat([n.signalNote, '지수·위험 지표(시장 지수 조회)는 비공식 야후 주소와 제3자 중계를 거치는 별도 경로이며 역시 미검증입니다.']).forEach(function (x) { d.appendChild(el('div', 'hpt-line', x)); }); if (window.HASKISCrossCheck) { var kc = el('div'); d.appendChild(kc); window.HASKISCrossCheck.mount(kc); } box.appendChild(d);
  }
  window.HASPriceTrustUI = { refresh: refresh };
  document.addEventListener('DOMContentLoaded', refresh);
})();
