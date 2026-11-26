/* HAS risk-guard v1 — 위험계 입력 검증(순수 함수, 외부 접속·저장소 없음).
   목적: 오류 페이지·엉뚱한 응답·오래된 값·가짜 기본값이 '안전' 같은 판정으로 보이지 않게 한다. */
(function (root) {
  'use strict';
  var DAY = 86400000, MAX_AGE_DAYS = 7;
  // 합리 범위(과거 극단값 포함, 넓되 1.0 같은 쓰레기값은 구조 검사로 따로 막는다). hy는 % 단위로 받아 bps로 변환.
  var SPEC = {
    vix: { min: 8, max: 90 }, rate: { min: 0.3, max: 9 }, rate2: { min: 0.05, max: 9 },
    hy: { min: 1.5, max: 25 }, dxy: { min: 70, max: 130 }, oil: { min: 15, max: 200 }
  };
  var KINDS = Object.keys(SPEC);
  function num(x) { return typeof x === 'number' && isFinite(x); }
  function dateOk(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z')); }
  function dayMs(d) { return Date.parse(d + 'T00:00:00Z'); }
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }

  // FRED 그래프 CSV만 인정: 첫 줄이 "DATE|observation_date,<요청한 ID>"이고 각 줄이 "YYYY-MM-DD,숫자|." 형식. 마지막 숫자 줄을 쓴다.
  function parseFred(txt, id) {
    if (typeof txt !== 'string' || txt.length > 2000000 || typeof id !== 'string') return null;
    var lines = txt.replace(/^﻿/, '').replace(/\r/g, '').trim().split('\n');
    var h = lines[0].trim().split(',');
    if (h.length !== 2 || !/^(DATE|observation_date)$/i.test(h[0]) || h[1].trim() !== id) return null;
    var best = null;
    for (var i = 1; i < lines.length; i++) {
      var c = lines[i].trim().split(',');
      if (c.length !== 2 || !dateOk(c[0])) return null; // 형식이 어긋나면 전체 거부
      if (c[1] === '.') continue;
      if (!/^-?\d+(\.\d+)?$/.test(c[1])) return null;
      best = { v: parseFloat(c[1]), d: c[0] };
    }
    return best;
  }
  // Yahoo chart JSON만 인정: meta.symbol이 요청과 같고 가격·시각이 숫자일 때.
  function parseYahoo(txt, sym) {
    try {
      var m = JSON.parse(txt).chart.result[0].meta;
      if (!m || String(m.symbol).toUpperCase() !== String(sym).toUpperCase()) return null;
      var p = m.regularMarketPrice, t = m.regularMarketTime;
      if (!num(p) || !(p > 0) || !num(t) || !(t > 0)) return null;
      return { v: p, d: new Date(t * 1000).toISOString().slice(0, 10) };
    } catch (e) { return null; }
  }
  // 값 하나 검증: 범위·관측일(미래 2일 초과·7일 초과 과거 거부). hy는 %→bps 변환.
  function accept(kind, parsed, now) {
    var s = SPEC[kind];
    if (!s) return { ok: false, reason: 'unknown-kind' };
    if (!parsed || !num(parsed.v) || !dateOk(parsed.d)) return { ok: false, reason: 'no-data' };
    if (parsed.v < s.min || parsed.v > s.max) return { ok: false, reason: 'out-of-range' };
    var age = (now - dayMs(parsed.d)) / DAY;
    if (age > MAX_AGE_DAYS) return { ok: false, reason: 'old' };
    if (age < -2) return { ok: false, reason: 'future' };
    var v = kind === 'hy' ? Math.round(parsed.v * 100) : kind === 'vix' ? Math.round(parsed.v * 10) / 10 : Math.round(parsed.v * 100) / 100;
    return { ok: true, v: v, asOf: parsed.d };
  }
  function toRaw(kind, v) { return kind === 'hy' ? v / 100 : v; }
  function itemOk(kind, x, now) {
    if (!plain(x) || !num(x.v) || !dateOk(x.asOf) || !num(x.at) || x.at > now + 60000 || now - x.at > MAX_AGE_DAYS * DAY) return false;
    return accept(kind, { v: toRaw(kind, x.v), d: x.asOf }, now).ok;
  }
  // 저장된 값 정리: v2 형식만 인정(옛 형식·기본값 포함 저장은 전부 버림).
  function sanitize(raw, now) {
    var out = { vals: {}, fg: null, ts: 0 };
    if (!plain(raw) || raw.v !== 2 || !plain(raw.vals)) return out;
    KINDS.forEach(function (k) { var x = raw.vals[k]; if (itemOk(k, x, now)) out.vals[k] = { v: x.v, asOf: x.asOf, at: x.at, stale: !!x.stale }; });
    if (num(raw.fg) && raw.fg >= 0 && raw.fg <= 100) out.fg = raw.fg;
    if (num(raw.ts) && raw.ts <= now + 60000) out.ts = raw.ts;
    return out;
  }
  // 새 값과 이전 값을 합친다: 새 값이 통과하면 그것, 아니면 7일 안의 검증된 이전 값(stale 표시), 아니면 없음.
  function merge(prevVals, fresh, now) {
    var vals = {}, reasons = {};
    KINDS.forEach(function (k) {
      var f = fresh && fresh[k];
      if (f && f.ok) vals[k] = { v: f.v, asOf: f.asOf, at: now, stale: false };
      else {
        reasons[k] = f && f.reason ? f.reason : 'no-data';
        var p = prevVals && prevVals[k];
        if (itemOk(k, p, now)) vals[k] = { v: p.v, asOf: p.asOf, at: p.at, stale: true };
      }
    });
    var issues = crossCheck(vals);
    issues.drop.forEach(function (k) { delete vals[k]; reasons[k] = 'suspicious'; });
    return { vals: vals, reasons: reasons, issues: issues.msgs };
  }
  // 서로 다른 지표(10Y·2Y·HY)가 같은 값이면 쓰레기 응답 의심 → 해당 값 폐기.
  function crossCheck(vals) {
    var a = vals.rate, b = vals.rate2, c = vals.hy, drop = [], msgs = [];
    function eq(x, y) { return x && y && Math.abs(x - y) < 0.005; }
    var hyPct = c ? c.v / 100 : null;
    if (a && b && c && eq(a.v, b.v) && eq(a.v, hyPct)) { drop = ['rate', 'rate2', 'hy']; msgs.push('10Y·2Y·HY가 같은 값이라 쓰레기 응답으로 보고 버렸어요'); }
    else if (a && b && eq(a.v, b.v) && a.v === Math.round(a.v)) { drop = ['rate', 'rate2']; msgs.push('10Y·2Y가 같은 정수값이라 버렸어요'); }
    return { drop: drop, msgs: msgs };
  }
  function hasCore(vals) { return !!(vals && vals.hy && vals.rate && vals.vix); }
  function spread(vals) {
    if (!vals || !vals.rate || !vals.rate2) return null;
    return Math.round((vals.rate.v - vals.rate2.v) * 100) / 100;
  }
  var LABEL = { vix: 'VIX', rate: '10Y', rate2: '2Y', hy: 'HY', dxy: 'DXY', oil: 'WTI' };
  function md(d) { return d.slice(5); }
  function describe(vals, reasons) {
    var ok = [], stale = [], miss = [];
    KINDS.forEach(function (k) {
      var x = vals[k];
      if (!x) { miss.push(LABEL[k]); return; }
      var t = LABEL[k] + ' ' + x.v + ' (' + md(x.asOf) + ')';
      (x.stale ? stale : ok).push(t);
    });
    return { ok: ok, stale: stale, miss: miss };
  }
  // 옛 화면 코드(아침 브리핑 등)가 읽는 값: v2이고 7일 안일 때만, 없는 값은 null.
  function mirror(raw, now) {
    var s = sanitize(raw, now), m = { ts: s.ts, fg: s.fg };
    m.hy = s.vals.hy ? s.vals.hy.v : null; m.rate = s.vals.rate ? s.vals.rate.v : null; m.vix = s.vals.vix ? s.vals.vix.v : null;
    m.dxy = s.vals.dxy ? s.vals.dxy.v : null; m.oil = s.vals.oil ? s.vals.oil.v : null; m.spread = spread(s.vals);
    return m;
  }
  function serialize(vals, fg, now) {
    var m = { v: 2, vals: vals, fg: num(fg) ? fg : null, ts: now };
    m.hy = vals.hy ? vals.hy.v : null; m.rate = vals.rate ? vals.rate.v : null; m.vix = vals.vix ? vals.vix.v : null;
    m.dxy = vals.dxy ? vals.dxy.v : null; m.oil = vals.oil ? vals.oil.v : null; m.spread = spread(vals);
    return m;
  }
  var api = Object.freeze({ VERSION: 'has-risk-guard-v1', SPEC: SPEC, KINDS: KINDS, MAX_AGE_DAYS: MAX_AGE_DAYS, parseFred: parseFred, parseYahoo: parseYahoo, accept: accept, sanitize: sanitize, merge: merge, crossCheck: crossCheck, hasCore: hasCore, spread: spread, describe: describe, mirror: mirror, serialize: serialize });
  if (typeof module === 'object' && module.exports) module.exports = api; else root.HASRiskGuard = api;
})(typeof window !== 'undefined' ? window : this);
