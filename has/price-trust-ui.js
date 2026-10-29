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
  function refresh() {
    box = box || document.getElementById('hasPriceTrust'); if (!box) return;
    var list = stocks(), fresh = {}; try { fresh = freshPrice || {}; } catch (e) { }
    var counts = list ? T.sessionCounts(list, fresh) : null, n = T.sourceNotice('gas-jsonp', counts, new Date().toISOString());
    box.replaceChildren(); box.className = 'hpt hpt-' + n.severity; box.setAttribute('role', 'note');
    var head = el('div', 'hpt-head'); head.appendChild(el('strong', '', '💱 가격 신뢰도: ')); head.appendChild(el('span', '', n.label)); box.appendChild(head);
    var d = el('details'); d.appendChild(el('summary', '', '자세히 보기')); n.lines.concat([n.signalNote, '지수·위험 지표(시장 지수 조회)는 비공식 야후 주소와 제3자 중계를 거치는 별도 경로이며 역시 미검증입니다.']).forEach(function (x) { d.appendChild(el('div', 'hpt-line', x)); }); box.appendChild(d);
  }
  window.HASPriceTrustUI = { refresh: refresh };
  document.addEventListener('DOMContentLoaded', refresh);
})();
