/* 검토 카드의 '📊 재무 확인' 블록 — 저장소의 자동 수집본(data/fundamentals/<티커>.json)을 읽어 보여 준다. 읽기 전용·주문 없음.
 * 이 모듈은 카드의 판단 라벨을 바꾸지 않는다(해제 여부는 has/review-fin-gate.js가 판정하고, 여기서는 조건 충족 상태만 설명한다).
 * 시세 독립 대조(price)는 아직 앱에 연결되지 않아 항상 '미연결'로 전달한다 → 매수 쪽 판단 보류는 풀리지 않는다.
 * 자료는 SEC 공시 자동 수집본이며 검증 전(미검증)이다. 국내 종목은 DART 연결 전이라 '미연결'만 표시한다. 투자 자문 아님. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASFinPanel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BUY = { 'buy-review': 1, 'add-review': 1 }, STALE_FETCH_DAYS = 4, cache = {}, seenBuy = [];
  var PV_KO = { match: '✅ 두 출처(Yahoo·KIS) 확정 종가 일치', short: '자료 부족(공통 날짜 5일 미만)', partial: '최근 일치·과거 일부 차이', mismatch: '❗ 최근 종가 차이', stale: '⏳ 두 출처 최신 날짜가 다르거나 오래됨', 'missing-kis': 'KIS 자료 없음', 'missing-yahoo': 'Yahoo 자료 없음', 'no-common-date': '같은 날짜 자료 없음', 'invalid-ticker': '대조 불가 종목' };
  var STATUS_KO = { pass: '양호', warn: '주의', fail: '취약', na: '제외' };
  var MISS_KO = {
    'financials-missing': '재무 자료 없음·형식 불명', 'financials-weak': '재무 취약', 'financials-not-strong': '재무 판정이 "우량 근거 충분"이 아님',
    'financials-stale-or-conflict': '재무 자료가 오래됐거나 3년 미만·값 충돌', 'price-not-verified': '시세 독립 대조 미연결', 'synthetic-input': '가상 자료', 'invalid-now': '시각 오류', 'invalid-input': '입력 오류'
  };
  var CS_KO = { solo: '클로 단독', mismatch: '합의 기록 불일치', expired: '합의 기한(7일) 지남', 'no-response': '지피 응답 없음', disagree: '의견 불일치' };
  function node(tag, text, css, tid) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (css) e.style.cssText = css; if (tid) e.setAttribute('data-testid', tid); return e; }
  function kst(iso) { try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso); } }
  function missText(code) { if (MISS_KO[code]) return MISS_KO[code]; var m = /^consensus-(.+)$/.exec(code); return m ? '지피 합의 없음(' + (CS_KO[m[1]] || m[1]) + ')' : code; }
  function valid(rec, ticker, F) {
    return rec && typeof rec === 'object' && rec.version === 1 && rec.ticker === ticker && typeof rec.fetchedAt === 'string' && Number.isFinite(Date.parse(rec.fetchedAt)) && F && F.validNormalized(rec.normalized);
  }
  function request(ticker, ctx) {
    var st = cache[ticker]; if (st) return st;
    st = cache[ticker] = { state: 'loading' };
    if (typeof fetch !== 'function') { st.state = 'error'; return st; }
    fetch('./data/fundamentals/' + encodeURIComponent(ticker) + '.json', { cache: 'no-store', credentials: 'omit' })
      .then(function (r) { if (r.status === 404) { st.state = 'missing'; return null; } if (!r.ok) throw Error('http'); return r.json(); })
      .then(function (j) { if (st.state === 'missing') return; st.rec = j; st.state = 'ok'; })
      .catch(function () { st.state = 'error'; })
      .then(function () { if (ctx && typeof ctx.onReady === 'function') ctx.onReady(); });
    return st;
  }
  /* art: 카드 article, card: {ticker, market, verdict}, ctx: {consensus, now, onReady} */
  function attach(art, card, ctx) {
    if (!art || !card || typeof document === 'undefined') return;
    ctx = ctx || {}; var buy = !!BUY[card.verdict], now = typeof ctx.now === 'number' ? ctx.now : Date.now();
    var box = node('div', null, 'margin-top:6px;padding:8px 10px;border:1px solid #c9d3e0;border-radius:8px;background:#fafcff;font-size:14px;line-height:1.55;color:#333', 'fin-panel');
    if (card.market !== 'US') { if (buy) { box.appendChild(node('div', '📊 재무 확인: 국내(DART) 재무 연결 전 · 판단 보류', 'font-weight:700')); art.appendChild(box); } return; }
    var F = typeof window !== 'undefined' ? window.HASFundamentalFilter : null, G = typeof window !== 'undefined' ? window.HASReviewFinGate : null, st = request(card.ticker, ctx);
    if (st.state === 'loading') { if (buy) { box.appendChild(node('div', '📊 재무 자료를 불러오는 중…')); art.appendChild(box); } return; }
    if (st.state !== 'ok' || !valid(st.rec, card.ticker, F)) {
      if (!buy) return;
      box.appendChild(node('div', '📊 재무 확인: ' + (st.state === 'missing' ? '자동 수집 대상 아님·자료 없음' : '자료를 읽지 못함 또는 형식 불명') + ' · 판단 보류', 'font-weight:700'));
      art.appendChild(box); return;
    }
    var PV = typeof window !== 'undefined' ? window.HASPriceVerifyUS : null;
    if (buy && seenBuy.indexOf(card.ticker) < 0) seenBuy.push(card.ticker);
    var rec = st.rec, a = F.assess(rec.normalized, { now: now }), ageDays = (now - Date.parse(rec.fetchedAt)) / 86400000;
    box.appendChild(node('div', '📊 재무 확인(SEC 공시 자동 수집 · 검증 전): ' + a.labelKo + (a.reason ? ' — ' + a.reason : ''), 'font-weight:700', 'fin-label'));
    box.appendChild(node('div', '최근 결산 ' + (a.asOf || '없음') + ' · 수집 ' + kst(rec.fetchedAt) + (ageDays > STALE_FETCH_DAYS ? ' · ⚠ 수집한 지 ' + Math.floor(ageDays) + '일 지남(자동 수집이 멈췄을 수 있음)' : ''), 'font-size:13px', 'fin-meta'));
    if (buy && G) {
      var g = G.evaluate({ card: { ticker: card.ticker, market: card.market, verdict: card.verdict }, assessment: ageDays > STALE_FETCH_DAYS ? null : a, price: PV ? PV.trustOf(card.ticker, now) : null, consensus: ctx.consensus }, new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'));
      var miss = ageDays > STALE_FETCH_DAYS ? ['financials-missing'].concat(g.missing.filter(function (x) { return x !== 'financials-missing'; })) : g.missing;
      box.appendChild(node('div', g.state === 'released' ? '보류 해제 조건은 모두 충족(재무·시세·합의) — 카드 라벨 변경은 순태씨 승인 후 별도라 지금은 판단 보류 표시를 유지합니다' : '판단 보류 유지 — 남은 조건: ' + miss.map(missText).join(' · '), 'font-weight:700;color:#333', 'fin-gate'));
      if (PV) {
        var pr = PV.resultOf(card.ticker), line = pr ? '시세 독립 대조: ' + (PV_KO[pr.r.status] || pr.r.status) + (pr.r.latest ? ' · 확정 종가 기준일 ' + pr.r.latest.d : '') : PV.isBusy() ? '시세 독립 대조 조회 중…' : '시세 독립 대조: 아직 조회 전(버튼을 누를 때만 KIS를 호출합니다)';
        box.appendChild(node('div', line + (PV.lastError() ? ' · ' + PV.lastError() : ''), 'font-size:13px', 'fin-price'));
        var pb = node('button', PV.isBusy() ? '시세 대조 중…' : '📈 시세 독립 대조(Yahoo·KIS)', 'min-height:44px;padding:0 14px;font-size:14px;margin:4px 0', 'fin-price-btn'); pb.type = 'button'; pb.disabled = PV.isBusy();
        pb.addEventListener('click', function () { PV.verify(seenBuy.slice(0, PV.MAX_TICKERS)).then(function () { if (ctx.onReady) ctx.onReady(); }); if (ctx.onReady) ctx.onReady(); });
        box.appendChild(pb);
      }
    }
    if (a.checks && a.checks.length) {
      var det = node('details'); det.appendChild(node('summary', '재무 항목별 보기', 'min-height:44px;display:flex;align-items:center;cursor:pointer'));
      a.checks.forEach(function (c) { det.appendChild(node('div', '· ' + c.name + ': ' + (STATUS_KO[c.status] || c.status) + (c.evidence ? ' — ' + c.evidence : ''))); });
      det.appendChild(node('div', '자동 수집본이며 공시 원문과 일치 여부는 검증 전입니다. 매수·매도 지시가 아닙니다.', 'font-size:13px;margin-top:4px'));
      box.appendChild(det);
    }
    art.appendChild(box);
  }
  return Object.freeze({ attach: attach, _reset: function () { cache = {}; seenBuy = []; } });
});
