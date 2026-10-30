/* 가계부 연도별 총액 카드 (읽기 전용 표시). v5_ledger는 읽기만 하며 어떤 저장소에도 쓰지 않는다. 네트워크 없음.
   집계 단위: 저장된 월 키(YYYY-MM)의 연도. 월 요약과 같은 값(수입·지출·투자 합, 잔액=수입-지출-투자). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASLedgerYears = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KINDS = ['income', 'expense', 'invest'];
  function sumList(l) { var s = 0; if (Array.isArray(l)) l.forEach(function (x) { var a = x && Number(x.amount); if (isFinite(a)) s += a; }); return s; }
  /* data = {'2026-10':{income:[{amount}],expense:[],invest:[]}} → [{year, income, expense, invest, balance, months}] 최신 연도 먼저 */
  function summarize(data) {
    var by = Object.create(null);
    if (data && typeof data === 'object') Object.keys(data).forEach(function (k) {
      var m = /^(\d{4})-(\d{2})$/.exec(k); if (!m || !data[k] || typeof data[k] !== 'object') return;
      var y = by[m[1]] || (by[m[1]] = { year: m[1], income: 0, expense: 0, invest: 0, months: 0 });
      KINDS.forEach(function (t) { y[t] += sumList(data[k][t]); });
      y.months++;
    });
    return Object.keys(by).sort().reverse().map(function (k) { var y = by[k]; y.balance = y.income - y.expense - y.invest; return y; });
  }
  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function html(rows, openYear) {
    if (!rows.length) return '<div style="font-size:14px;color:#333">저장된 가계부 기록이 없습니다.</div>';
    return rows.map(function (y) {
      var bal = (y.balance >= 0 ? '+' : '') + won(y.balance);
      return '<details data-year="' + esc(y.year) + '"' + (String(y.year) === String(openYear) ? ' open' : '') + ' style="margin-bottom:8px;background:var(--sky-bg);border-radius:10px;padding:0">' +
        '<summary style="cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;font-size:15px;font-weight:900;color:#333"><span>' + esc(y.year) + '년 <span style="font-size:12px;font-weight:700">(' + y.months + '개월 기록)</span></span><span style="color:' + (y.balance >= 0 ? '#1565c0' : '#c62828') + '">' + bal + '</span></summary>' +
        '<div class="ldg-summary" style="padding:0 10px 10px">' +
        '<div class="ldg-sum-box" style="background:#fff"><div class="ldg-sum-lbl">총 수입</div><div class="ldg-sum-val" style="color:#1565c0">' + won(y.income) + '</div></div>' +
        '<div class="ldg-sum-box" style="background:#fff"><div class="ldg-sum-lbl">총 지출</div><div class="ldg-sum-val" style="color:#c62828">' + won(y.expense) + '</div></div>' +
        '<div class="ldg-sum-box" style="background:#fff"><div class="ldg-sum-lbl">총 투자</div><div class="ldg-sum-val" style="color:#7b1fa2">' + won(y.invest) + '</div></div>' +
        '<div class="ldg-sum-box" style="background:#fff"><div class="ldg-sum-lbl">잔액</div><div class="ldg-sum-val" style="color:' + (y.balance >= 0 ? '#1565c0' : '#c62828') + '">' + bal + '</div></div>' +
        '</div></details>';
    }).join('');
  }
  var api = { summarize: summarize, html: html };
  if (typeof document === 'undefined') return api;
  function render() {
    try {
      var panel = document.getElementById('panel-ledger'); if (!panel) return;
      var card = document.getElementById('ldgYearCard');
      if (!card) {
        var first = panel.querySelector('.ldg-card'); if (!first) return;
        card = document.createElement('div'); card.className = 'ldg-card'; card.id = 'ldgYearCard';
        card.innerHTML = '<div class="ldg-title" style="color:#00897b;margin:0 0 10px">📅 연도별 총액</div><div id="ldgYearList"></div>';
        first.parentNode.insertBefore(card, first.nextSibling);
      }
      var data = {}; try { data = JSON.parse(localStorage.getItem('v5_ledger') || '{}'); } catch (e) {}
      var openDetails = {}; card.querySelectorAll('details').forEach(function (d) { openDetails[d.getAttribute('data-year')] = d.open; });
      var rows = summarize(data), sel = document.getElementById('ldgMonth'), y = sel && sel.value ? sel.value.slice(0, 4) : String(new Date().getFullYear());
      var list = card.querySelector('#ldgYearList'); list.innerHTML = html(rows, y);
      list.querySelectorAll('details').forEach(function (d) { var k = d.getAttribute('data-year'); if (k in openDetails) d.open = openDetails[k]; });
    } catch (e) { /* 표시 실패는 가계부 동작에 영향 주지 않음 */ }
  }
  function hook() {
    var G = typeof window !== "undefined" ? window : globalThis; var orig = G.renderLedger;
    if (typeof orig !== 'function' || orig.__hasYears) { render(); return; }
    var w = function () { var r = orig.apply(this, arguments); render(); return r; };
    w.__hasYears = true; G.renderLedger = w; render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  return api;
});
