/* KST 모바일 실험실 UI — 합성 시험 전용. 네트워크 접근·저장소 접근 없음(CSP connect-src none). 새로고침하면 잠금으로 돌아간다. */
(function () {
  'use strict';
  var L = window.KSTMobileLab, sha = window.KSTSha256, $ = function (id) { return document.getElementById(id); };
  var clock = { nowMs: function () { return Date.now(); }, today: function () { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()); } };
  var scenario = 'none', transport = null, flow = null;
  function defaultBasDt() { var d = new Date(clock.today() + 'T00:00:00Z'); do { d = new Date(d.getTime() - 86400000); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); return d.toISOString().slice(0, 10).replace(/-/g, ''); }
  function makeTransport(basDt, scn) {
    var base = L.rehearsal.createRehearsalTransport(L.universe, { basDt: basDt, format: 'xml', fault: ['429', '401', 'garbage', 'gateway30'].indexOf(scn) >= 0 ? scn : 'none' });
    var t = function (r) {
      if (scn === 'timeout') return Promise.reject(new Error('timeout ETIMEDOUT'));
      if (scn === 'network') return Promise.reject(new Error('ECONNRESET'));
      if (scn === 'empty') return Promise.resolve({ status: 200, text: '' });
      return base(r);
    };
    t.isSynthetic = true; return t;
  }
  function newFlow(scn) { var t = makeTransport($('in-basdt').value || defaultBasDt(), scn); return L.flow.createFlow({ universe: function () { return L.universe; }, transport: t, clock: clock, sha256: sha, wait: function () { return Promise.resolve(); } }); }
  flow = newFlow('none');

  function row(dl, k, v) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); }
  function renderStatus() {
    var items = L.universe.securities.map(function (s) { return { id: s.code, market: 'KR', kind: s.group === 'etf' ? 'etf' : 'stock' }; });
    var sum = L.status.summarize(items, clock.today()), c = sum.counts, dl = $('counts'); dl.textContent = '';
    row(dl, '국내 후보 주식 / ETF', (items.length - 5) + ' / 5');
    row(dl, '공식 종목 신원 검증 (실제)', c.officialIdentityVerified + '종목');
    row(dl, '실제 시세 확인', c.realPriceConfirmed + '종목');
    row(dl, '실제 감시 활성 (한국/미국)', c.activeMonitoringKR + ' / ' + c.activeMonitoringUS);
    row(dl, '데이터 없음 (DATA_UNAVAILABLE)', c.unavailable + '종목');
    $('status-note').textContent = '합성 시험 결과는 위 실제 수치에 포함되지 않습니다. 실제 호출 0회 · 인증키 0개.';
    var ul = $('samples'); ul.textContent = '';
    var samples = [
      { id: '합성-A', market: 'US', kind: 'stock', price: { origin: 'fixture', isSynthetic: true, source: '합성 fixture', baseDate: clock.today(), queriedAt: clock.today() } },
      { id: '합성-B', market: 'US', kind: 'stock', price: { origin: 'real-provider', source: '예시 공급자', baseDate: '2026-09-01', queriedAt: clock.today() } },
      { id: '합성-C', market: 'KR', kind: 'stock' }];
    samples.forEach(function (it) { var d = L.status.describe(L.status.classify(it, clock.today()), it), li = document.createElement('li'); li.textContent = d.id + ' · ' + d.label + ' · 기준일 ' + d.baseDate + ' · 출처 ' + d.source + ' · 조회 ' + d.queriedAt + ' · ' + d.note + ' · ' + d.signalText; ul.appendChild(li); });
  }
  var steps = ['prepare', 'confirm', 'running', 'result'];
  function show(step) { steps.forEach(function (s) { $('step-' + s).hidden = s !== step; }); }
  function render() {
    var v = flow.getView(), unlocked = v.state !== 'LOCKED';
    $('sec-krx').hidden = !unlocked; $('btn-unlock').hidden = unlocked; $('btn-lock').hidden = !unlocked;
    $('lock-text').textContent = unlocked ? '관리자 잠금 해제됨(모의 세션 10분). 새로고침하면 다시 잠깁니다.' : (v.reason && v.reason.indexOf('만료') >= 0 ? v.reason + ' — 다시 잠금 해제하세요.' : '잠금 상태입니다. 실제 서비스에서는 서버가 발급한 관리자 세션이 필요합니다. 이 화면은 합성 세션(10분)으로만 시험합니다.');
    $('identity-notice').textContent = v.notice;
    if (!unlocked) return;
    if (v.state === 'READY' || v.state === 'CANCELLED' || v.state === 'BLOCKED' && !v.callsUsed) show(v.state === 'BLOCKED' ? 'result' : 'prepare');
    var map = { READY: 'prepare', CONFIRMING: 'confirm', APPROVED: 'confirm', RUNNING: 'running', DONE: 'result', PARTIAL: 'result', FAILED: 'result', BLOCKED: 'result', CANCELLED: 'prepare' };
    show(map[v.state] || 'prepare');
    if (v.state === 'CONFIRMING' || v.state === 'APPROVED') {
      var ul = $('plan-list'); ul.textContent = ''; var p = v.plan;
      [['대상', '주식 ' + p.targets.stocks + '개 + ETF ' + p.targets.etfs + '개(따로 집계)'], ['기준일', p.basDt], ['최대 호출', p.maxCalls + '회 (자동 재시도 없음)'], ['모드', '합성 시험 — 실제 외부 요청 0회'], ['중단 조건', '401·403·한도 초과·권한 오류는 즉시 중단']].concat(p.warnings.map(function (w) { return ['주의', w]; }))
        .forEach(function (kv) { var li = document.createElement('li'); li.textContent = kv[0] + ': ' + kv[1]; ul.appendChild(li); });
    }
    if (map[v.state] === 'result') {
      $('result-state').textContent = '상태: ' + v.state + (v.reason ? ' — ' + v.reason : '') + ' · 사용 호출 ' + v.callsUsed + '/' + v.callsBudget + (v.diagnostic ? ' · 진단: ' + v.diagnostic : '');
      var dl = $('result-counts'); dl.textContent = '';
      if (v.result) { var t = v.result.totals; row(dl, '데이터 구분', v.result.dataLabel); row(dl, '기준일', v.result.basDt); row(dl, '조회일', v.result.queriedAt); ['stock', 'etf'].forEach(function (g) { row(dl, g === 'stock' ? '주식 검증/불일치/대기/제외' : 'ETF 검증/불일치/대기/제외', [t[g].VERIFIED, t[g].MISMATCH, t[g].PENDING, t[g].EXCLUDED].join(' / ')); }); }
      row(dl, '실제 공식 검증', v.officialVerified + '종목'); row(dl, '실제 외부 요청', v.realApiRequests + '회');
      $('result-note').textContent = v.result ? v.result.note : (v.state === 'PARTIAL' ? '누락된 쪽: ' + v.missingPages.join(', ') + ' — 남은 호출 한도 안에서만 이어할 수 있습니다.' : '결과가 만들어지지 않았습니다. 어떤 종목도 검증되지 않았습니다.');
      $('btn-resume').hidden = v.state !== 'PARTIAL';
    }
    $('btn-run').disabled = !$('chk-ack').checked || v.state !== 'CONFIRMING';
  }
  /* 더블탭 방어: 단계가 바뀌면 같은 자리에 다른 버튼이 나타난다(예: 실행→중단). 단계 전환 직후 0.7초간 다른 버튼 입력을 무시한다. */
  var tapLockUntil = 0;
  function guarded(fn) { return function (ev) { if (Date.now() < tapLockUntil) { if (ev && ev.preventDefault) ev.preventDefault(); return; } return fn(ev); }; }
  function lockTaps() { tapLockUntil = Date.now() + 700; }
  function push(step) { try { history.pushState({ kst: step }, ''); } catch (e) {} }
  $('in-basdt').value = defaultBasDt();
  $('btn-unlock').addEventListener('click', guarded(function () { var t = clock.nowMs(); var r = flow.unlock({ role: 'admin', verified: true, issuedAt: t, expiresAtMs: t + 10 * 60000 }); if (r.ok) push('ready'); render(); }));
  $('btn-lock').addEventListener('click', guarded(function () { flow.lock(); render(); }));
  $('btn-prepare').addEventListener('click', guarded(function () {
    scenario = $('in-scn').value; flow = newFlow(scenario); var t = clock.nowMs(); flow.unlock({ role: 'admin', verified: true, issuedAt: t, expiresAtMs: t + 10 * 60000 });
    var r = flow.prepare({ basDt: $('in-basdt').value.trim(), maxCalls: Number($('in-max').value) });
    if (!r.ok) { $('input-error').hidden = false; $('input-error').textContent = '입력 오류: ' + r.reason; render(); return; }
    $('input-error').hidden = true;
    $('chk-ack').checked = false; push('confirm'); render();
  }));
  $('chk-ack').addEventListener('change', render);
  $('btn-back').addEventListener('click', guarded(function () { history.length > 1 ? history.back() : (flow.lock(), render()); }));
  $('btn-run').addEventListener('click', guarded(function () { lockTaps();
    var v = flow.getView(), t = clock.today(), exp = new Date(Date.parse(t) + 86400000).toISOString().slice(0, 10);
    var c = flow.confirm({ ack: $('chk-ack').checked, approval: { approvedBy: 'user', approvedAt: t, basDt: v.plan.basDt, maxCalls: v.plan.maxCalls, scope: 'krx-identity-only', expiresAt: exp } });
    if (!c.ok) { $('result-state').textContent = '승인 실패: ' + c.reason; render(); return; }
    $('btn-run').disabled = true; var p = flow.run(); render(); p.then(function () { push('result'); render(); });
  }));
  $('btn-cancel').addEventListener('click', guarded(function () { lockTaps(); flow.cancel(); render(); }));
  $('btn-resume').addEventListener('click', guarded(function () { lockTaps(); var p = flow.resume(); render(); p.then(render); }));
  $('btn-again').addEventListener('click', guarded(function () { lockTaps(); scenario = 'none'; flow = newFlow('none'); var t = clock.nowMs(); flow.unlock({ role: 'admin', verified: true, issuedAt: t, expiresAtMs: t + 10 * 60000 }); render(); }));
  window.addEventListener('popstate', function () { var s = flow.getView().state; if (s === 'RUNNING') { push('running'); return; } if (s === 'CONFIRMING' || s === 'APPROVED') { flow.lock(); var t = clock.nowMs(); flow.unlock({ role: 'admin', verified: true, issuedAt: t, expiresAtMs: t + 10 * 60000 }); } render(); });
  renderStatus(); render();
})();
