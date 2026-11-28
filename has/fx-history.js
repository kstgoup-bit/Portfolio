/* 원/달러 일별 환율(data/fx/usdkrw.json, tools/fetch-usdkrw.cjs가 수집) 검증·조회. 읽기 전용, 저장·주문 없음.
 * 용도: 달러 지수(QQQ) 수익률을 원화로 환산해 원화 평가 계좌와 같은 통화로 알파를 계산(순태씨 2026-11-28 '1번으로 하자').
 *   QQQ 원화 수익률 = (1 + 달러 수익률) × (끝 환율 / 시작 환율) − 1
 * 규칙: 문서 형식·단위·날짜·값 범위(500~3000원)가 하나라도 이상하면 전체를 쓰지 않는다. 두 출처 대조 충돌('conflict') 날짜는 건너뛴다.
 *   지수 관측일 당일 또는 그 이전 최대 4일 안의 환율만 쓴다(그보다 멀면 보류). 수집 시각이 미래(+5분 초과)면 전체 보류.
 *   연준 H.10과 대조 안 된 날짜('unchecked')를 쓰면 경고를 붙인다. 결과는 항상 미검증 참고값. 투자 자문 아님. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASFxHistory = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAYRE = /^\d{4}-\d{2}-\d{2}$/, ISO = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/;
  var MAX_GAP_DAYS = 4, MIN_V = 500, MAX_V = 3000, MAX_POINTS = 5000, SKEW_MS = 5 * 60000, CHECKS = { ok: 1, unchecked: 1, fred: 1, conflict: 1 };
  function day(s) { if (typeof s !== 'string' || !DAYRE.test(s)) return false; var t = Date.parse(s + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; }
  function okV(v) { return typeof v === 'number' && Number.isFinite(v) && v >= MIN_V && v <= MAX_V; }
  /* 문서 검증 → {ok:true, points:[{d,v,check}], fetchedAt} 또는 {ok:false, reason} */
  function parse(doc, now) {
    try {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.version !== 1 || doc.pair !== 'USDKRW' || doc.unit !== 'KRW per 1 USD') return { ok: false, reason: 'fx-invalid' };
      if (typeof now !== 'number' || !Number.isFinite(now)) return { ok: false, reason: 'fx-invalid' };
      if (typeof doc.fetchedAt !== 'string' || !ISO.test(doc.fetchedAt) || !day(doc.fetchedAt.slice(0, 10))) return { ok: false, reason: 'fx-invalid' };
      var fAt = Date.parse(doc.fetchedAt); if (!Number.isFinite(fAt) || fAt > now + SKEW_MS) return { ok: false, reason: 'fx-invalid' };
      var p = doc.points; if (!Array.isArray(p) || !p.length || p.length > MAX_POINTS) return { ok: false, reason: 'fx-invalid' };
      var out = [], prev = '', limit = doc.fetchedAt.slice(0, 10);
      for (var i = 0; i < p.length; i++) {
        var x = p[i];
        if (!x || typeof x !== 'object' || !day(x.d) || x.d <= prev || x.d > limit || !okV(x.v) || !CHECKS[x.check]) return { ok: false, reason: 'fx-invalid' };
        prev = x.d; out.push({ d: x.d, v: x.v, check: x.check });
      }
      return { ok: true, points: out, fetchedAt: doc.fetchedAt };
    } catch (e) { return { ok: false, reason: 'fx-invalid' }; }
  }
  /* date(YYYY-MM-DD) 당일 또는 이전 4일 안의 가장 가까운 대조 통과 환율 → {ok, d, v, check} 또는 {ok:false, reason} */
  function at(parsed, date) {
    if (!parsed || !parsed.ok || !day(date)) return { ok: false, reason: 'fx-unavailable' };
    var lo = new Date(Date.parse(date + 'T00:00:00Z') - MAX_GAP_DAYS * 86400000).toISOString().slice(0, 10), conflict = false;
    for (var i = parsed.points.length - 1; i >= 0; i--) {
      var x = parsed.points[i]; if (x.d > date) continue; if (x.d < lo) break;
      if (x.check === 'conflict') { conflict = true; continue; }
      return { ok: true, d: x.d, v: x.v, check: x.check };
    }
    return { ok: false, reason: conflict ? 'fx-source-conflict' : 'fx-date-missing' };
  }
  /* 달러 수익률(%)을 원화 수익률(%)로: 시작·끝 날짜의 환율로 환산 */
  function toKrwReturn(parsed, usdPct, fromDate, toDate) {
    if (typeof usdPct !== 'number' || !Number.isFinite(usdPct)) return { ok: false, reason: 'invalid-benchmark-value' };
    var a = at(parsed, fromDate), b = at(parsed, toDate);
    if (!a.ok) return a; if (!b.ok) return b;
    var v = ((1 + usdPct / 100) * (b.v / a.v) - 1) * 100;
    if (!Number.isFinite(v)) return { ok: false, reason: 'invalid-benchmark-value' };
    return { ok: true, valuePct: v, from: a, to: b, unchecked: a.check === 'unchecked' || b.check === 'unchecked' };
  }
  return Object.freeze({ parse: parse, at: at, toKrwReturn: toKrwReturn, MAX_GAP_DAYS: MAX_GAP_DAYS });
});
