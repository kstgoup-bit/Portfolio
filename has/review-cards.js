/* HAS: AI 검토 카드(클로가 조사해 reviews/latest.json으로 올린 의견)를 곡소리 화면에 보여준다.
 * 같은 사이트의 정적 JSON만 읽는다(GAS·키·저장소 사용 없음). 가격·신호·투자기록을 바꾸지 않는다.
 * 의견은 투자 자문이 아니며 최종 결정은 순태씨가 한다. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASReviewCards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERDICT = {
    'buy-review': ['🟢 매수 검토', '#1b5e20'], 'hold-long': ['🔵 장기보유', '#0d47a1'],
    'wait': ['🟡 관망·보류', '#8a4b00'], 'sell-review': ['🔴 매도 검토', '#8b2020']
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
    return { reviewedAt: doc.reviewedAt, reviewer: str(doc.reviewer, 40) ? doc.reviewer : 'AI', basis: str(doc.basis, 200) ? doc.basis : '', context: str(doc.context, 600) ? doc.context : '', notice: doc.notice, cards: cards };
  }
  var state = { doc: null, error: '', loading: false, loaded: false }, mounts = [];
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
  var ORDER = { 'buy-review': 0, 'hold-long': 1, 'wait': 2, 'sell-review': 3 };
  function render(box) {
    box.replaceChildren(); box.setAttribute('data-testid', 'review-cards'); box.style.cssText = 'margin-top:16px;color:#333;font-size:15px;line-height:1.6;overflow-wrap:anywhere';
    box.appendChild(node('h3', '🧠 AI 검토 카드 (곡소리 Top10)', 'margin:8px 0'));
    if (state.loading && !state.doc) { box.appendChild(node('p', '검토 카드를 불러오는 중…')); return; }
    if (state.error) { box.appendChild(node('p', state.error, 'color:#8b2020')); }
    var d = state.doc; if (!d) return;
    box.appendChild(node('p', '검토 ' + kst(d.reviewedAt) + ' · ' + d.reviewer + (d.basis ? ' · ' + d.basis : ''), 'font-size:13px'));
    if (d.context) box.appendChild(node('p', d.context));
    var counts = {}; d.cards.forEach(function (c) { counts[c.verdict] = (counts[c.verdict] || 0) + 1; });
    box.appendChild(node('p', Object.keys(VERDICT).filter(function (k) { return counts[k]; }).map(function (k) { return VERDICT[k][0] + ' ' + counts[k]; }).join(' · '), 'font-weight:700'));
    d.cards.slice().sort(function (a, b) { return ORDER[a.verdict] - ORDER[b.verdict]; }).forEach(function (c) {
      var v = VERDICT[c.verdict], art = node('article', null, 'border-top:1px solid #c9d3e0;padding:10px 0');
      art.appendChild(node('div', c.name + ' (' + c.ticker + ') · ' + v[0], 'font-weight:800;color:' + v[1]));
      art.appendChild(node('div', c.headline));
      var det = node('details'); det.appendChild(node('summary', '근거·반론·출처 보기', 'min-height:44px;display:flex;align-items:center;cursor:pointer'));
      det.appendChild(node('div', '👍 근거', 'font-weight:700')); c.reasons.forEach(function (x) { det.appendChild(node('div', '· ' + x)); });
      det.appendChild(node('div', '⚠ 반론·위험', 'font-weight:700;margin-top:6px')); c.risks.forEach(function (x) { det.appendChild(node('div', '· ' + x)); });
      if (c.sources.length) { det.appendChild(node('div', '출처', 'font-weight:700;margin-top:6px')); c.sources.forEach(function (s) { var a = node('a', s.title); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.cssText = 'display:block;min-height:32px;color:#0d47a1'; det.appendChild(a); }); }
      art.appendChild(det); box.appendChild(art);
    });
    box.appendChild(node('p', d.notice, 'border-top:1px solid #c9d3e0;padding-top:8px;font-size:14px'));
  }
  function renderAll() { mounts = mounts.filter(function (m) { return m.isConnected; }); mounts.forEach(render); }
  function mount(box) { if (!box) return; mounts = mounts.filter(function (m) { return m !== box && m.isConnected; }); mounts.push(box); render(box); if (!state.loaded) load(); }
  // 현황 '오늘의 투자 판단' 띠에 곡소리 AI 매수 검토 건수를 붙이고, 누르면 곡소리 화면의 카드로 이동한다.
  function summary() { var d = state.doc; if (!d) return null; var n = d.cards.filter(function (c) { return c.verdict === 'buy-review'; }).length; return { buy: n, date: (function () { try { var x = new Date(Date.parse(d.reviewedAt) + 9 * 3600000); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); } catch (e) { return ''; } })() }; }
  function open() {
    try { if (window.KSTRadar && window.KSTRadar.openFear) window.KSTRadar.openFear(); } catch (e) { return; }
    setTimeout(function () { var t = document.querySelector('[data-testid=review-cards]'); if (t) t.scrollIntoView({ block: 'start' }); }, 300);
  }
  function ensureLink() {
    if (typeof document === 'undefined') return; var strip = document.getElementById('hasBriefStrip'); if (!strip) return;
    var mini = strip.querySelector('.hdb-mini'), old = strip.querySelector('[data-testid=hdb-ai-fear]'), sm = summary();
    if (!mini || !sm || !sm.buy) { if (old) old.remove(); return; }
    var label = '🧠 곡소리 AI 매수 검토 ' + sm.buy + '건 (' + sm.date + ' 검토) · 보기 ▶';
    if (old && old.textContent === label && old.previousElementSibling === mini) return; if (old) old.remove();
    var b = node('button', label, 'display:block;width:100%;min-height:44px;margin-top:8px;padding:6px 10px;border:2px solid #1b5e20;border-radius:10px;background:#fff;color:#1b5e20;font-size:15px;font-weight:800;text-align:left');
    b.type = 'button'; b.setAttribute('data-testid', 'hdb-ai-fear'); b.addEventListener('click', function (e) { e.stopPropagation(); open(); }); mini.after(b);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    document.addEventListener('DOMContentLoaded', function () {
      var strip = document.getElementById('hasBriefStrip'); if (strip) new MutationObserver(ensureLink).observe(strip, { childList: true });
      load();
    });
  }
  return { validate: validate, mount: mount, summary: summary, open: open, VERDICT: VERDICT };
});
