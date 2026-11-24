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
  function node(tag, text, css) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; return e; }
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
    var counts = {}; d.cards.forEach(function (c) { counts[c.verdict] = (counts[c.verdict] || 0) + 1; });
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
        box.appendChild(node('p', '실적은 "사도 될 회사"인지, 차트 관문은 "지금 살 때"인지를 봅니다. 1·3·3·3 분할: 하락 추세면 기다리고, 바닥을 다지면 정찰병(목표 금액의 10%), 20일선을 회복해 버티면 30%, 60일선 회복·저점 상승이면 30%, 다음 실적까지 확인되면 마지막 30%를 삽니다.', 'font-size:14px'));
      }
    }
    box.appendChild(node('p', Object.keys(VERDICT).filter(function (k) { return counts[k]; }).map(function (k) { return VERDICT[k][0] + ' ' + counts[k]; }).join(' · '), 'font-weight:700'));
    d.cards.slice().sort(function (a, b) { return ORDER[a.verdict] - ORDER[b.verdict] || (a.rank || 99) - (b.rank || 99); }).forEach(function (c) {
      var v = VERDICT[c.verdict], art = node('article', null, 'border-top:1px solid #c9d3e0;padding:10px 0');
      art.appendChild(node('div', (c.rank ? '우선순위 ' + c.rank + ' · ' : '') + c.name + ' (' + c.ticker + ') · ' + v[0], 'font-weight:800;color:' + v[1]));
      art.appendChild(node('div', c.headline));
      var gr = G && gateKinds[c.verdict] ? G.cached(c.market, c.ticker) : null;
      if (gr) { var gd = G.describe(gr); art.appendChild(node('div', '차트 관문: ' + gd.label, 'font-weight:800;color:' + gd.color)); if (gd.detail) art.appendChild(node('div', gd.detail, 'font-size:14px')); 
        if (gr.stage === 'falling' && c.rank === 1 && c.verdict === 'buy-review') art.appendChild(node('div', '🔎 예외 정찰 가능: 계획 금액의 5%만, 종목당 1회. 더 떨어져도 추가 매수 금지 → 바닥 다지기로 바뀌면 5% 더 채워 정찰병 10%. 실전 검증에 "예외 정찰"로 기록.', 'font-size:14px;font-weight:700;color:#4a148c;margin-top:4px')); }
      var det = node('details'); det.appendChild(node('summary', '근거·반론·출처 보기', 'min-height:44px;display:flex;align-items:center;cursor:pointer'));
      det.appendChild(node('div', '👍 근거', 'font-weight:700')); c.reasons.forEach(function (x) { det.appendChild(node('div', '· ' + x)); });
      det.appendChild(node('div', '⚠ 반론·위험', 'font-weight:700;margin-top:6px')); c.risks.forEach(function (x) { det.appendChild(node('div', '· ' + x)); });
      if (c.watch) { det.appendChild(node('div', '📌 산 뒤 점검 기준(매도·장기보유 신호)', 'font-weight:700;margin-top:6px')); c.watch.forEach(function (x) { det.appendChild(node('div', '· ' + x)); }); }
      if (c.sources.length) { det.appendChild(node('div', '출처', 'font-weight:700;margin-top:6px')); c.sources.forEach(function (s) { var a = node('a', s.title); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.cssText = 'display:block;min-height:32px;color:#0d47a1'; det.appendChild(a); }); }
      art.appendChild(det); box.appendChild(art);
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
  function summary() { var d = state.doc || us.doc; if (!d) return null; var kr = buys(state.doc), u = buys(us.doc); return { buy: kr + u, kr: kr, us: u, date: (function () { try { var x = new Date(Date.parse(d.reviewedAt) + 9 * 3600000); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); } catch (e) { return ''; } })() }; }
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
      var cnt = {}; hold.doc.cards.forEach(function (c) { cnt[c.verdict] = (cnt[c.verdict] || 0) + 1; });
      var hl = '🧠 내 보유 종목 AI 검토: ' + Object.keys(VERDICT).filter(function (k) { return cnt[k]; }).map(function (k) { return VERDICT[k][0].replace(/^\S+ /, '') + ' ' + cnt[k]; }).join(' · ') + ' · 보기 ▶';
      if (!oh || oh.textContent !== hl || oh.previousElementSibling !== mini0) { if (oh) oh.remove(); oh = node('button', hl, 'display:block;width:100%;min-height:44px;margin-top:8px;padding:6px 10px;border:2px solid #0d47a1;border-radius:10px;background:#fff;color:#0d47a1;font-size:15px;font-weight:800;text-align:left'); oh.type = 'button'; oh.setAttribute('data-testid', 'hdb-ai-hold'); oh.addEventListener('click', function (e) { e.stopPropagation(); openHoldings(); }); mini0.after(oh); }
    } else if (oh) oh.remove();
    var mini = strip.querySelector('[data-testid=hdb-ai-hold]') || mini0, old = strip.querySelector('[data-testid=hdb-ai-fear]'), sm = summary();
    if (!mini || !sm || !sm.buy) { if (old) old.remove(); return; }
    var label = '🧠 곡소리 AI 매수 검토 ' + sm.buy + '건' + (sm.us ? ' (국내 ' + sm.kr + ' · 미국 ' + sm.us + ')' : ' (' + sm.date + ' 검토)') + ' · 보기 ▶';
    if (old && old.textContent === label && old.previousElementSibling === mini) return; if (old) old.remove();
    var b = node('button', label, 'display:block;width:100%;min-height:44px;margin-top:8px;padding:6px 10px;border:2px solid #1b5e20;border-radius:10px;background:#fff;color:#1b5e20;font-size:15px;font-weight:800;text-align:left');
    b.type = 'button'; b.setAttribute('data-testid', 'hdb-ai-fear'); b.addEventListener('click', function (e) { e.stopPropagation(); open(); }); mini.after(b);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    document.addEventListener('DOMContentLoaded', function () {
      var strip = document.getElementById('hasBriefStrip'); if (strip) new MutationObserver(ensureLink).observe(strip, { childList: true });
      load(); loadHoldings(); loadUS();
    });
  }
  return { validate: validate, mount: mount, summary: summary, open: open, openHoldings: openHoldings, VERDICT: VERDICT };
});
