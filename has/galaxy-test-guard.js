/* HAS 26단계 — 갤럭시 시험 모드 안전장치(순수 함수). 시험용 합성 자료는 "실제 앱과 저장공간을 공유할 수 없는 주소"에서만, 그리고 사용자 기록이 비어 있을 때만 넣을 수 있다.
   브라우저 저장공간은 주소(프로토콜+호스트+포트) 단위로 나뉘고 경로(/Portfolio/…)로는 나뉘지 않는다. 실제 앱이 https://kstgoup-bit.github.io 에 있으면 같은 github.io 의 다른 경로에서 시험 자료를 넣는 순간 실제 기록이 덮어써진다.
   그래서 github.io 등 공개 주소·https 는 전부 거절하고, 파일·localhost·사설망 주소만 허용한다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASGalaxyTestGuard = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var USER_KEYS = ['v5_gen', 'v5_dom', 'v5_ov', 'v5_pen', 'v5_div', 'v5_ledger', 'v5_deposits', 'v5_memos', 'v5_cma_amount', 'v5_nonFinAssets', 'v5_debtBank', 'v5_debtHouse', 'v5_investPrinciples'];
  var MARKER = '__has_galaxy_test_synthetic';
  function isPrivateHost(h) { return /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(h) || /^10\.\d+\.\d+\.\d+$/.test(h) || /^192\.168\.\d+\.\d+$/.test(h) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h); }
  /* 앱을 열기만 해도 생기는 기본값(수량 0 종목·빈 목록)은 사용자 기록으로 보지 않는다. 의미 있는 기록이 하나라도 있으면 그 항목 이름을 돌려준다. */
  function parse(storage, k) { var v = storage.getItem(k); if (v === null || v === '') return null; try { return JSON.parse(v); } catch (e) { return 'unparseable'; } }
  function meaningful(storage) {
    var found = [];
    ['v5_gen', 'v5_dom', 'v5_ov', 'v5_pen'].forEach(function (k) { var a = parse(storage, k); if (a === 'unparseable') found.push(k); else if (Array.isArray(a) && a.some(function (s) { return s && Number(s.quantity) > 0; })) found.push(k); });
    ['v5_div', 'v5_memos', 'v5_nonFinAssets', 'v5_debtBank', 'v5_debtHouse'].forEach(function (k) { var a = parse(storage, k); if (a === 'unparseable' || (Array.isArray(a) && a.length)) found.push(k); });
    ['v5_ledger', 'v5_deposits', 'v5_investPrinciples'].forEach(function (k) { var o = parse(storage, k); if (o === 'unparseable') found.push(k); else if (o && typeof o === 'object' && Object.keys(o).some(function (m) { var r = o[m]; return Array.isArray(r) ? r.length : (r && typeof r === 'object' ? Object.keys(r).some(function (t) { return Array.isArray(r[t]) ? r[t].length : !!r[t]; }) : !!r); })) found.push(k); });
    var cma = Number(storage.getItem('v5_cma_amount')); if (isFinite(cma) && cma > 0) found.push('v5_cma_amount');
    return found;
  }
  function originSafe(loc) { if (!loc) return false; if (loc.protocol === 'file:') return true; return loc.protocol === 'http:' && isPrivateHost(loc.hostname || ''); }
  /* storage: getItem 만 가진 객체. 반환 {allowed, reason, message} */
  function decide(loc, storage) {
    if (!originSafe(loc)) return { allowed: false, reason: 'unsafe-origin', message: '이 주소(' + (loc && loc.host ? loc.host : (loc && loc.protocol) || '알 수 없음') + ')는 실제 앱과 같은 저장공간일 수 있어 시험 자료를 넣지 않습니다. 파일 열기·컴퓨터 내 임시 서버(localhost)·같은 Wi-Fi의 사설 주소에서만 시험하세요.' };
    var marked = false, found = [];
    try { marked = storage.getItem(MARKER) === '1'; found = meaningful(storage); } catch (e) { return { allowed: false, reason: 'storage-unreadable', message: '이 주소의 저장공간을 읽을 수 없어 시험 자료를 넣지 않습니다.' }; }
    if (found.length && !marked) return { allowed: false, reason: 'existing-data', message: '이 주소의 저장공간에 이미 사용자 기록(' + found.length + '개 항목)이 있습니다. 실제 기록을 보호하기 위해 시험 자료를 넣지 않습니다.' };
    return { allowed: true, reason: marked ? 'refresh-synthetic' : 'empty', message: '시험 가능: 이 주소는 실제 앱과 분리되어 있고 기존 사용자 기록이 없습니다.' };
  }
  return Object.freeze({ USER_KEYS: USER_KEYS, MARKER: MARKER, decide: decide, originSafe: originSafe, isPrivateHost: isPrivateHost });
});
