/* HAS 자본배분 비교 시험 화면 (지시서 GPT-20261113-0024 4절) — 시험 게이트(?test=1)에서만 입력 화면을 그린다.
   - 입력은 이 화면의 메모리에만 있다(저장소·네트워크·투자기록을 읽거나 쓰지 않음, 새로고침하면 사라짐).
   - 계산은 has/capital-allocation.js 엔진에 그대로 맡기고, 화면은 결과를 글자(textContent)로만 그린다.
   - 가격은 사용자가 넣는 합성 값이며 현재 시세가 아니다. '매수 검토'는 표시하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASCapitalLab = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  /* 기본값 = tests/fixtures/capital-allocation-nvda-synthetic.json 과 같은 합성 사례(시험이 일치를 확인) */
  var DEFAULTS = Object.freeze({
    asOf: '2026-11-13', cashUSD: '0', fractional: false, scope: 'overseas-account', otherAssetsUSD: '',
    conviction: 'QTOP, MSFT, AVGO',
    holdings: [
      { symbol: 'NVDA', qty: '40.01002', averageCost: '139.68', price: '140', sector: '반도체', conviction: false },
      { symbol: '', qty: '', averageCost: '', price: '', sector: '', conviction: false },
      { symbol: '', qty: '', averageCost: '', price: '', sector: '', conviction: false }
    ],
    saleQty: '20', salePrice: '161',
    candidates: [
      { symbol: 'GOOGL', price: '100', sector: '인터넷·광고', conviction: false },
      { symbol: 'MSFT', price: '400', sector: '소프트웨어', conviction: true },
      { symbol: 'AVGO', price: '300', sector: '반도체', conviction: true }
    ],
    sellFee: '', buyFee: '', buyFeeRatePct: '', usdkrw: '', fxAcq: '', fxSale: '',
    partialPct: '50', partialSymbols: 'NVDA',
    scenarios: { 1: '', 3: '', 5: '' }
  });

  function gateOn(search) { try { return new URLSearchParams(search || '').get('test') === '1'; } catch (e) { return false; } }
  function blank(s) { return s == null || String(s).trim() === ''; }
  /* 빈칸 = null(미입력), 숫자가 아니면 NaN(엔진이 '추가 정보 필요'로 보류) */
  function num(s) { if (blank(s)) return null; var t = String(s).replace(/,/g, '').trim(); return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN; }
  function list(s) { return String(s || '').split(/[\s,·]+/).map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean); }
  /* "NVDA:20, GOOGL:-5, CASH:3" → { NVDA: 20, GOOGL: -5, CASH: 3 } (형식이 틀린 항목은 NaN 으로 넘겨 엔진이 보류) */
  function parseReturns(text) {
    var out = {};
    String(text || '').split(/[,\n]+/).forEach(function (part) {
      var p = part.trim(); if (!p) return;
      var m = /^([A-Za-z0-9.\-]+)\s*[:=]\s*(.*)$/.exec(p);
      if (!m) { out[p.toUpperCase()] = NaN; return; }
      out[m[1].toUpperCase()] = num(m[2].replace(/%$/, ''));
      if (out[m[1].toUpperCase()] === null) out[m[1].toUpperCase()] = NaN;
    });
    return out;
  }

  var HOLDING_FIELDS = ['symbol', 'qty', 'averageCost', 'price', 'sector', 'conviction'];
  var CANDIDATE_FIELDS = ['symbol', 'price', 'sector', 'conviction'];
  function filled(x) { return x === true || (x !== false && !blank(x)); }
  function emptyRow(r, keys) { return !r || keys.every(function (k) { return !filled(r[k]); }); }
  /* 화면 줄 번호 기준 검사: 부분 작성 줄·빈 첫 줄 매도 → 문제 줄 번호와 빠진 항목 (빈 배열 = 문제 없음) */
  function rowIssues(v) {
    var out = [];
    (v.holdings || []).forEach(function (h, i) {
      if (emptyRow(h, HOLDING_FIELDS) || !blank(h.symbol)) return;
      var m = ['종목'];
      if (blank(h.qty)) m.push('수량');
      if (blank(h.price)) m.push('평가가격');
      out.push('보유 ' + (i + 1) + '번 줄: 다른 칸은 입력됐지만 ' + m.join('·') + ' 없음 — 채우거나 줄 전체를 비우세요');
    });
    var first = (v.holdings || [])[0];
    if ((!blank(v.saleQty) || !blank(v.salePrice)) && (!first || blank(first.symbol))) out.push('보유 1번 줄(매도할 종목)이 비어 있음 — 다른 줄 종목으로 바꾸지 않습니다. 1번 줄에 매도 종목을 넣으세요');
    (v.candidates || []).forEach(function (c, i) {
      if (emptyRow(c, CANDIDATE_FIELDS) || !blank(c.symbol)) return;
      var m = ['종목'];
      if (blank(c.price)) m.push('매수 가격');
      out.push('후보 ' + (i + 1) + '번 줄: 다른 칸은 입력됐지만 ' + m.join('·') + ' 없음 — 채우거나 줄 전체를 비우세요');
    });
    return out;
  }
  /* 화면 계산: 줄 검사에 걸리면 엔진 결과가 성공이어도 대안을 보여주지 않는다(fail-closed) */
  function compare(v, engine) {
    var r = engine.compareAlternatives(buildInput(v)), rows = rowIssues(v);
    if (!rows.length) return r;
    return { ok: false, status: 'HOLD_INSUFFICIENT_DATA', opinion: '추가 정보 필요', issues: rows.concat(r.ok ? [] : (r.issues || [])), header: r.header, alternatives: [], buyReview: { allowed: false, reason: '판단 보류 상태' } };
  }

  /* 화면 입력값(문자열) → 엔진 계약 capitalAllocationInput.v1 (순수 함수) */
  function buildInput(v) {
    var asOf = String(v.asOf || '').trim();
    var input = {
      contract: 'capitalAllocationInput.v1',
      asOf: asOf, quoteAsOf: asOf ? asOf + 'T00:00:00+09:00' : '', timezone: 'Asia/Seoul', market: 'US', currency: 'USD',
      source: 'test-gate-user-input', dataMode: 'synthetic', freshnessStatus: 'synthetic',
      portfolioScope: v.scope === 'total-invested' ? { kind: 'total-invested', otherAssetsUSD: num(v.otherAssetsUSD) } : { kind: 'overseas-account' },
      cashUSD: num(v.cashUSD),
      fractionalAllowed: !!v.fractional,
      fees: { sellingFeesUSD: num(v.sellFee), buyingFeesUSD: num(v.buyFee), buyingFeeRate: blank(v.buyFeeRatePct) ? null : num(v.buyFeeRatePct) / 100 },
      fx: { usdkrw: num(v.usdkrw) },
      convictionSymbols: list(v.conviction),
      /* 완전히 빈 줄만 건너뛴다. 종목명 없이 다른 칸이 채워진 줄은 그대로 넘겨 엔진이 '추가 정보 필요'로 멈춘다(조용히 빼지 않음). */
      holdings: (v.holdings || []).filter(function (h) { return !emptyRow(h, HOLDING_FIELDS); }).map(function (h) {
        var o = { symbol: String(h.symbol).trim().toUpperCase(), qty: num(h.qty), price: num(h.price), priceKind: 'user-input', currency: 'USD', sector: String(h.sector || '').trim() || '미분류', conviction: !!h.conviction };
        if (!blank(h.averageCost)) o.averageCost = num(h.averageCost);
        return o;
      }),
      candidates: (v.candidates || []).filter(function (c) { return !emptyRow(c, CANDIDATE_FIELDS); }).map(function (c) {
        return { symbol: String(c.symbol).trim().toUpperCase(), priceUSD: num(c.price), currency: 'USD', sector: String(c.sector || '').trim() || '미분류', conviction: !!c.conviction };
      })
    };
    var fxAcq = num(v.fxAcq), fxSale = num(v.fxSale);
    if (fxAcq != null) input.fx.acquisitionUsdKrw = fxAcq;
    if (fxSale != null) input.fx.saleUsdKrw = fxSale;
    /* 매도 종목 = 화면의 원래 첫 줄로 고정(빈 첫 줄이면 다른 줄로 바꾸지 않고 빈 종목으로 넘겨 보류) */
    var first = (v.holdings || [])[0];
    if (!blank(v.saleQty) || !blank(v.salePrice)) input.sale = { symbol: first && !blank(first.symbol) ? String(first.symbol).trim().toUpperCase() : '', qty: num(v.saleQty), priceUSD: num(v.salePrice) };
    if (!blank(v.partialPct)) {
      var share = num(v.partialPct);
      input.partialReinvest = { share: share == null ? share : share / 100 };
      if (list(v.partialSymbols).length) input.partialReinvest.symbols = list(v.partialSymbols);
    }
    var sc = [];
    [1, 3, 5].forEach(function (y) { var t = v.scenarios && v.scenarios[y]; if (!blank(t)) sc.push({ horizonYears: y, returnsPct: parseReturns(t) }); });
    if (sc.length) input.scenarios = sc;
    return input;
  }

  /* ── 화면 ─────────────────────────────────────────────────── */
  function fmtMoney(x) { return x == null || !isFinite(x) ? '-' : Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtQty(x) { return x == null || !isFinite(x) ? '-' : Number(x).toLocaleString('en-US', { maximumFractionDigits: 6 }); }
  function fmtSigned(x) { return x == null || !isFinite(x) ? '-' : (x > 0 ? '+' : '') + fmtQty(x); }

  function mount(doc, win) {
    var E = function (tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    var app = doc.getElementById('lab');
    if (!app) return null;
    var search = win && win.location ? win.location.search : '';
    if (!gateOn(search)) {
      app.appendChild(E('p', 'gate-off', '시험 게이트가 꺼져 있습니다. 이 화면은 기존 앱과 분리된 시험 화면이며, 주소 끝에 ?test=1 을 붙였을 때만 입력 화면이 나타납니다.'));
      return { gate: false };
    }
    var Engine = win.HASCapitalAllocation;
    var fields = {};
    function input(id, label, value, opt) {
      opt = opt || {};
      var wrap = E('div', 'field' + (opt.wide ? ' wide' : '')), l = E('label', null, label), i = E('input');
      i.id = 'f-' + id; l.htmlFor = i.id; i.type = opt.type || 'text'; if (opt.mode) i.inputMode = opt.mode; i.autocomplete = 'off'; i.spellcheck = false;
      if (i.type === 'checkbox') { i.checked = !!value; wrap.className = 'field check'; wrap.appendChild(i); wrap.appendChild(l); }
      else { i.value = value == null ? '' : value; if (opt.ph) i.placeholder = opt.ph; wrap.appendChild(l); wrap.appendChild(i); }
      fields[id] = i; return wrap;
    }
    function group(title, note) { var g = E('fieldset', 'group'); g.appendChild(E('legend', null, title)); if (note) g.appendChild(E('p', 'muted', note)); var grid = E('div', 'grid'); g.appendChild(grid); return { el: g, grid: grid }; }

    var form = E('form', 'card'); form.id = 'input'; form.noValidate = true;
    form.appendChild(E('p', 'eyebrow', '01 / 입력 (메모리만 · 저장 안 함)'));
    form.appendChild(E('h2', null, '가상 매도·재투자 조건'));
    var g0 = group('기준', '합성 기준일입니다. 가격은 직접 넣는 가정 값이며 현재 시세가 아닙니다.');
    g0.grid.appendChild(input('asOf', '기준일(YYYY-MM-DD)', DEFAULTS.asOf));
    g0.grid.appendChild(input('cashUSD', '기존 현금(USD)', DEFAULTS.cashUSD, { mode: 'decimal' }));
    g0.grid.appendChild(input('fractional', '소수점 매수 가능', DEFAULTS.fractional, { type: 'checkbox' }));
    form.appendChild(g0.el);

    var g1 = group('보유 종목', '첫 줄이 매도할 종목입니다. 완전히 빈 줄만 무시하고, 종목명 없이 일부만 채운 줄은 계산을 멈춥니다.');
    DEFAULTS.holdings.forEach(function (h, i) {
      var p = 'h' + i + '-';
      g1.grid.appendChild(input(p + 'symbol', (i + 1) + ' 종목', h.symbol, { ph: i ? '선택' : '' }));
      g1.grid.appendChild(input(p + 'qty', (i + 1) + ' 수량(주)', h.qty, { mode: 'decimal' }));
      g1.grid.appendChild(input(p + 'averageCost', (i + 1) + ' 평균단가(USD)', h.averageCost, { mode: 'decimal' }));
      g1.grid.appendChild(input(p + 'price', (i + 1) + ' 평가가격(USD, 가정)', h.price, { mode: 'decimal' }));
      g1.grid.appendChild(input(p + 'sector', (i + 1) + ' 업종', h.sector));
      g1.grid.appendChild(input(p + 'conviction', (i + 1) + ' 확신 종목', h.conviction, { type: 'checkbox' }));
    });
    form.appendChild(g1.el);

    var g2 = group('가상 매도', '실제 체결이 아닌 가정입니다.');
    g2.grid.appendChild(input('saleQty', '매도 수량(주)', DEFAULTS.saleQty, { mode: 'decimal' }));
    g2.grid.appendChild(input('salePrice', '매도 가격(USD, 가정)', DEFAULTS.salePrice, { mode: 'decimal' }));
    form.appendChild(g2.el);

    var g3 = group('재투자 후보', '가격은 손계산용 가정 값입니다. 완전히 빈 줄만 무시하고, 종목명 없이 일부만 채운 줄은 계산을 멈춥니다.');
    DEFAULTS.candidates.forEach(function (c, i) {
      var p = 'c' + i + '-';
      g3.grid.appendChild(input(p + 'symbol', '후보 ' + (i + 1) + ' 종목', c.symbol));
      g3.grid.appendChild(input(p + 'price', '후보 ' + (i + 1) + ' 매수 가격(USD, 가정)', c.price, { mode: 'decimal' }));
      g3.grid.appendChild(input(p + 'sector', '후보 ' + (i + 1) + ' 업종', c.sector));
      g3.grid.appendChild(input(p + 'conviction', '후보 ' + (i + 1) + ' 확신 종목', c.conviction, { type: 'checkbox' }));
    });
    g3.grid.appendChild(input('partialPct', 'E안 재투자 비율(%)', DEFAULTS.partialPct, { mode: 'decimal' }));
    g3.grid.appendChild(input('partialSymbols', 'E안 재투자 종목', DEFAULTS.partialSymbols));
    form.appendChild(g3.el);

    var g4 = group('비용·환율', '비워 두면 계산에 넣지 않고 결과에 "미반영"으로 표시합니다.');
    g4.grid.appendChild(input('sellFee', '매도 비용·세금(USD)', DEFAULTS.sellFee, { mode: 'decimal' }));
    g4.grid.appendChild(input('buyFee', '매수 고정 수수료(USD, 주문당)', DEFAULTS.buyFee, { mode: 'decimal' }));
    g4.grid.appendChild(input('buyFeeRatePct', '매수 수수료율(%)', DEFAULTS.buyFeeRatePct, { mode: 'decimal' }));
    g4.grid.appendChild(input('usdkrw', '현재 환율(원/USD)', DEFAULTS.usdkrw, { mode: 'decimal' }));
    g4.grid.appendChild(input('fxAcq', '취득 시점 환율', DEFAULTS.fxAcq, { mode: 'decimal' }));
    g4.grid.appendChild(input('fxSale', '매도 시점 환율', DEFAULTS.fxSale, { mode: 'decimal' }));
    form.appendChild(g4.el);

    var g5 = group('비중 기준·한도', '확신 종목 한도 25%, 그 외 10%. 넘으면 경고만 하고 매도를 지시하지 않습니다.');
    var sel = E('div', 'field'), sl = E('label', null, '비중 분모'), s = E('select');
    s.id = 'f-scope'; sl.htmlFor = s.id;
    [['overseas-account', '해외계좌(보유+현금)'], ['total-invested', '전체 투자자산(기타 자산 포함)']].forEach(function (o) { var op = E('option', null, o[1]); op.value = o[0]; s.appendChild(op); });
    s.value = DEFAULTS.scope; fields.scope = s; sel.appendChild(sl); sel.appendChild(s); g5.grid.appendChild(sel);
    g5.grid.appendChild(input('otherAssetsUSD', '기타 투자자산(USD 환산, 전체 분모일 때)', DEFAULTS.otherAssetsUSD, { mode: 'decimal' }));
    g5.grid.appendChild(input('conviction', '확신 종목 목록', DEFAULTS.conviction, { wide: true }));
    form.appendChild(g5.el);

    var g6 = group('기간별 가정 수익률(선택)', '직접 넣은 가정만 계산합니다. 예: NVDA:20, GOOGL:10, CASH:3 (단위 %). 예측이 아닙니다.');
    [1, 3, 5].forEach(function (y) { g6.grid.appendChild(input('sc' + y, y + '년 가정', DEFAULTS.scenarios[y], { wide: true, ph: '비우면 계산 안 함' })); });
    form.appendChild(g6.el);

    var ctr = E('div', 'controls');
    var run = E('button', 'primary', '비교 계산'); run.type = 'submit'; run.id = 'run';
    var reset = E('button', null, '합성 예시로 되돌리기'); reset.type = 'button'; reset.id = 'reset';
    ctr.appendChild(run); ctr.appendChild(reset); form.appendChild(ctr);
    var status = E('p', 'status', '계산 대기 · 입력은 이 화면 메모리에만 있습니다'); status.id = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
    app.appendChild(form);

    var out = E('section', 'card'); out.id = 'results'; out.tabIndex = -1;
    out.appendChild(E('p', 'eyebrow', '02 / 대안 비교'));
    out.appendChild(E('h2', null, '같은 가정에서 대안별 결과'));
    var body = E('div'); body.id = 'result-body'; body.appendChild(E('p', 'muted', '아직 계산하지 않았습니다.'));
    out.appendChild(body); app.appendChild(out);

    function values() {
      var g = function (id) { var f = fields[id]; return f.type === 'checkbox' ? f.checked : f.value; };
      return {
        asOf: g('asOf'), cashUSD: g('cashUSD'), fractional: g('fractional'), scope: g('scope'), otherAssetsUSD: g('otherAssetsUSD'), conviction: g('conviction'),
        holdings: DEFAULTS.holdings.map(function (_, i) { var p = 'h' + i + '-'; return { symbol: g(p + 'symbol'), qty: g(p + 'qty'), averageCost: g(p + 'averageCost'), price: g(p + 'price'), sector: g(p + 'sector'), conviction: g(p + 'conviction') }; }),
        saleQty: g('saleQty'), salePrice: g('salePrice'),
        candidates: DEFAULTS.candidates.map(function (_, i) { var p = 'c' + i + '-'; return { symbol: g(p + 'symbol'), price: g(p + 'price'), sector: g(p + 'sector'), conviction: g(p + 'conviction') }; }),
        sellFee: g('sellFee'), buyFee: g('buyFee'), buyFeeRatePct: g('buyFeeRatePct'), usdkrw: g('usdkrw'), fxAcq: g('fxAcq'), fxSale: g('fxSale'),
        partialPct: g('partialPct'), partialSymbols: g('partialSymbols'),
        scenarios: { 1: g('sc1'), 3: g('sc3'), 5: g('sc5') }
      };
    }
    function restore() {
      Object.keys(fields).forEach(function (id) {
        var f = fields[id], m = /^([hc])(\d)-(.+)$/.exec(id), d;
        if (m) d = DEFAULTS[m[1] === 'h' ? 'holdings' : 'candidates'][+m[2]][m[3]];
        else if (/^sc\d$/.test(id)) d = DEFAULTS.scenarios[id.slice(2)];
        else d = DEFAULTS[id];
        if (f.type === 'checkbox') f.checked = !!d; else f.value = d == null ? '' : d;
      });
      clear(body); body.appendChild(E('p', 'muted', '아직 계산하지 않았습니다.'));
      status.textContent = '합성 예시로 되돌렸습니다 · 저장하지 않음';
    }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
    function kv(parent, k, v) { var r = E('div', 'kv'); r.appendChild(E('span', 'k', k)); r.appendChild(E('span', 'v', v)); parent.appendChild(r); return r; }
    function tag(text, kind) { return E('span', 'tag ' + (kind || ''), text); }
    function opinionKind(o) { return o === '시나리오 비교 가능' ? 'ok' : o === '비중 한도 주의' ? 'warn' : 'hold'; }
    function issueList(parent, items) { var ul = E('ul', 'issues'); items.forEach(function (t) { ul.appendChild(E('li', null, t)); }); parent.appendChild(ul); }
    function weightsBlock(parent, w) {
      if (!w || !w.ok) { parent.appendChild(E('p', 'hold-text', '비중 계산 보류: ' + ((w && w.issues) || []).join('; '))); return; }
      var box = E('div', 'weights');
      box.appendChild(E('p', 'muted', '분모: ' + w.denominatorLabel + ' = ' + fmtMoney(w.denominatorUSD) + ' USD'));
      w.positions.slice().sort(function (a, b) { return b.weightPct - a.weightPct; }).forEach(function (p) {
        var r = kv(box, p.symbol + (p.conviction ? ' (확신)' : ''), fmtQty(p.qty) + '주 · ' + p.weightPct + '% / 한도 ' + p.limitPct + '%');
        if (p.weightPct > p.limitPct) r.className = 'kv over';
      });
      kv(box, '현금', w.cashWeightPct + '%');
      if (w.sectors[0]) kv(box, '가장 큰 업종', w.sectors[0].sector + ' ' + w.sectors[0].weightPct + '%');
      kv(box, '집중도(HHI, 0~1)', String(w.hhi));
      parent.appendChild(box);
      if (w.limitWarnings.length) issueList(parent, w.limitWarnings.map(function (x) { return x.text; }));
    }
    function render(r) {
      clear(body);
      var h = r.header || {};
      var meta = E('div', 'meta');
      meta.appendChild(tag('합성 · 현재 시세 아님', 'hold'));
      meta.appendChild(tag('교차검증 아님', 'hold'));
      meta.appendChild(E('p', 'muted', '기준일 ' + (h.asOf || '-') + ' · ' + (h.priceVerification || '') + ' · ' + (h.engineVerification || '')));
      if (h.notReflected && h.notReflected.length) meta.appendChild(E('p', 'muted', '미반영: ' + h.notReflected.join(' · ')));
      body.appendChild(meta);
      if (!r.ok) {
        var hold = E('div', 'holdbox');
        hold.appendChild(E('h3', null, r.opinion + ' (' + r.status + ')'));
        hold.appendChild(E('p', null, r.status === 'HOLD_CONFLICT' ? '입력끼리 서로 맞지 않아 계산하지 않았습니다.' : '필요한 입력이 없거나 형식이 맞지 않아 계산하지 않았습니다.'));
        issueList(hold, r.issues || []);
        body.appendChild(hold);
        return;
      }
      if (r.sale) {
        var s = r.sale, sb = E('div', 'sale');
        sb.appendChild(E('h3', null, '가상 매도 ' + s.symbol + ' ' + fmtQty(s.soldQty) + '주 × ' + fmtMoney(s.sellPriceUSD)));
        kv(sb, '매도금액', fmtMoney(s.grossSaleUSD) + ' USD');
        kv(sb, '매매차익(USD, 비용·세금·환차 제외)', fmtMoney(s.grossProfitUSD) + ' USD');
        kv(sb, '매도 비용', s.feesReflected ? fmtMoney(s.sellingFeesUSD) + ' USD' : '미반영');
        kv(sb, '재투자 가능 금액', fmtMoney(s.netProceedsUSD) + ' USD');
        kv(sb, '매도 후 남은 수량', fmtQty(s.remainingQty) + '주');
        kv(sb, '원화 양도소득·세금', s.taxKRW.status + (s.taxKRW.gainKRW != null ? ' · 원화 차익 ' + s.taxKRW.gainKRW.toLocaleString('ko-KR') + '원' : '') + ' — ' + s.taxKRW.reason);
        body.appendChild(sb);
      }
      var alts = E('div', 'alts');
      r.alternatives.forEach(function (a) {
        var c = E('article', 'alt'); c.setAttribute('data-alt', a.id || '');
        var hd = E('div', 'alt-head'); hd.appendChild(E('h3', null, a.label)); hd.appendChild(tag(a.opinion, opinionKind(a.opinion))); c.appendChild(hd);
        if (!a.ok) { issueList(c, a.issues || []); alts.appendChild(c); return; }
        if (!a.orders.length) c.appendChild(E('p', 'muted', '가상 주문 없음 — 매도대금을 현금으로 둡니다.'));
        a.orders.forEach(function (o) { kv(c, o.symbol + ' 가상 매수', fmtQty(o.qty) + '주 × ' + fmtMoney(o.priceUSD) + ' = ' + fmtMoney(o.costUSD) + ' USD' + (o.feeUSD ? ' (수수료 ' + fmtMoney(o.feeUSD) + ')' : '') + (o.note ? ' · ' + o.note : '')); });
        if (a.soldSymbolNetShareChange != null) kv(c, (r.sale ? r.sale.symbol : '매도 종목') + ' 주식 수 변화', fmtSigned(a.soldSymbolNetShareChange) + '주');
        kv(c, '남는 매도대금', fmtMoney(a.saleCashLeftUSD) + ' USD');
        kv(c, '계좌 평가액(가정 가격 기준)', fmtMoney(a.accountValueUSD) + ' USD');
        weightsBlock(c, a.weights);
        (a.scenarios || []).forEach(function (sc) { kv(c, sc.horizonYears + '년 가정', sc.valueUSD != null ? fmtMoney(sc.valueUSD) + ' USD · ' + sc.assumption : sc.status + ' (' + sc.missing.join(', ') + ' 가정 없음)'); });
        alts.appendChild(c);
      });
      body.appendChild(alts);
      var br = E('div', 'holdbox');
      br.appendChild(E('h3', null, '매수 검토: 표시하지 않음'));
      br.appendChild(E('p', null, r.buyReview.reason));
      issueList(br, r.buyReview.missing || []);
      body.appendChild(br);
      body.appendChild(E('p', 'disclaimer', r.disclaimer));
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var r = compare(values(), Engine);
      render(r);
      status.textContent = r.ok ? '계산 완료 · 대안 ' + r.alternatives.length + '개 · 저장하지 않음' : r.opinion + ' · 입력을 확인하세요';
    });
    reset.addEventListener('click', restore);
    return { gate: true, values: values, render: render };
  }

  var api = Object.freeze({ DEFAULTS: DEFAULTS, gateOn: gateOn, num: num, parseReturns: parseReturns, buildInput: buildInput, rowIssues: rowIssues, compare: compare, mount: mount });
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(document, window); });
    else mount(document, window);
  }
  return api;
});
