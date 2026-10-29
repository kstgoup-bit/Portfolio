/* HAS (stage19): 실제 앱의 "위험관리 > 원장 시범" 화면. 읽기 전용·합성 데이터 전용.
   이 파일은 localStorage·sessionStorage·IndexedDB·캐시·네트워크를 사용하지 않는다(정적 시험으로 보호).
   추가 입력은 이 화면의 메모리에만 있고 새로고침하면 사라진다. 앱의 보유·가계부·백업 데이터를 읽지도 쓰지도 않는다. */
(function () {
  'use strict';
  var HASH = '#has-ledger-demo', root = null, M = window.HASLedgerDemoModel, L = window.KSTLedger, extra = [], formError = '', notice = '', lastAcc = 'gen', prevTab = 'dashboard';
  if (!M || !L) return;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmt(n) { var v = M.won(n); return v === null ? '계산 불가' : v.toLocaleString('ko-KR') + '원'; }
  function signed(parent, n) { var s = el('span', n < 0 ? 'hld-neg' : n > 0 ? 'hld-pos' : '', fmt(n)); parent.appendChild(s); }
  function kv(dl, k, v, n) { dl.appendChild(el('dt', '', k)); var dd = el('dd'); if (typeof n === 'number') signed(dd, n); else dd.textContent = v; dl.appendChild(dd); }
  function trades() { return M.SAMPLE_TRADES.concat(extra); }
  function render() {
    if (!root) return; root.replaceChildren();
    root.appendChild(el('h2', '', '🧪 원장 시범 (읽기 전용)'));
    var b = el('div', 'hld-banner', M.BANNER); b.setAttribute('role', 'status'); b.setAttribute('data-testid', 'hld-banner'); root.appendChild(b);
    root.appendChild(el('p', 'hld-note', '이 화면의 숫자는 모두 예시용 합성 거래에서 나온 것입니다. 내 보유 종목·가계부·백업은 이 화면에 사용되지도 저장되지도 않습니다. 아래에 추가하는 시험 거래도 이 화면 메모리에만 있고 새로고침하면 사라집니다.'));
    var m = M.buildModel(trades(), L);
    if (!m.ok) { var er = el('div', 'hld-err'); er.setAttribute('role', 'alert'); er.textContent = '계산 오류: ' + m.errors.map(function (e) { return e.message; }).join(' / '); root.appendChild(er); }
    m.accounts.forEach(function (a) {
      var card = el('section', 'hld-card'); card.setAttribute('data-testid', 'hld-account-' + a.account);
      var h = el('h3', '', a.label + ' 계좌'); h.appendChild(el('span', 'hld-badge', '합성 · 실제 수익 아님')); card.appendChild(h);
      a.rows.forEach(function (r) {
        card.appendChild(el('div', '', r.name + ' (' + r.ticker + ', ' + (r.currency || '?') + ')'));
        var dl = el('dl', 'hld-kv'); dl.setAttribute('data-testid', 'hld-row-' + r.ticker);
        kv(dl, '보유 수량', r.qty + '주'); kv(dl, '평균 매입단가(원화)', r.avgKRW == null ? '보유 없음' : fmt(r.avgKRW)); kv(dl, '취득원가', fmt(r.costKRW));
        kv(dl, '실현손익', null, r.realizedKRW); kv(dl, '배당(세후)', fmt(r.dividendsKRW)); kv(dl, '수수료·세금', fmt(r.feesKRW + r.taxesKRW));
        if (!r.calculable) kv(dl, '상태', '계산 불가: ' + r.issues.join('; '));
        card.appendChild(dl);
        var d = el('details'); d.appendChild(el('summary', '', '계산 근거 보기')); var ul = el('ul', 'hld-basis'); r.basis.forEach(function (x) { ul.appendChild(el('li', '', x)); }); d.appendChild(ul); card.appendChild(d);
      });
      var sum = el('dl', 'hld-kv hld-sum'); sum.setAttribute('data-testid', 'hld-sum-' + a.account);
      kv(sum, '계좌 합계 취득원가', fmt(a.sum.costKRW)); kv(sum, '계좌 합계 실현손익', null, a.sum.realizedKRW); kv(sum, '계좌 합계 배당(세후)', fmt(a.sum.dividendsKRW)); card.appendChild(sum);
      card.appendChild(el('div', 'hld-note', '※ 합성 데이터입니다. 실제 보유·수익이 아닙니다.'));
      root.appendChild(card);
    });
    // 기존 보유 → 원장 이전 미리보기 (합성 보유만 사용, 저장 없음)
    if (window.HASMigrationSim) {
      var SYN = { gen: [{ id: 1, name: '합성 일반주', ticker: 'AAA', quantity: 10, avgPrice: 1000 }], ov: [{ id: 3, name: '합성 해외주', ticker: 'CCC', quantity: 2, avgPrice: 50 }], pen: [{ id: 4, name: '합성 연금주', ticker: 'DDD', quantity: 0, avgPrice: 10 }] };
      var mp = window.HASMigrationSim.preview(SYN, { fxUsd: 1300 }), mc = el('section', 'hld-card'); mc.setAttribute('data-testid', 'hld-migration');
      mc.appendChild(el('h3', '', '기존 보유 → 원장 이전 미리보기 (합성 보유 · 저장 안 함)'));
      mc.appendChild(el('p', 'hld-note', '실제 보유는 읽지 않습니다. 보유 잔고만으로 과거 매매를 만들어 채우지 않으며, 거래 이력·실현손익은 "이력 미확인"으로 둡니다. 쓰기 ' + mp.writes + '건.'));
      var mt = el('table', 'hld-support'), mh = el('tr'); ['계좌·종목', '수량', '평균단가', '원화 원가(근사)', '이력'].forEach(function (x) { mh.appendChild(el('th', '', x)); }); mt.appendChild(mh);
      mp.rows.forEach(function (r) { var tr = el('tr'); [r.accountLabel + ' ' + r.ticker, String(r.qty), r.avgLocal === null ? '없음' : r.avgLocal + ' ' + r.currency, r.costKRWApprox === null ? '계산 불가' : r.costKRWApprox.toLocaleString('ko-KR') + '원', r.historyStatus].forEach(function (x) { tr.appendChild(el('td', '', x)); }); mt.appendChild(tr); });
      mc.appendChild(mt); mp.excluded.forEach(function (x) { mc.appendChild(el('p', 'hld-note', '제외: ' + x.where + ' — ' + x.reason)); }); root.appendChild(mc);
    }
    // 지원 현황
    var sc = el('section', 'hld-card'); sc.appendChild(el('h3', '', '지원 현황 (미지원은 계산하지 않습니다)')); var tb = el('table', 'hld-support'); tb.setAttribute('data-testid', 'hld-support');
    var hr = el('tr'); ['항목', '상태', '설명'].forEach(function (x) { hr.appendChild(el('th', '', x)); }); tb.appendChild(hr);
    M.SUPPORT.forEach(function (s) { var tr = el('tr'); tr.appendChild(el('td', '', s.item)); tr.appendChild(el('td', '', s.status)); tr.appendChild(el('td', '', s.note)); tb.appendChild(tr); }); sc.appendChild(tb); root.appendChild(sc);
    // 계산 규칙
    var rc = el('section', 'hld-card'); rc.appendChild(el('h3', '', '계산 규칙')); var ul2 = el('ul', 'hld-rules'); Object.keys(M.RULES).forEach(function (k) { ul2.appendChild(el('li', '', M.RULES[k])); }); rc.appendChild(ul2); root.appendChild(rc);
    // 메모리 전용 시험 거래
    var fc = el('section', 'hld-card'); fc.appendChild(el('h3', '', '시험 거래 추가 (메모리 전용)')); var f = el('form', 'hld-form'); f.setAttribute('data-testid', 'hld-form'); f.noValidate = true;
    function field(label, node) { var w = el('label', '', label); w.appendChild(node); f.appendChild(w); return node; }
    var acc = el('select'); [['gen', '일반(원화)'], ['ov', '해외(USD)']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; acc.appendChild(op); }); acc.name = 'account'; field('계좌', acc);
    var ty = el('select'); [['buy', '매수'], ['sell', '매도']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; ty.appendChild(op); }); ty.name = 'type'; field('유형', ty);
    var qty = el('input'); qty.name = 'qty'; qty.inputMode = 'decimal'; qty.value = '1'; field('수량', qty);
    var price = el('input'); price.name = 'price'; price.inputMode = 'decimal'; price.value = '10000'; field('가격(계좌 통화)', price);
    var fee = el('input'); fee.name = 'fee'; fee.inputMode = 'decimal'; fee.value = '0'; field('수수료', fee);
    var fx = el('input'); fx.name = 'fx'; fx.inputMode = 'decimal'; fx.value = '1300'; field('환율(해외만)', fx);
    var add = el('button', 'hld-btn primary', '시험 거래 추가'); add.type = 'submit'; add.setAttribute('data-testid', 'hld-add'); f.appendChild(add);
    var reset = el('button', 'hld-btn', '예시로 되돌리기'); reset.type = 'button'; reset.setAttribute('data-testid', 'hld-reset'); f.appendChild(reset);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); lastAcc = acc.value; var isOv = acc.value === 'ov', t = { id: 'x' + (extra.length + 1), type: ty.value, date: '2026-04-01', account: acc.value, ticker: isOv ? 'SYN-B' : 'SYN-A', name: isOv ? '합성해외B' : '합성일반A', currency: isOv ? 'USD' : 'KRW', qty: Number(qty.value), price: Number(price.value), fee: Number(fee.value) || 0 };
      if (isOv) t.fx = Number(fx.value);
      var test = M.buildModel(trades().concat([t]), L);
      if (!test.ok) { notice = ''; formError = test.errors.map(function (e) { return e.message; }).join(' / '); } else { formError = ''; extra.push(t); notice = '추가했습니다: ' + (isOv ? '해외' : '일반') + ' ' + (t.type === 'buy' ? '매수' : '매도') + ' ' + t.qty + '주 × ' + t.price + (isOv ? ' USD' : '원') + '. 바뀐 결과는 이 화면 맨 위 「' + (isOv ? '해외' : '일반') + ' 계좌」 카드에 나옵니다(추가한 시험 거래 ' + extra.length + '건).'; }
      render();
    });
    reset.addEventListener('click', function () { extra = []; formError = ''; notice = ''; render(); });
    fc.appendChild(f); if (notice && !formError) { var nt = el('div', 'hld-note', notice); nt.setAttribute('role', 'status'); nt.setAttribute('data-testid', 'hld-notice'); fc.appendChild(nt); var jump = el('button', 'hld-btn', '바뀐 숫자 보러 가기 ↑'); jump.type = 'button'; jump.setAttribute('data-testid', 'hld-jump'); jump.addEventListener('click', function () { var t = root.querySelector('[data-testid=hld-account-' + lastAcc + ']'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' }); }); fc.appendChild(jump); }
    if (formError) { var fe = el('div', 'hld-err', '추가하지 않았습니다: ' + formError); fe.setAttribute('role', 'alert'); fc.appendChild(fe); }
    fc.appendChild(el('p', 'hld-note', '추가한 거래는 저장되지 않으며 새로고침하면 사라집니다.')); root.appendChild(fc);
    var back = el('button', 'hld-btn', '← 이전 화면으로 돌아가기'); back.type = 'button'; back.setAttribute('data-testid', 'hld-back'); back.addEventListener('click', function () { window.switchTab(prevTab && prevTab !== 'ledgerdemo' ? prevTab : 'dashboard'); }); root.appendChild(back);
  }
  function onTabChange(tab) {
    if (tab === 'ledgerdemo') {
      root = document.getElementById('panel-ledgerdemo'); extra = []; formError = ''; notice = '';
      if (location.hash !== HASH) { try { history.pushState({ hasLedgerDemo: true }, '', location.pathname + location.search + HASH); } catch (e) { } }
      render();
    } else if (location.hash === HASH) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } if (root) root.replaceChildren(); }
    if (tab !== 'ledgerdemo') prevTab = tab;
  }
  window.HASLedgerDemo = { onTabChange: onTabChange };
  window.addEventListener('popstate', function () { if (location.hash === HASH && window.switchTab) window.switchTab('ledgerdemo'); });
  window.addEventListener('DOMContentLoaded', function () { if (location.hash === HASH && window.switchTab) window.switchTab('ledgerdemo'); });
})();
