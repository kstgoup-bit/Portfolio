/* HAS 26단계 — 갤럭시 시험 모드 화면. 안전장치(HASGalaxyTestGuard.decide)가 허용할 때만 합성 자료를 넣는다. 네트워크·쿠키 사용 없음. */
(function () {
  'use strict';
  var G = window.HASGalaxyTestGuard, D = window.HASGalaxyTestData;
  function $(id) { return document.getElementById(id); }
  function status() { var d = G.decide(window.location, window.localStorage), s = $('gtStatus'); s.textContent = (d.allowed ? '✅ ' : '⛔ ') + d.message; s.className = 'note ' + (d.allowed ? 'ok' : 'bad'); $('gtStart').disabled = !d.allowed; $('gtClear').disabled = !(window.localStorage.getItem(G.MARKER) === '1'); return d; }
  $('gtStart').addEventListener('click', function () {
    var d = status(); if (!d.allowed) return; /* 다시 한 번 점검한 뒤에만 기록 */
    try { D.KEYS.forEach(function (k) { var v = D.DATA[k]; window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }); window.localStorage.setItem(G.MARKER, '1'); }
    catch (e) { $('gtMsg').textContent = '시험 자료를 저장하지 못했습니다(저장공간 오류). 아무 것도 열지 않습니다.'; return; }
    window.location.href = '../portfolio_v5.html#has-staff';
  });
  $('gtClear').addEventListener('click', function () {
    if (window.localStorage.getItem(G.MARKER) !== '1') { $('gtMsg').textContent = '시험 자료 표시가 없어 아무 것도 지우지 않았습니다.'; return; }
    try { D.KEYS.forEach(function (k) { window.localStorage.removeItem(k); }); window.localStorage.removeItem(G.MARKER); $('gtMsg').textContent = '이 주소의 시험 자료를 지웠습니다. 이제 홈 화면의 원래 앱을 여세요.'; } catch (e) { $('gtMsg').textContent = '지우지 못했습니다: ' + e.message; } status();
  });
  $('gtRehearsal').addEventListener('click', function () { window.location.href = 'restore-rehearsal.html'; });
  status();
})();
