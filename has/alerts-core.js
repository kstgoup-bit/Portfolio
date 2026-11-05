/* HAS 23단계 — 선제 알림 "후보 생성·중복 방지"(순수 함수). 실제 푸시 전송은 하지 않는다.
   확인된 데이터에 근거한 신호·조언만 알림이 된다. 같은 신호 반복 제한(쿨다운, 단계 상승 시에만 재알림)과 하루 상한으로 과다 경고를 막는다.
   앱이 꺼진 상태의 알림은 별도 실행·푸시 인프라가 필요할 수 있어 PWA만으로 항상 된다고 말하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASAlertsCore = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var TYPES = Object.freeze({
    'oversold-quality': { label: '우량주 과잉 하락 후보', priority: 5 }, 'earnings-deterioration': { label: '보유종목 실적 악화', priority: 3 }, 'weight-over': { label: '목표 비중 초과', priority: 4 },
    'cash-low': { label: '현금 비중 부족', priority: 6 }, 'market-risk': { label: '시장 위험 급증', priority: 1 }, 'thesis-review': { label: '투자 논리 재검토 필요', priority: 2 } });
  var DELIVERY_NOTICE = '이 단계는 알림 후보의 생성·표시·중복 방지까지입니다. 앱을 닫은 상태에서의 푸시는 별도 실행·푸시 서버가 필요할 수 있으며 브라우저 PWA만으로 항상 보장되지 않습니다.';
  var DEFAULTS = Object.freeze({ cooldownDays: 7, dailyMax: 5 });
  var DAY = 86400000;
  /* 신호·조언 → 알림 후보. 근거(evidence)가 없거나 자료 불충분(dataOk=false)이면 만들지 않는다(rejected에 이유). */
  function candidates(items, nowISO) {
    var out = [], rejected = [];
    (items || []).forEach(function (it) {
      var map = { 'drawdown+advice': 'oversold-quality', 'fundamental-deterioration': 'earnings-deterioration', concentration: 'weight-over', 'cash-low': 'cash-low', 'market-risk': 'market-risk', 'thesis-broken': 'thesis-review' };
      var type = map[it.kind]; if (!type) { rejected.push({ id: it.id, reason: '알림 대상 아님' }); return; }
      if (!it.dataOk) { rejected.push({ id: it.id, reason: '자료 불충분(미검증·오래됨)' }); return; }
      if (!Array.isArray(it.evidence) || !it.evidence.length) { rejected.push({ id: it.id, reason: '근거 없음' }); return; }
      out.push({ key: type + '|' + (it.ticker || it.scope || '*'), type: type, label: TYPES[type].label, ticker: it.ticker || null, level: typeof it.level === 'number' ? it.level : 1, evidence: it.evidence.slice(), asOfDate: it.asOfDate || null, source: it.source || null, priority: TYPES[type].priority, createdAt: nowISO });
    });
    return { candidates: out, rejected: rejected };
  }
  function emptyState() { return Object.freeze({ sent: Object.freeze({}), day: null, countToday: 0 }); }
  /* 표시할 알림 선택. 쿨다운 중 같은 키는 단계(level)가 올라갈 때만 통과. 하루 상한 초과분은 우선순위 낮은 것부터 보류. 입력 상태는 변경하지 않음. */
  function select(cands, nowISO, state, settings) {
    var s = Object.assign({}, DEFAULTS, settings || {}), st = state || emptyState(), today = String(nowISO).slice(0, 10), count = st.day === today ? st.countToday : 0, sent = Object.assign({}, st.sent);
    var shown = [], suppressed = [], seen = {};
    cands.slice().sort(function (a, b) { return a.priority - b.priority || b.level - a.level; }).forEach(function (c) {
      if (seen[c.key]) { suppressed.push({ key: c.key, reason: '같은 실행에서 중복' }); return; } seen[c.key] = true;
      var prev = sent[c.key];
      if (prev && (Date.parse(nowISO) - Date.parse(prev.at)) < s.cooldownDays * DAY && c.level <= prev.level) { suppressed.push({ key: c.key, reason: '쿨다운 중(' + s.cooldownDays + '일) 반복 알림 제한' }); return; }
      if (count >= s.dailyMax) { suppressed.push({ key: c.key, reason: '하루 상한(' + s.dailyMax + '건) 초과' }); return; }
      shown.push(c); count++; sent[c.key] = { at: nowISO, level: c.level };
    });
    return { shown: shown, suppressed: suppressed, state: Object.freeze({ sent: Object.freeze(sent), day: today, countToday: count }) };
  }
  return Object.freeze({ TYPES: TYPES, DEFAULTS: DEFAULTS, DELIVERY_NOTICE: DELIVERY_NOTICE, candidates: candidates, emptyState: emptyState, select: select });
});
