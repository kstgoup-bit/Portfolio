/* HAS: AI 검토 카드(클로가 조사해 reviews/latest.json으로 올린 의견)를 곡소리 화면에 보여준다.
 * 같은 사이트의 정적 JSON만 읽는다(GAS·키·저장소 사용 없음). 가격·신호·투자기록을 바꾸지 않는다.
 * 의견은 투자 자문이 아니며 최종 결정은 순태씨가 한다. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASReviewCards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERDICT = {
    'buy-review': ['🟢 매수 검토', '#1b5e20'], 'add-review': ['🟢 추가 매수 검토', '#1b5e20'], 'hold-long': ['🔵 장기보유', '#0d47a1'],
    'wait': ['🟡 관망·보류', '#8a4b00'], 'trim-review': ['🟠 비중 축소 검토', '#a33a00'], 'sell-review': ['🔴 매도 검토', '#8b2020']
  };
  // 지피 사후 검토 CR-4·순태씨 D4 승인(2026-11-25): 재무(DART/SEC)·시세 검증과 지피 합의가 연결되기 전에는
  // 매수 쪽 판단을 녹색 '매수 검토'로 보이지 않고 '클로 단독 의견 · 판단 보류'로 표시한다. JSON·과거 기록은 그대로.
  var HELD = { 'buy-review': ['🧠 매수 후보 · 판단 보류(재무·시세 검증 전)', '#333'], 'add-review': ['🧠 추가 매수 후보 · 판단 보류(재무·시세 검증 전)', '#333'] };
  var HELD_NOTE = '⚠ 매수 후보 카드는 클로가 조사한 의견입니다. 앱이 재무(DART·SEC)·시세 검증을 아직 못 해 매수 판단은 보류합니다. 지피 합의 여부는 카드마다 따로 표시합니다. 이유·반론은 참고용으로만 보세요.';
  function shown(k) { return HELD[k] || VERDICT[k]; }
  // CR-A1: 판단 보류 중 차트 관문은 단계 이름만 중립으로 보인다('정찰병 10%·30% 더 가능' 같은 행동 안내·행동 색 없음). 산식·캐시는 그대로.
  var GATE_NEUTRAL = { falling: '하락 추세', basing: '바닥 다지기', stage2: '20일선 회복', stage3: '60일선 회복·저점 상승', unknown: '차트 자료 부족' };
  function gateShown(gr) { return { label: (GATE_NEUTRAL[gr && gr.stage] || GATE_NEUTRAL.unknown) + ' · 타이밍 참고(판단 보류)', color: '#333' }; }
  // 합의 상태(지피 CR-5, 순태씨 D5 승인 2026-11-25). 카드의 consensus 기록이 이 카드의 종목·판단·검토일·지피 검토 파일과
  // 모두 맞을 때만 '지피 합의'. 기록이 없거나 어긋나면 '클로 단독'(일괄 승격 없음). 합의여도 재무·시세 검증 전 매수 쪽 판단 보류(D4)는 유지.
  var CONSENSUS_DAYS = 7;
  var CONS = {
    agreed: ['🤝 지피 합의', '#0d47a1'], solo: ['🧑 클로 단독 의견', '#333'], disagree: ['⚖ 의견 불일치로 보류', '#8b2020'],
    'no-response': ['⌛ 지피 응답 없음 · 보류', '#8a4b00'], expired: ['⏰ 합의 기한(7일) 지남 · 다시 확인 필요', '#8a4b00'], mismatch: ['🧑 클로 단독 (합의 기록이 이 판단과 맞지 않음)', '#333']
  };
  function kstDay(iso) { var t = Date.parse(iso); if (!Number.isFinite(t)) return ''; return new Date(t + 9 * 3600000).toISOString().slice(0, 10); }
  function consensusOf(c, d, now) {
    var x = c && c.consensus; if (!x) return 'solo';
    if (!x || typeof x !== 'object' || ['agreed', 'disagree', 'no-response'].indexOf(x.status) < 0) return 'mismatch';
    var m = typeof x.review === 'string' && /^GPT-REVIEW-ai-review-(\d{4})(\d{2})(\d{2})-\d{4}\.md$/.exec(x.review), day = kstDay(d.reviewedAt);
    if (!m || x.date !== m[1] + '-' + m[2] + '-' + m[3] || x.date !== day || x.ticker !== c.ticker || x.market !== c.market || x.verdict !== c.verdict) return 'mismatch';
    if (x.status !== 'agreed') return x.status;
    var age = ((now == null ? Date.now() : now) - Date.parse(x.date + 'T00:00:00+09:00')) / 86400000;
    return age >= 0 && age <= CONSENSUS_DAYS ? 'agreed' : 'expired';
  }
  // 지피 1130 CR-B3: 상세·요약·보유 띠에 같은 표시 정책. 합의(agreed)된 비매수 판단만 '현재 합의' 판단으로 세고,
  // 단독·불일치·무응답·만료·기록 불일치는 그 상태로만 센다(행동 집계 제외). 매수 쪽은 합의여도 판단 보류(D4, 건수 없음).
  // 합의 표시도 카드 JSON에 적힌 검토 파일 이름 기준일 뿐 앱이 파일 원문을 확인한 것은 아니다(발행 단계 검사: tests/review-cards-policy.test.cjs).
  var STATUS_ORDER = ['solo', 'mismatch', 'expired', 'no-response', 'disagree'];
  function policyOf(c, d, now) { var cs = consensusOf(c, d, now); return { cs: cs, held: !!HELD[c.verdict], action: cs === 'agreed' && !HELD[c.verdict] }; }
  function tally(d, now) {
    var agreed = {}, st = {}, held = 0;
    d.cards.forEach(function (c) { var p = policyOf(c, d, now); if (p.held) held++; else if (p.action) agreed[c.verdict] = (agreed[c.verdict] || 0) + 1; else st[p.cs] = (st[p.cs] || 0) + 1; });
    return { agreed: agreed, status: st, held: held };
  }
  function plainLabel(x) { return x.replace(/^\S+ /, ''); }
  function tallyParts(t, plain) {
    var lab = function (x) { return plain ? plainLabel(x) : x; };
    return Object.keys(VERDICT).filter(function (k) { return t.agreed[k]; }).map(function (k) { return lab(CONS.agreed[0]) + ' ' + plainLabel(VERDICT[k][0]) + ' ' + t.agreed[k]; })
      .concat(STATUS_ORDER.filter(function (k) { return t.status[k]; }).map(function (k) { return lab(CONS[k][0]) + ' ' + t.status[k]; }))
      .concat(t.held ? ['매수 쪽 판단 보류'] : []);
  }
  function str(x, max) { return typeof x === 'string' && x.length > 0 && x.length <= max; }
  function list(a, max, len) { return Array.isArray(a) && a.length <= max && a.every(function (x) { return str(x, len); }); }
  function https(u) { try { var p = new URL(u); return p.protocol === 'https:' && !p.username && !p.password; } catch (e) { return false; } }
  function validate(doc) {
    if (!doc || doc.v !== 1 || !str(doc.reviewedAt, 40) || !Number.isFinite(Date.parse(doc.reviewedAt)) || !str(doc.notice, 600) || !Array.isArray(doc.cards) || doc.cards.length > 40) return null;
    var cards = doc.cards.filter(function (c) {
      return c && /^[0-9A-Z][0-9A-Z.\-]{0,14}$/.test(c.ticker) && (c.market === 'KR' || c.market === 'US') && str(c.name, 60) &&
        Object.prototype.hasOwnProperty.call(VERDICT, c.verdict) && str(c.headline, 200) && list(c.reasons, 8, 200) && list(c.risks, 8, 200) &&
        Array.isArray(c.sources) && c.sources.length <= 6 && c.sources.every(function (s) { return s && str(s.title, 120) && https(s.url); });
    });
    cards.forEach(function (c) { if (!(Number.isInteger(c.rank) && c.rank > 0 && c.rank < 100)) delete c.rank; if (!list(c.watch, 6, 200)) delete c.watch; });
    return { reviewedAt: doc.reviewedAt, reviewer: str(doc.reviewer, 40) ? doc.reviewer : 'AI', basis: str(doc.basis, 200) ? doc.basis : '', context: str(doc.context, 600) ? doc.context : '', notice: doc.notice, cards: cards };
  }
  var state = { doc: null, error: '', loading: false, loaded: false }, mounts = [];
  var hold = { doc: null }, us = { doc: null }, gateBusy = {}, gateAuto = {};
  function loadUS() {
    if (us.tried || typeof fetch !== 'function') return; us.tried = true;
    fetch('./reviews/fear-us-latest.json', { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw Error(); return r.json(); })
      .then(function (d) { us.doc = validate(d); }).catch(function () { us.doc = null; }).then(function () { renderAll(); ensureLink(); });
  }
  function loadHoldings() {
    if (typeof fetch !== 'function') return;
    fetch('./reviews/holdings-latest.json', { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw Error(); return r.json(); })
      .then(function (d) { hold.doc = validate(d); }).catch(function () { hold.doc = null; }).then(ensureLink);
  }
  function openHoldings() {
    if (!hold.doc || typeof document === 'undefined') return; var old = document.getElementById('hasHoldReview'); if (old) old.remove();
    var bg = node('div', null, 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:12px'); bg.id = 'hasHoldReview';
    var panel = node('section', null, 'background:#fff;border-radius:16px;padding:16px;width:100%;max-width:520px;max-height:90vh;overflow:auto;box-sizing:border-box'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    var body = node('div'); render(body, hold.doc, '🧠 내 보유 종목 AI 검토', 'holdings-review'); panel.appendChild(body);
    var foot = node('div', null, 'position:sticky;bottom:-16px;margin:0 -16px -16px;padding:10px 16px 16px;background:#fff;border-top:1px solid #ddd');
    var close = node('button', '닫기', 'width:100%;min-height:44px;font-size:15px'); close.type = 'button'; close.addEventListener('click', function () { bg.remove(); }); foot.appendChild(close); panel.appendChild(foot);
    bg.addEventListener('click', function (e) { if (e.target === bg) bg.remove(); }); bg.appendChild(panel); document.body.appendChild(bg); panel.scrollTop = 0;
  }
  function load() {
    if (state.loading || typeof fetch !== 'function') return;
    state.loading = true; renderAll();
    fetch('./reviews/latest.json', { cache: 'no-store', credentials: 'omit' }).then(function (r) { if (!r.ok) throw Error(); return r.json(); })
      .then(function (d) { state.doc = validate(d); state.error = state.doc ? '' : '검토 카드 형식이 맞지 않아 표시하지 않습니다.'; })
      .catch(function () { state.error = '검토 카드를 불러오지 못했습니다(인터넷 연결 확인).'; })
      .then(function () { state.loading = false; state.loaded = true; renderAll(); ensureLink(); });
  }
  // 재무 확인 블록(has/fin-panel.js): 카드마다 자리(slot)를 만들고 그 자리만 채운다(판단 라벨·합의 표시는 바꾸지 않음, 근거 추가만).
  // 모듈은 처음 필요할 때 지연 로드: 두 파일 모두 로드돼야 준비 완료, 실패·15초 초과는 보류 안내, 60초 뒤 다시 시도(최대 3회). 실패해도 카드 표시는 그대로.
  var fin = { state: 0, tries: 0, at: 0, queue: [] };
  function finReady() { return typeof window !== 'undefined' && window.HASFinPanel && window.HASReviewFinGate; }
  function finFailNote(q, now) { if ((!now && !q.slot.isConnected) || (q.c.verdict !== 'buy-review' && q.c.verdict !== 'add-review')) return; q.slot.replaceChildren(node('div', '📊 재무 확인: 재무 모듈을 불러오지 못함 · 판단 보류', 'margin-top:6px;padding:8px 10px;border:1px solid #c9d3e0;border-radius:8px;background:#fafcff;font-size:14px;font-weight:700;color:#333', 'fin-module-error')); }
  function finDrain(ok) {
    var qs = fin.queue; fin.queue = [];
    qs.forEach(function (q) { if (!q.slot.isConnected) return; if (ok) { try { window.HASFinPanel.attach(q.slot, q.c, { consensus: q.cs }); } catch (e) { /* 재무 블록 실패는 카드 표시를 막지 않음 */ } } else finFailNote(q); });
  }
  function finLoadModules() {
    try {
      fin.state = 1; fin.tries++; fin.at = Date.now(); var left = 2, done = false;
      var finish = function (ok) { if (done) return; done = true; clearTimeout(timer); fin.state = ok && finReady() ? 3 : 2; fin.at = Date.now(); finDrain(fin.state === 3); };
      var timer = setTimeout(function () { finish(false); }, 15000);
      ['has/review-fin-gate.js', 'has/fin-panel.js'].forEach(function (f) {
        var prev = document.querySelector('script[data-fin-src="' + f + '"]'); if (prev) prev.remove();
        var sc = document.createElement('script'); sc.src = './' + f; sc.async = false; sc.setAttribute('data-fin-src', f);
        sc.onload = function () { if (--left === 0) finish(true); }; sc.onerror = function () { finish(false); }; document.head.appendChild(sc);
      });
    } catch (e) { fin.state = 2; fin.at = Date.now(); finDrain(false); }
  }
  function finHook(art, c, cs) {
    if (typeof document === 'undefined') return;
    var slot = node('div', null, null, 'fin-slot'); art.appendChild(slot);
    if (finReady()) { try { window.HASFinPanel.attach(slot, c, { consensus: cs }); } catch (e) { /* 카드 표시 보호 */ } return; }
    var q = { slot: slot, c: c, cs: cs };
    if (fin.state === 2 && (fin.tries >= 3 || Date.now() - fin.at < 60000)) { finFailNote(q, true); return; }
    fin.queue.push(q); if (fin.state !== 1) finLoadModules();
  }
  function node(tag, text, css, tid) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; if (tid) e.setAttribute('data-testid', tid); return e; }
  function kst(iso) { try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }
  var ORDER = { 'buy-review': 0, 'add-review': 0, 'trim-review': 1, 'sell-review': 1, 'hold-long': 2, 'wait': 3 };
  function render(box, d0, title, testid) {
    box.replaceChildren(); box.setAttribute('data-testid', testid || 'review-cards'); box.style.cssText = 'margin-top:16px;color:#333;font-size:15px;line-height:1.6;overflow-wrap:anywhere';
    box.appendChild(node('h3', title || '🧠 AI 검토 카드 (곡소리 Top10)', 'margin:8px 0'));
    var d = d0 === undefined ? state.doc : d0;
    if (d0 === undefined) { if (state.loading && !state.doc) { box.appendChild(node('p', '검토 카드를 불러오는 중…')); return; } if (state.error) box.appendChild(node('p', state.error, 'color:#8b2020')); }
    if (!d) return;
    box.appendChild(node('p', '검토 ' + kst(d.reviewedAt) + ' · ' + d.reviewer + (d.basis ? ' · ' + d.basis : ''), 'font-size:13px'));
    if (d.context) box.appendChild(node('p', d.context));
    if (d.cards.some(function (c) { return HELD[c.verdict]; })) box.appendChild(node('p', HELD_NOTE, 'font-size:14px;font-weight:700;color:#333;background:#f3f3f3;border-radius:8px;padding:8px 10px', 'review-held-note'));
    // 요약 건수도 카드에 보이는 판단과 같은 정책(CR-B3: 합의된 비매수 판단만 판단 건수, 나머지는 합의 상태 건수, 매수 쪽은 건수 없이 보류).
    var G = typeof window !== 'undefined' && window.HASChartGate, gateKinds = { 'buy-review': 1, 'add-review': 1, 'hold-long': 1 };
    if (G) {
      var gItems = d.cards.filter(function (c) { return gateKinds[c.verdict]; }).map(function (c) { return { ticker: c.ticker, market: c.market }; });
      if (gItems.length) {
        var gk = testid || 'review-cards', busy = !!gateBusy[gk];
        var gb = node('button', busy ? '차트 관문 확인 중…' : '📈 차트 관문 다시 확인', 'min-height:44px;padding:0 14px;font-size:15px;margin:4px 0'); gb.type = 'button'; gb.disabled = busy;
        function runGate() { gateBusy[gk] = true; render(box, d0, title, testid); G.load(gItems).then(function () {}, function () {}).then(function () { gateBusy[gk] = false; renderAll(); }); }
        gb.addEventListener('click', runGate);
        box.appendChild(gb);
        // 6시간 안에 확인한 결과는 저장해 두고 바로 보여 준다. 오래됐으면 화면을 열 때 한 번 자동 확인.
        if (!busy && !gateAuto[gk] && gItems.some(function (x) { return !G.fresh(x.market, x.ticker); })) { gateAuto[gk] = true; setTimeout(runGate, 0); }
        box.appendChild(node('p', '차트 관문은 기업가치·재무 검증 다음에 보는 "지금 살 때인지" 타이밍 참고입니다. 재무·시세 검증과 합의 전이라 분할매수 금액 안내는 보류합니다.', 'font-size:14px'));
      }
    }
    box.appendChild(node('p', tallyParts(tally(d)).join(' · '), 'font-weight:700', 'review-tally'));
    d.cards.slice().sort(function (a, b) { return ORDER[a.verdict] - ORDER[b.verdict] || (a.rank || 99) - (b.rank || 99); }).forEach(function (c) {
      var v = shown(c.verdict), art = node('article', null, 'border-top:1px solid #c9d3e0;padding:10px 0');
      var p = policyOf(c, d), cs = p.cs, cl = CONS[cs], quote = !p.held && !p.action && cs !== 'disagree' && cs !== 'no-response';
      if (!p.held && !p.action) v = [CONS[cs][0], CONS[cs][1]]; // CR-B3: 합의 전 판단은 행동 라벨 대신 합의 상태로(불일치·응답 없음은 원 판단도 숨김, 7절)
      art.appendChild(node('div', (c.rank ? '우선순위 ' + c.rank + ' · ' : '') + c.name + ' (' + c.ticker + ') · ' + v[0], 'font-weight:800;color:' + v[1]));
      if (quote) art.appendChild(node('div', '클로 조사 원문 판단: ' + plainLabel(VERDICT[c.verdict][0]) + ' (합의 전 참고 · 현재 합의된 행동 아님)', 'font-size:13px;color:#333', 'review-quote'));
      art.appendChild(node('div', (cs === 'disagree' || cs === 'no-response' ? '지피 검토' : cl[0]) + (cs === 'agreed' || cs === 'disagree' || cs === 'expired' ? ' · ' + c.consensus.review.replace(/\.md$/, '') : ''), 'font-size:13px;font-weight:700;color:' + cl[1], 'review-consensus'));
      art.appendChild(node('div', (HELD[c.verdict] ? '📝 클로 조사 의견(원문 인용 · 매수 권유 아님): ' : !p.action ? '📝 클로 조사 의견(원문 인용 · 합의 전 참고): ' : '') + c.headline, null, 'review-headline'));
      var gr = G && gateKinds[c.verdict] ? G.cached(c.market, c.ticker) : null;
      if (gr) { var gd = G.describe(gr), gs = gateShown(gr); art.appendChild(node('div', '차트 관문: ' + gs.label, 'font-weight:800;color:' + gs.color, 'review-gate')); if (gd.detail) art.appendChild(node('div', gd.detail, 'font-size:14px')); 
        /* 5% 예외 정찰 안내는 선행 검증(재무·시세·합의)을 우회하지 않도록 판단 보류 중에는 표시하지 않는다(D4). */ }
      var det = node('details'); det.appendChild(node('summary', '근거·반론·출처 보기', 'min-height:44px;display:flex;align-items:center;cursor:pointer'));
      det.appendChild(node('div', '👍 근거', 'font-weight:700')); c.reasons.forEach(function (x) { det.appendChild(node('div', '· ' + x)); });
      det.appendChild(node('div', '⚠ 반론·위험', 'font-weight:700;margin-top:6px')); c.risks.forEach(function (x) { det.appendChild(node('div', '· ' + x)); });
      if (c.watch) { det.appendChild(node('div', '📌 산 뒤 점검 기준(매도·장기보유 신호)', 'font-weight:700;margin-top:6px')); c.watch.forEach(function (x) { det.appendChild(node('div', '· ' + x)); }); }
      if (c.sources.length) { det.appendChild(node('div', '출처', 'font-weight:700;margin-top:6px')); c.sources.forEach(function (s) { var a = node('a', s.title); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.cssText = 'display:block;min-height:32px;color:#0d47a1'; det.appendChild(a); }); }
      art.appendChild(det); finHook(art, c, cs); box.appendChild(art);
    });
    box.appendChild(node('p', d.notice, 'border-top:1px solid #c9d3e0;padding-top:8px;font-size:14px'));
  }
  // 국내(latest.json)와 미국(fear-us-latest.json) 검토 카드를 한 곡소리 화면에 차례로 보여준다.
  function renderMount(m) {
    // 곡소리 Top10의 시장 탭(전체/국내/미국)을 따른다: 국내면 국내 카드만, 미국이면 미국 카드만.
    var mk = typeof window !== 'undefined' && typeof window.HASFearMarket === 'string' ? window.HASFearMarket : '';
    m.replaceChildren(); if (mk !== 'US') { var kr = node('div'); m.appendChild(kr); render(kr); }
    if (us.doc && mk !== 'KR') { var u = node('div'); m.appendChild(u); render(u, us.doc, '🧠 AI 검토 카드 (미국 곡소리 Top10)', 'review-cards-us'); }
  }
  function renderAll() { mounts = mounts.filter(function (m) { return m.isConnected; }); mounts.forEach(renderMount); }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('has:fear-market', function () { renderAll(); });
  function mount(box) { if (!box) return; mounts = mounts.filter(function (m) { return m !== box && m.isConnected; }); mounts.push(box); renderMount(box); if (!state.loaded) load(); loadUS(); }
  // 현황 '오늘의 투자 판단' 띠에 곡소리 AI 매수 검토 건수를 붙이고, 누르면 곡소리 화면의 카드로 이동한다.
  function buys(d) { return d ? d.cards.filter(function (c) { return c.verdict === 'buy-review'; }).length : 0; }
  function summary() { var d = state.doc || us.doc; if (!d) return null; var kr = buys(state.doc), u = buys(us.doc); return { buy: kr + u, kr: kr, us: u, held: true, cards: (state.doc ? state.doc.cards.length : 0) + (us.doc ? us.doc.cards.length : 0), date: (function () { try { var x = new Date(Date.parse(d.reviewedAt) + 9 * 3600000); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); } catch (e) { return ''; } })() }; }
  function open() {
    try { if (window.KSTRadar && window.KSTRadar.openFear) window.KSTRadar.openFear(); } catch (e) { return; }
    setTimeout(function () { var t = document.querySelector('[data-testid=review-cards]'); if (t) t.scrollIntoView({ block: 'start' }); }, 300);
  }
  // 규칙 엔진 0건 3칸(.hdb-mini)이 숨겨지면 위험 경고 줄(없으면 머리줄) 바로 아래에 붙인다(순태씨 2026-11-25).
  function anchorOf(strip) { return strip.querySelector('.hdb-mini') || strip.querySelector('[data-testid=hdb-risk-line]') || strip.querySelector('.hdb-head'); }
  function ensureLink() { ensureLink0(); ensureScore(); }
  function ensureScore() {
    if (typeof document === 'undefined' || !window.HASScorecard) return; var strip = document.getElementById('hasBriefStrip'); if (!strip) return;
    var mini = anchorOf(strip), sb = strip.querySelector('[data-testid=hdb-ai-score]'); if (!mini) { if (sb) sb.remove(); return; }
    var after = strip.querySelector('[data-testid=hdb-ai-fear]') || strip.querySelector('[data-testid=hdb-ai-hold]') || mini;
    if (sb && sb.previousElementSibling === after) return; if (sb) sb.remove();
    sb = node('button', '📊 클로 추천 성적표 · 내 실전 검증 ▶', 'display:block;width:100%;min-height:44px;margin-top:8px;padding:6px 10px;border:2px solid #4a148c;border-radius:10px;background:#fff;color:#4a148c;font-size:15px;font-weight:800;text-align:left');
    sb.type = 'button'; sb.setAttribute('data-testid', 'hdb-ai-score'); sb.addEventListener('click', function (e) { e.stopPropagation(); window.HASScorecard.open(); }); after.after(sb);
  }
  function ensureLink0() {
    if (typeof document === 'undefined') return; var strip = document.getElementById('hasBriefStrip'); if (!strip) return;
    var mini0 = anchorOf(strip), oh = strip.querySelector('[data-testid=hdb-ai-hold]');
    if (mini0 && hold.doc && hold.doc.cards.length) {
      var hl = '🧠 내 보유 종목 AI 검토: ' + tallyParts(tally(hold.doc), true).join(' · ') + ' · 보기 ▶'; // CR-A2 매수 쪽 건수 숨김, CR-B3 합의 전 판단은 상태로만
      if (!oh || oh.textContent !== hl || oh.previousElementSibling !== mini0) { if (oh) oh.remove(); oh = node('button', hl, 'display:block;width:100%;min-height:44px;margin-top:8px;padding:6px 10px;border:2px solid #0d47a1;border-radius:10px;background:#fff;color:#0d47a1;font-size:15px;font-weight:800;text-align:left'); oh.type = 'button'; oh.setAttribute('data-testid', 'hdb-ai-hold'); oh.addEventListener('click', function (e) { e.stopPropagation(); openHoldings(); }); mini0.after(oh); }
    } else if (oh) oh.remove();
    var mini = strip.querySelector('[data-testid=hdb-ai-hold]') || mini0, old = strip.querySelector('[data-testid=hdb-ai-fear]'), sm = summary();
    if (!mini || !sm || !sm.cards) { if (old) old.remove(); return; }
    // D4: 매수 건수는 현황에 띄우지 않는다(행동 유도 보류). 카드로 가는 길만 남긴다.
    var label = '🧠 곡소리 AI 조사 의견 보기 ▶ (' + sm.date + ' · 판단 보류)';
    if (old && old.textContent === label && old.previousElementSibling === mini) return; if (old) old.remove();
    var b = node('button', label, 'display:block;width:100%;min-height:44px;margin-top:8px;padding:6px 10px;border:2px solid #333;border-radius:10px;background:#fff;color:#333;font-size:15px;font-weight:800;text-align:left');
    b.type = 'button'; b.setAttribute('data-testid', 'hdb-ai-fear'); b.addEventListener('click', function (e) { e.stopPropagation(); open(); }); mini.after(b);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    document.addEventListener('DOMContentLoaded', function () {
      var strip = document.getElementById('hasBriefStrip'); if (strip) new MutationObserver(ensureLink).observe(strip, { childList: true });
      load(); loadHoldings(); loadUS();
    });
  }
  return { validate: validate, mount: mount, summary: summary, open: open, openHoldings: openHoldings, VERDICT: VERDICT, HELD: HELD, shown: shown, consensusOf: consensusOf, CONS: CONS, policyOf: policyOf, tally: tally, tallyParts: tallyParts };
});
