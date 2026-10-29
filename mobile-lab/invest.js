/* KST 투자관리 실험실 화면 (15단계). 저장소·네트워크·타이머 사용 없음. 파일은 메모리에서만 읽는다. */
(function () {
  'use strict';
  var L = window.KSTLedger, R = window.KSTRisk, B = window.KSTBacktest, F = window.KSTFormat, P = window.KSTPortfolioBackup;
  var $ = function (id) { return document.getElementById(id); };
  var state = { holdings: [], appRows: [], themeMap: {}, thresholds: {}, scenarios: [], theses: [], trades: [], tradeLoaded: false, lastBt: null, backupTheme: {} };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function kv(parent, k, v) { var d = el('div', 'kv'); d.appendChild(el('span', '', k)); d.appendChild(el('span', '', v)); parent.appendChild(d); }
  function today() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }
  function num(s) { s = String(s == null ? '' : s).trim().replace(/,/g, ''); if (s === '') return null; return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; }
  function showErr(id, msg) { var e = $(id); e.hidden = !msg; e.textContent = msg || ''; }
  function download(name, text, type) { var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function readFile(file) { return file.text(); }

  /* ---- 탭 ---- */
  var TABS = ['risk', 'pnl', 'bt', 'pilot'];
  TABS.forEach(function (t) {
    $('tab-' + t).addEventListener('click', function () {
      TABS.forEach(function (x) { $('tab-' + x).setAttribute('aria-selected', String(x === t)); $('p-' + x).hidden = x !== t; });
      $('sec-load').hidden = t === 'bt' || t === 'pilot';
    });
  });

  /* ---- 보유 불러오기 ---- */
  var SAMPLE = [
    { account: 'dom', ticker: 'AAA', name: '합성전자', valueKRW: 42000000 }, { account: 'dom', ticker: 'BBB', name: '합성화학', valueKRW: 18000000 },
    { account: 'ov', ticker: 'MSX', name: '합성소프트', valueKRW: 30000000 }, { account: 'ov', ticker: 'GOX', name: '합성검색', valueKRW: 21000000 },
    { account: 'pen', ticker: 'ETX', name: '합성ETF', valueKRW: 15000000 }, { account: 'gen', ticker: 'AAA', name: '합성전자', valueKRW: 9000000 }
  ];
  function setHoldings(list, note) { state.holdings = list; $('load-status').textContent = note; renderRisk(); renderLedger(); }
  $('btn-sample').addEventListener('click', function () { state.themeMap = { AAA: '반도체', BBB: '화학', MSX: '빅테크', GOX: '빅테크' }; $('in-themes').value = 'AAA=반도체\nBBB=화학\nMSX=빅테크\nGOX=빅테크'; state.appRows = []; setHoldings(SAMPLE.map(function (h) { return Object.assign({}, h); }), '합성 예시 보유 ' + SAMPLE.length + '건 (실제 자산 아님)'); });
  function loadBackupText(text) {
    var parsed; try { parsed = P.parse(text); } catch (e) { $('load-status').textContent = '백업 파일을 읽지 못했습니다: ' + (e && e.message ? e.message : '형식 오류') + ' (원본은 바뀌지 않았습니다)'; return; }
    var fx = num($('in-fx').value); var vals = parsed.values || {};
    var r = R.holdingsFromStorage(vals, { fxUsd: fx > 0 ? fx : null });
    state.backupTheme = {}; try { var tm = JSON.parse(vals.v5_userThemeMap || '{}'); Object.keys(tm || {}).forEach(function (k) { if (typeof tm[k] === 'string') state.backupTheme[k] = tm[k]; }); } catch (e) {}
    state.appRows = []; ['gen', 'dom', 'ov', 'pen'].forEach(function (a) { try { var arr = JSON.parse(vals['v5_' + a] || '[]'); var x = L.fromAppHoldings(arr, a, { fxUsd: fx > 0 ? fx : null }); if (x.ok) state.appRows = state.appRows.concat(x.rows); } catch (e) {} });
    var tmCount = Object.keys(state.backupTheme).length;
    if (tmCount && !$('in-themes').value.trim()) { $('in-themes').value = Object.keys(state.backupTheme).map(function (k) { return k + '=' + state.backupTheme[k]; }).join('\n'); state.themeMap = Object.assign({}, state.backupTheme); }
    setHoldings(r.holdings, '보유 ' + r.holdings.length + '건을 읽었습니다 (읽기 전용)' + (r.notes.length ? ' · 참고: ' + r.notes.join(', ') : '') + (tmCount ? ' · 앱의 테마 지정 ' + tmCount + '건 불러옴' : ''));
  }
  $('f-backup').addEventListener('change', function (ev) { var f = ev.target.files[0]; if (!f) return; readFile(f).then(loadBackupText, function () { $('load-status').textContent = '파일을 읽지 못했습니다.'; }); });
  $('in-fx').addEventListener('change', function () { var f = $('f-backup').files[0]; if (f) readFile(f).then(loadBackupText); else if (state.holdings === SAMPLE) renderRisk(); renderLedger(); });

  /* ---- 위험 화면 ---- */
  function parseThemes() { var m = {}; $('in-themes').value.split(/\r?\n/).forEach(function (ln) { var i = ln.indexOf('='); if (i > 0) { var k = ln.slice(0, i).trim(), v = ln.slice(i + 1).trim(); if (k && v) m[k] = v; } }); return m; }
  function pctInput(id, label) { var v = num($(id).value); if (v === null) return { v: null }; if (!(v > 0 && v <= 100)) return { err: label + ': 0 초과 100 이하 숫자로 입력하세요' }; return { v: v }; }
  $('btn-th').addEventListener('click', function () {
    var a = [pctInput('th-ticker', '한 종목'), pctInput('th-theme', '한 테마'), pctInput('th-account', '한 계좌'), pctInput('th-top3', '상위 3종목')], e = a.filter(function (x) { return x.err; });
    if (e.length) { showErr('th-error', e[0].err); return; } showErr('th-error', '');
    state.thresholds = { tickerMaxPct: a[0].v, themeMaxPct: a[1].v, accountMaxPct: a[2].v, top3MaxPct: a[3].v }; state.themeMap = parseThemes(); renderRisk();
  });
  function weightBar(p) { var b = el('div', 'bar'), i = el('i'); i.style.width = Math.max(0, Math.min(100, p)) + '%'; b.appendChild(i); return b; }
  function renderRisk() {
    var res = R.analyze(state.holdings, { themeMap: state.themeMap, thresholds: state.thresholds, today: today() });
    var s = clear($('risk-summary'));
    if (!state.holdings.length) { s.appendChild(el('p', 'note', '보유 현황을 불러오면 비중이 표시됩니다.')); clear($('risk-alerts')); clear($('risk-tickers')); clear($('risk-themes')); fillStressKeys(); renderStress(); renderThesisList(); return; }
    if (!res.ok || !res.metrics) { s.appendChild(el('p', 'warn', res.metrics === null && res.ok ? '평가 가능한 보유가 없어 비중을 계산하지 않았습니다 (현재가·환율 확인).' : '계산 오류: ' + res.errors.join(', '))); }
    else {
      kv(s, '평가 합계', F.krwCompact(res.totalKRW)); kv(s, '정확한 금액', F.krw(res.totalKRW)); kv(s, '가장 큰 종목 비중', F.pct(res.metrics.top1Pct)); kv(s, '상위 3종목 합계', F.pct(res.metrics.top3Pct)); kv(s, '실효 종목 수', res.metrics.effectiveN.toFixed(1) + '개'); kv(s, '집중도 HHI', res.metrics.hhi.toFixed(3));
      s.appendChild(el('p', 'note', res.metrics.note + ' · ' + res.scope));
    }
    if (res.unvalued && res.unvalued.length) { var w = el('div', 'alert'); w.textContent = '평가에서 제외된 보유 ' + res.unvalued.length + '건 (자료 부족): ' + res.unvalued.map(function (u) { return (u.name || u.ticker) + '(' + u.reason + ')'; }).join(', ') + ' — 비중은 평가 가능한 보유만으로 계산했습니다.'; s.appendChild(w); }
    var al = clear($('risk-alerts'));
    if (res.thresholdErrors && res.thresholdErrors.length) al.appendChild(el('p', 'warn', '기준 입력 오류: ' + res.thresholdErrors.join(', ')));
    if (res.alerts && res.alerts.length) res.alerts.forEach(function (a) { var d = el('div', 'alert'); d.appendChild(el('div', '', a.message)); d.appendChild(el('div', 'formula', '기준보다 ' + F.pp(a.gapPp) + ' 높음 ≈ ' + F.krwCompact(a.gapKRW) + ' (' + F.krw(a.gapKRW) + ')')); al.appendChild(d); });
    else al.appendChild(el('p', res.thresholdNote ? 'note' : 'okbox', res.thresholdNote || '설정한 기준을 넘는 항목이 없습니다.'));
    var tk = clear($('risk-tickers'));
    (res.byTicker || []).slice(0, 12).forEach(function (t) { var r = el('div', 'row'); r.appendChild(el('div', 't', (t.name || t.ticker) + ' (' + t.ticker + ')')); r.appendChild(el('div', 'v', F.pct(t.weightPct) + ' · ' + F.krwCompact(t.valueKRW))); r.appendChild(weightBar(t.weightPct)); tk.appendChild(r); });
    if (res.byTicker && res.byTicker.length > 12) tk.appendChild(el('p', 'note', '상위 12개만 표시 (전체 ' + res.byTicker.length + '개)'));
    var th = clear($('risk-themes'));
    th.appendChild(el('h3', '', '테마')); (res.byTheme || []).forEach(function (t) { var r = el('div', 'row'); r.appendChild(el('div', 't', t.theme + (t.unknown ? ' — 테마를 지정하지 않아 겹침 여부를 알 수 없음' : ''))); r.appendChild(el('div', 'v', F.pct(t.weightPct) + ' · ' + F.krwCompact(t.valueKRW))); r.appendChild(weightBar(t.weightPct)); th.appendChild(r); });
    th.appendChild(el('h3', '', '계좌')); (res.byAccount || []).forEach(function (a) { var r = el('div', 'row'); r.appendChild(el('div', 't', a.label + ' 계좌')); r.appendChild(el('div', 'v', F.pct(a.weightPct) + ' · ' + F.krwCompact(a.valueKRW))); r.appendChild(weightBar(a.weightPct)); th.appendChild(r); });
    th.appendChild(el('p', 'note', 'ETF 간접 노출: 구성종목 자료가 없어 합산하지 않았습니다 (미확인).'));
    fillStressKeys(); renderStress(); renderThesisList();
  }
  /* 하락 시나리오 */
  function fillStressKeys() {
    var kind = $('st-kind').value, sel = clear($('st-key')), opts = [];
    if (kind === 'ticker') { var seen = {}; state.holdings.forEach(function (h) { if (!seen[h.ticker]) { seen[h.ticker] = 1; opts.push([h.ticker, (h.name || h.ticker) + ' (' + h.ticker + ')']); } }); }
    else if (kind === 'theme') { var ts = {}; state.holdings.forEach(function (h) { var t = state.themeMap[h.ticker]; if (t && !ts[t]) { ts[t] = 1; opts.push([t, t]); } }); }
    else if (kind === 'account') opts = [['gen', '일반'], ['dom', '국내'], ['ov', '해외'], ['pen', '연금']];
    else opts = [['', '전체 자산']];
    opts.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; sel.appendChild(op); });
    sel.disabled = kind === 'all';
  }
  $('st-kind').addEventListener('change', fillStressKeys);
  $('btn-st-add').addEventListener('click', function () {
    var d = num($('st-drop').value), kind = $('st-kind').value, key = $('st-key').value;
    if (!(d > 0 && d <= 100)) { showErr('st-error', '하락률은 0 초과 100 이하 숫자로 입력하세요'); return; }
    if (kind !== 'all' && !key) { showErr('st-error', kind === 'theme' ? '먼저 위에서 테마를 지정하고 "기준 적용"을 누르세요' : '대상을 선택하세요'); return; }
    if (!state.holdings.length) { showErr('st-error', '먼저 보유 현황을 불러오세요'); return; }
    showErr('st-error', ''); state.scenarios.push(kind === 'all' ? { kind: kind, dropPct: d } : { kind: kind, key: key, dropPct: d }); renderStress();
  });
  function scenarioLabel(s) { return (s.kind === 'all' ? '전체 자산' : s.kind === 'account' ? ({ gen: '일반', dom: '국내', ov: '해외', pen: '연금' })[s.key] + ' 계좌' : s.key) + ' ' + s.dropPct + '% 하락'; }
  function renderStress() {
    var list = clear($('st-list')), out = clear($('st-result'));
    state.scenarios.forEach(function (s, i) { var r = el('div', 'row'); r.appendChild(el('div', 't', scenarioLabel(s))); var b = el('button', 'btn secondary small', '삭제'); b.type = 'button'; b.addEventListener('click', function () { state.scenarios.splice(i, 1); renderStress(); }); r.appendChild(b); list.appendChild(r); });
    if (!state.scenarios.length) return;
    var res = R.stress(state.holdings, state.scenarios, { themeMap: state.themeMap, includeIndirect: $('st-ind').checked, today: today() });
    if (!res.ok) { out.appendChild(el('p', 'warn', res.reason)); return; }
    res.items.forEach(function (it) { var r = el('div', 'row'); r.appendChild(el('div', 't', scenarioLabel(it.scenario))); kv(r, '예상 손실', F.krwCompact(it.lossKRW)); kv(r, '정확한 금액', F.krw(it.lossKRW)); kv(r, '전체 자산 대비', F.pct(it.lossPctOfTotal)); r.appendChild(el('div', 'formula', it.formula)); out.appendChild(r); });
    var c = el('div', 'row'); c.appendChild(el('div', 't', '시나리오를 모두 합친 예상 손실')); kv(c, '합계', F.krwCompact(res.combined.lossKRW)); kv(c, '전체 자산 대비', F.pct(res.combined.lossPctOfTotal)); c.appendChild(el('div', 'formula', res.combined.rule)); out.appendChild(c);
    var as = el('ul', 'plan'); res.assumptions.forEach(function (a) { as.appendChild(el('li', '', a)); }); out.appendChild(el('h3', '', '가정')); out.appendChild(as);
  }
  $('st-ind').addEventListener('change', renderStress);
  /* 투자 판단 기록 */
  var thesisSeq = 1;
  $('tk-date').value = ''; 
  $('btn-tk-add').addEventListener('click', function () {
    var r = R.createThesis({ id: 't' + (thesisSeq++) + '-' + Date.now().toString(36), ticker: $('tk-ticker').value.trim(), buyReason: $('tk-reason').value, disconfirm: $('tk-dis').value, nextReviewDate: $('tk-date').value, createdDate: today() });
    if (!r.ok) { thesisSeq--; showErr('tk-error', r.errors.join(' · ')); return; }
    showErr('tk-error', ''); state.theses.push(r.thesis); ['tk-ticker', 'tk-reason', 'tk-dis', 'tk-date'].forEach(function (i) { $(i).value = ''; }); renderThesisList();
  });
  function renderThesisList() {
    var list = clear($('tk-list')), miss = clear($('th-missing')), t = today();
    var without = R.holdingsWithoutThesis(state.holdings, state.theses); if (state.holdings.length) miss.appendChild(el('p', without.length ? 'warn' : 'okbox', without.length ? '판단 기록이 없는 보유 종목 ' + without.length + '개: ' + without.slice(0, 12).join(', ') : '보유 종목 모두 판단 기록이 있습니다.'));
    state.theses.forEach(function (th, idx) {
      var st = R.reviewStatus(th, t), r = el('div', 'row'); r.appendChild(el('div', 't', th.ticker + ' '));
      var chip = el('span', 'chip', st.label); r.firstChild.appendChild(chip);
      kv(r, '매수 근거', th.buyReason); kv(r, '반증 조건', th.disconfirm); kv(r, '다음 점검일', th.nextReviewDate); kv(r, '변경 이력', th.history.length + '건');
      var last = th.history[th.history.length - 1]; if (last && last.note) r.appendChild(el('div', 'formula', '최근 메모(' + last.date + '): ' + last.note));
      var fld = el('select'); fld.setAttribute('aria-label', '바꿀 항목'); [['buyReason', '매수 근거'], ['disconfirm', '반증 조건'], ['nextReviewDate', '다음 점검일 (YYYY-MM-DD)'], ['status', '상태 (active/paused/closed)']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; fld.appendChild(op); });
      var val = el('input'); val.setAttribute('aria-label', '새 값'); val.placeholder = '새 값'; var note = el('input'); note.setAttribute('aria-label', '변경 사유'); note.placeholder = '변경 사유 (필수)';
      var err = el('p', 'warn'); err.hidden = true; err.setAttribute('role', 'alert');
      var b = el('button', 'btn secondary small', '판단 변경 이력 추가'); b.type = 'button';
      b.addEventListener('click', function () { var ch = {}; ch[fld.value] = val.value; var u = R.updateThesis(th, { date: today(), note: note.value, changes: ch }); if (!u.ok) { err.hidden = false; err.textContent = u.errors.join(' · '); return; } state.theses[idx] = u.thesis; renderThesisList(); });
      r.appendChild(fld); r.appendChild(val); r.appendChild(note); r.appendChild(err); r.appendChild(b); list.appendChild(r);
    });
  }
  $('btn-tk-export').addEventListener('click', function () { download('kst-thesis-log.json', R.exportTheses(state.theses), 'application/json'); });
  $('f-thesis').addEventListener('change', function (ev) {
    var f = ev.target.files[0]; if (!f) return;
    readFile(f).then(function (txt) { var p = R.parseTheses(txt); if (!p.ok) { showErr('tk-error', '가져오기 실패: ' + p.errors.join(' · ') + ' (기존 기록은 바뀌지 않았습니다)'); return; } showErr('tk-error', ''); var ids = {}; state.theses.forEach(function (x) { ids[x.id] = 1; }); var added = p.theses.filter(function (x) { return !ids[x.id]; }); state.theses = state.theses.concat(added); renderThesisList(); showErr('tk-error', added.length === p.theses.length ? '' : '이미 있는 기록 ' + (p.theses.length - added.length) + '건은 건너뛰었습니다'); });
  });

  /* ---- 손익 화면 ---- */
  var SAMPLE_TRADES = [
    { id: 's1', type: 'buy', date: '2026-01-02', account: 'dom', ticker: 'AAA', currency: 'KRW', qty: 10, price: 100 },
    { id: 's2', type: 'buy', date: '2026-01-05', account: 'dom', ticker: 'AAA', currency: 'KRW', qty: 10, price: 120 },
    { id: 's3', type: 'sell', date: '2026-02-01', account: 'dom', ticker: 'AAA', currency: 'KRW', qty: 5, price: 130, fee: 5, tax: 2 },
    { id: 's4', type: 'buy', date: '2026-01-02', account: 'ov', ticker: 'USX', currency: 'USD', qty: 10, price: 100, fx: 1300, fee: 1 },
    { id: 's5', type: 'dividend', date: '2026-04-01', account: 'ov', ticker: 'USX', currency: 'USD', fx: 1400, amount: 10, withholding: 1.5 },
    { id: 's6', type: 'deposit', date: '2026-01-01', account: 'dom', amount: 5000 }
  ];
  function setTrades(trades, note) { state.trades = trades; state.tradeLoaded = true; $('trade-status').textContent = note; renderPxInputs(); renderLedger(); }
  $('btn-trade-sample').addEventListener('click', function () { showErr('trade-error', ''); setTrades(SAMPLE_TRADES.map(function (t) { return Object.assign({}, t); }), '합성 예시 거래기록 ' + SAMPLE_TRADES.length + '건 (실제 거래 아님)'); });
  $('f-trades').addEventListener('change', function (ev) {
    var f = ev.target.files[0]; if (!f) return;
    readFile(f).then(function (txt) {
      var p = /^\s*[\[{]/.test(txt) ? L.parseTradeJson(txt) : L.parseTradeCsv(txt);
      if (!p.ok) { showErr('trade-error', '가져오기 실패 (원본·기존 화면은 바뀌지 않았습니다): ' + p.errors.slice(0, 5).map(function (e) { return (e.row ? e.row + '행 ' : '') + (e.message || e); }).join(' / ')); return; }
      showErr('trade-error', ''); setTrades(p.trades, '거래기록 ' + p.trades.length + '건을 읽었습니다');
    });
  });
  var prices = {};
  function renderPxInputs() {
    var box = clear($('px-inputs')); if (!state.tradeLoaded) { box.appendChild(el('p', 'note', '거래기록을 불러오면 보유 종목별 입력칸이 나타납니다.')); return; }
    var res = L.compute(state.trades, {}), seen = {};
    res.positions.filter(function (p) { return p.open && p.calculable; }).forEach(function (p) {
      if (seen[p.ticker]) return; seen[p.ticker] = 1; var id = 'px-' + p.ticker.replace(/[^A-Za-z0-9]/g, '_'); var lab = el('label', '', p.ticker + ' 현재가 (' + p.currency + ')'); lab.setAttribute('for', id); var inp = el('input'); inp.id = id; inp.setAttribute('inputmode', 'decimal'); inp.autocomplete = 'off'; if (prices[p.ticker] != null) inp.value = prices[p.ticker];
      inp.addEventListener('input', function () { var v = num(inp.value); if (v > 0) prices[p.ticker] = v; else delete prices[p.ticker]; }); box.appendChild(lab); box.appendChild(inp);
    });
    if (!box.firstChild) box.appendChild(el('p', 'note', '보유 중인 종목이 없습니다.'));
  }
  $('pnl-asof').value = today();
  $('btn-pnl').addEventListener('click', renderLedger);
  function renderLedger() {
    var out = clear($('pnl-result')), tax = clear($('tax-result')), rec = clear($('rec-result'));
    if (!state.tradeLoaded) { out.appendChild(el('p', 'note', '거래기록이 없어 실현손익·수익률은 "계산 불가/자료 부족"입니다. 앱 보유 현황만으로는 평가손익(근사)만 볼 수 있습니다.')); renderAppOnly(rec); return; }
    var res = L.compute(state.trades, {}), fx = num($('in-fx').value), val = L.valuate(res, { prices: prices, fxUsd: fx > 0 ? fx : null });
    if (!res.ok) { var e = el('div', 'alert'); e.textContent = '거래기록 오류 ' + res.errors.length + '건 — 해당 종목은 계산하지 않았습니다: ' + res.errors.slice(0, 4).map(function (x) { return x.message; }).join(' / '); out.appendChild(e); }
    res.warnings.slice(0, 5).forEach(function (w) { out.appendChild(el('p', 'note', '참고: ' + (w.message || w))); });
    val.rows.forEach(function (r) {
      var row = el('div', 'row'); row.appendChild(el('div', 't', r.ticker + ' · ' + L.ACCOUNT_LABEL[r.account] + (r.status ? ' — ' + r.status : '')));
      kv(row, '보유 수량', F.qty(r.qty)); kv(row, '평균단가(원화 기준)', F.krw(r.avgKRW)); kv(row, '취득원가', F.krw(r.costKRW)); kv(row, '평가금액', F.krw(r.valueKRW)); kv(row, '평가손익', F.krw(r.unrealizedKRW)); kv(row, '실현손익', F.krw(r.realizedKRW)); kv(row, '배당(세후)', F.krw(r.dividendsKRW)); out.appendChild(row);
    });
    var t = val.totals, tot = el('div', 'row'); tot.appendChild(el('div', 't', '전체 합계' + (t.complete ? '' : ' (일부 자료 부족 — 합계 보류)')));
    kv(tot, '총손익', F.krw(t.totalPnLKRW)); kv(tot, '단순수익률', F.pct(t.simpleReturnPct, 2)); tot.appendChild(el('div', 'formula', t.simpleReturnLabel));
    var asof = $('pnl-asof').value, x = L.xirrOf(res, val, asof); kv(tot, 'XIRR(연환산)', x.ok ? F.pct(x.ratePct, 2) : '계산 불가: ' + x.reason); tot.appendChild(el('div', 'formula', '입금·출금은 성과에서 분리하고 매수/매도/배당 현금흐름과 평가액으로 계산합니다. 보유 기간이 짧으면 연환산 값이 과장될 수 있습니다.')); out.appendChild(tot);
    var te = L.estimateOverseasTax(res, { rate: (num($('tax-rate').value) || 0) / 100, deductionKRW: num($('tax-ded').value) || 0 });
    if (!te.ok) tax.appendChild(el('p', 'warn', te.reason)); else { if (!te.rows.length) tax.appendChild(el('p', 'note', '해외주식 실현손익 기록이 없습니다.')); te.rows.forEach(function (r) { var row = el('div', 'row'); row.appendChild(el('div', 't', r.year + '년 (추정)')); kv(row, '손익통산', F.krw(r.netRealizedKRW)); kv(row, '과세 대상(추정)', F.krw(r.taxableKRW)); kv(row, '세금(추정)', F.krw(r.estimatedTaxKRW)); tax.appendChild(row); }); tax.appendChild(el('p', 'note', te.note)); }
    if (!state.appRows.length) rec.appendChild(el('p', 'note', '백업 파일을 불러오면 거래기록과 앱 보유를 대조합니다.'));
    else { var rc = L.reconcile(res.positions, state.appRows), LAB = { match: '일치', 'qty-mismatch': '수량 불일치', 'avg-mismatch': '평균단가 차이', 'missing-in-ledger': '거래기록에 없음', 'missing-in-app': '앱에 없음' }; rc.forEach(function (r) { var row = el('div', 'row'); row.appendChild(el('div', 't', r.key.replace('|', ' · ') + ' — ' + LAB[r.status])); rec.appendChild(row); }); }
  }
  function renderAppOnly(rec) {
    if (!state.appRows.length) { rec.appendChild(el('p', 'note', '앱 보유 현황이 없습니다.')); return; }
    state.appRows.slice(0, 20).forEach(function (r) { var row = el('div', 'row'); row.appendChild(el('div', 't', (r.name || r.ticker) + ' · ' + L.ACCOUNT_LABEL[r.account])); kv(row, '평가금액', F.krw(r.valueKRW)); kv(row, '평가손익률(근사)', F.pct(r.unrealizedPct, 2)); kv(row, '실현손익', '계산 불가/자료 부족'); rec.appendChild(row); });
  }
  $('tax-rate').addEventListener('input', renderLedger); $('tax-ded').addEventListener('input', renderLedger);
  $('btn-exp-csv').addEventListener('click', function () { download('kst-trades.csv', L.exportTradeCsv(state.trades), 'text/csv'); });
  $('btn-exp-json').addEventListener('click', function () { download('kst-trades.json', L.exportTradeJson(state.trades), 'application/json'); });

  /* ---- 백테스트 ---- */
  $('btn-bt').addEventListener('click', function () {
    var seed = num($('bt-seed').value), fee = num($('bt-fee').value), slip = num($('bt-slip').value);
    if (!(Number.isInteger(seed) && seed >= 0 && seed < 1e9)) { showErr('bt-error', '시드는 0 이상 정수로 입력하세요'); return; }
    if (!(fee >= 0 && fee <= 1000) || !(slip >= 0 && slip <= 1000)) { showErr('bt-error', '수수료·슬리피지는 0~1000bp 숫자로 입력하세요'); return; } showErr('bt-error', '');
    var bars = B.makeSynthetic({ seed: seed, n: 1500 }), bench = B.makeSynthetic({ seed: seed + 1000, n: 1500, driftPct: 0.03, volPct: 1.0 });
    var res = B.run({ bars: bars, benchmark: bench, rule: { kind: $('bt-rule').value }, costs: { feeBps: fee, slippageBps: slip }, meta: { isSynthetic: true, source: '시드 ' + seed + ' 합성 난수(실제 가격 아님)', asOf: '합성', fx: 'not-applicable' }, grid: $('bt-grid').checked ? [[10], [15], [20], [25], [30]] : null });
    state.lastBt = res; renderBt(res);
  });
  function renderBt(res) {
    var out = clear($('bt-result')); if (!res.ok) { out.appendChild(el('p', 'warn', '실행 거부: ' + res.errors.join(' / '))); return; }
    $('bt-real').textContent = String(B.realBacktestCount([res]));
    var lab = el('div', 'alert'); lab.textContent = res.label; out.appendChild(lab);
    var v = el('div', 'row'); v.appendChild(el('div', 't', '판정: ' + res.verdict)); v.appendChild(el('div', 'v', res.verdictReason)); kv(v, '신호 발생', res.signalCount + '회'); res.signalsByBand.forEach(function (b) { kv(v, '  ' + b.band + '% 구간', b.count + '회'); }); kv(v, '훈련/검증 분리일', res.splitDate); out.appendChild(v);
    [['validation', '검증 구간 (분리일 이후만)'], ['train', '훈련 구간'], ['all', '전체 기간 (참고)']].forEach(function (seg) {
      out.appendChild(el('h3', '', seg[1]));
      Object.keys(B.HORIZONS).forEach(function (hz) { var s = res[seg[0]][hz], row = el('div', 'row'); row.appendChild(el('div', 't', hz.replace('M', '개월') + ' 후 (' + B.HORIZONS[hz] + '거래일)')); kv(row, '관측 수', s.n + '건 (기간 부족 제외 ' + s.excludedHorizon + ')'); kv(row, '승률', F.pct(s.winRatePct)); kv(row, '중앙값 수익률', F.pct(s.medianPct, 1)); kv(row, '최악 수익률', F.pct(s.worstPct, 1)); kv(row, '최대낙폭(보유 중)', F.pct(s.worstMddPct, 1)); kv(row, '비교지표 대비 초과(중앙값)', F.pp(s.excessMedianPct)); out.appendChild(row); });
    });
    if (res.grid) { var g = el('div', 'row'); g.appendChild(el('div', 't', '매개변수 후보 ' + res.grid.size + '가지 탐색')); kv(g, '훈련 최고 후보', res.grid.picked ? res.grid.picked.join('/') + '%' : '없음'); kv(g, '검증 구간 중앙값', F.pct(res.grid.pickedValidationMedianPct, 1)); kv(g, '검증 관측 수', String(res.grid.pickedValidationN)); if (res.grid.overfitWarning) g.appendChild(el('div', 'alert', '과최적화 경고: 훈련에서만 좋아 보이거나 검증 표본이 부족합니다.')); g.appendChild(el('div', 'formula', res.grid.note)); out.appendChild(g); }
    out.appendChild(el('h3', '', '경고·미반영 항목')); var ul = el('ul', 'plan'); res.warnings.forEach(function (w) { ul.appendChild(el('li', '', w)); }); out.appendChild(ul);
    out.appendChild(el('h3', '', '재현 정보')); var rp = el('div', 'row'); kv(rp, '규칙 버전', res.repro.ruleVersion); kv(rp, '자료 지문', res.repro.barsDigest); kv(rp, '설정 지문', res.repro.configDigest); kv(rp, '결과 지문', res.resultDigest); kv(rp, '미래정보 누출 검사', res.leakCheck.ok ? '통과' : '실패'); out.appendChild(rp);
    out.appendChild(el('p', 'warn', res.disclaimer));
  }

  /* ---- 시세 파일럿 (계획·설정만) ---- */
  var pc = $('pilot-counts'); [['실제 활성 감시 종목', '0'], ['실제 시세 검증', '0건'], ['실제 시세 호출', '0회'], ['실데이터 백테스트', '0건'], ['합성·캐시·실조회 종목', '합성 0 / 캐시 0 / 실조회 0']].forEach(function (a) { var dt = el('dt', '', a[0]), dd = el('dd', '', a[1]); pc.appendChild(dt); pc.appendChild(dd); });
  var pt = $('pilot-tickers'); ['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM'].forEach(function (t) { pt.appendChild(el('li', '', t + ' — 읽기 전용 검증 후보')); });
  var pk = $('pilot-checks'); ['공급자 가격과 독립 기준값의 일치율 (종목별·일자별)', '결측·지연 일수 기록', '수정주가·배당·분할 처리 방식 확인', '호출량과 예상 월 비용 (유료 가입은 별도 승인 후)', '사용권·저장권·재배포 제한 문서 확인', '네트워크 실패 시 기존 투자기록이 변하지 않는지 확인'].forEach(function (t) { pk.appendChild(el('li', '', t + ' — 미실시')); });

  renderRisk(); renderPxInputs(); renderLedger(); renderStress();
})();
