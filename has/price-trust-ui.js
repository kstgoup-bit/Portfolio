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
  // KIS 대조 결과를 띠 문구에 반영(순태씨 2026-11-25): 최근 4일 안에 대조했으면 국내 가격 일치·불일치를 보여 준다. 미국은 KIS 대조 대상이 아니므로 따로 '미검증'.
  function kisSummary(list) {
    var K = window.HASKISCrossCheck; if (!K || !K.latestRow) return null;
    var row = K.latestRow(); if (!row || !(row.n > 0)) return null;
    var days = Math.floor((Date.now() - row.at) / 86400000), hasUS = (list || []).some(function (x) { return x.market === 'US'; }), us = hasUS ? ' · 미국 가격은 미검증' : '';
    if (!(days >= 0) || days > 4) return { text: '국내 KIS 대조가 ' + (days > 0 ? days + '일 전' : '오래전') + ' — 펼쳐서 다시 대조' + us, sev: 'warn' };
    if (row.matched === row.n) return { text: '✅ 국내 가격 KIS 대조 일치 (' + row.matched + '/' + row.n + ', ' + row.d + ' 종가)' + us, sev: hasUS ? 'info' : 'ok' };
    return { text: '⚠️ 국내 KIS 대조 불일치 ' + (row.n - row.matched) + '건' + (row.bad && row.bad.length ? '(' + row.bad.slice(0, 3).join(', ') + ')' : '') + ' — 펼쳐서 확인' + us, sev: 'warn' };
  }
  function refresh() {
    box = box || document.getElementById('hasPriceTrust'); if (!box) return;
    var list = stocks(), fresh = {}; try { fresh = freshPrice || {}; } catch (e) { }
    var counts = list ? T.sessionCounts(list, fresh) : null, n = T.sourceNotice('gas-jsonp', counts, new Date().toISOString());
    var ks = n.severity === 'error' ? null : kisSummary(list); box.replaceChildren(); box.className = 'hpt hpt-' + (ks ? ks.sev : n.severity); box.setAttribute('role', 'note');
    var head = el('div', 'hpt-head'); head.appendChild(el('strong', '', '💱 가격 신뢰도: ')); head.appendChild(el('span', '', ks ? ks.text : n.label)); box.appendChild(head);
    var d = el('details'); d.appendChild(el('summary', '', '자세히 보기')); n.lines.concat([n.signalNote, '지수·위험 지표(시장 지수 조회)는 비공식 야후 주소와 제3자 중계를 거치는 별도 경로이며 역시 미검증입니다.']).forEach(function (x) { d.appendChild(el('div', 'hpt-line', x)); }); if (window.HASKISCrossCheck) { var kc = el('div'); d.appendChild(kc); window.HASKISCrossCheck.mount(kc); } box.appendChild(d);
  }
  window.HASPriceTrustUI = { refresh: refresh };
  document.addEventListener('DOMContentLoaded', refresh);
})();
