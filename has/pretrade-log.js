/* HAS 29단계 — 매매 전 점검과 사유 기록(철학 문서 성공 기준 ④ 불필요한 매매·감정 판단 감소, ⑤ 판단 성과 검증).
   순태씨의 상시 규칙(①최신 뉴스 ②실적·공시 ③컨센서스 ④커뮤니티 순서 조사)과 철학 문서의 반대 근거·비중·분할 원칙을 점검표로 만든다.
   · 이 모듈은 주문·매매를 하지 않고, 매수·매도를 권하지도 않는다. 사용자가 적은 점검과 사유를 검증해 기록할 뿐이다.
   · 투자 원장(v5_*)과 완전히 분리: 저장 키는 has_pretrade_log_v1 하나뿐이며 다른 키는 읽지도 쓰지도 않는다(정적 시험으로 보호).
   · 점검이 덜 끝나도 기록은 막지 않는다(막으면 기록 자체를 피한다). 대신 '점검 미완료 상태로 진행'을 별도로 집계해 보여 준다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASPretradeLog = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEY = 'has_pretrade_log_v1', MAX_ENTRIES = 300, MAX_BYTES = 200000;
  var SIDES = Object.freeze({ buy: '매수', sell: '매도', trim: '비중 축소' });
  var EMOTIONS = Object.freeze({ calm: '차분함', fear: '공포·불안', greed: '탐욕·조급함' });
  var DECISIONS = Object.freeze({ proceed: '진행', wait: '보류', cancel: '취소' });
  /* 점검 항목. research=true 는 확인한 출처·내용을 짧게 적어야 완료로 본다(순태씨 상시 규칙 4단계). */
  var CHECKS = Object.freeze({
    news: Object.freeze({ label: '① 최신 뉴스를 확인했다', research: true, sides: ['buy', 'sell', 'trim'] }),
    earnings: Object.freeze({ label: '② 실적·공시·가이던스를 확인했다', research: true, sides: ['buy', 'sell', 'trim'] }),
    consensus: Object.freeze({ label: '③ 애널리스트 컨센서스를 확인했다', research: true, sides: ['buy', 'sell', 'trim'] }),
    community: Object.freeze({ label: '④ 커뮤니티 분위기를 확인했다', research: true, sides: ['buy', 'sell', 'trim'] }),
    weightCash: Object.freeze({ label: '현재 보유 비중과 현금 여력을 확인했다', research: false, sides: ['buy', 'sell', 'trim'] }),
    moat: Object.freeze({ label: '기업의 본질가치·경쟁력(해자)이 유지되는지 확인했다', research: false, sides: ['buy'] }),
    temporary: Object.freeze({ label: '악재가 일시적인지 구조적인지 구분했다', research: false, sides: ['buy'] }),
    split: Object.freeze({ label: '분할 매수 계획(회차·금액)을 정했다', research: false, sides: ['buy'] }),
    sellReason: Object.freeze({ label: '매도 이유가 고평가·성장 둔화·투자 논리 훼손·집중도 중 무엇인지 적었다', research: false, sides: ['sell', 'trim'] }),
    greatCompany: Object.freeze({ label: '"위대한 기업은 오래 보유" 원칙과 충돌하지 않는지 검토했다', research: false, sides: ['sell', 'trim'] }),
    taxFx: Object.freeze({ label: '세금·수수료·환율과 재매수 가능 수량을 검토했다', research: false, sides: ['sell', 'trim'] })
  });
  var CHECK_KEYS = Object.keys(CHECKS);
  var ENTRY_KEYS = ['id', 'createdAt', 'name', 'side', 'checks', 'reasonFor', 'reasonAgainst', 'emotion', 'plan', 'decision', 'review'];
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function str(x, max) { return typeof x === 'string' && x.length <= max; }
  function iso(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) && !isNaN(Date.parse(x)) && new Date(Date.parse(x)).toISOString() === x; }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function required(side) { return CHECK_KEYS.filter(function (k) { return CHECKS[k].sides.indexOf(side) !== -1; }); }

  /* 입력 검증. 통과한 값만 새 객체로 복사해 동결한다(입력 객체를 보관하지 않는다). */
  function validate(e) {
    var errs = [];
    if (!isObj(e)) return { ok: false, errors: ['기록 형식이 올바르지 않습니다'], entry: null };
    Object.keys(e).forEach(function (k) { if (ENTRY_KEYS.indexOf(k) === -1) errs.push('알 수 없는 항목: ' + k); });
    if (!str(e.id, 80) || !e.id) errs.push('id');
    if (!iso(e.createdAt)) errs.push('createdAt');
    if (!str(e.name, 40) || !String(e.name).trim()) errs.push('종목 이름이 비었거나 40자를 넘습니다');
    if (!has(SIDES, e.side)) errs.push('구분(매수·매도·비중 축소)');
    if (!has(EMOTIONS, e.emotion)) errs.push('감정 상태');
    if (!has(DECISIONS, e.decision)) errs.push('결정(진행·보류·취소)');
    if (!str(e.reasonFor, 500)) errs.push('이유(500자 이하)');
    if (!str(e.reasonAgainst, 500)) errs.push('반대 근거(500자 이하)');
    if (!str(e.plan, 300)) errs.push('계획(300자 이하)');
    var checks = {};
    if (!isObj(e.checks)) errs.push('checks'); else {
      Object.keys(e.checks).forEach(function (k) {
        var c = e.checks[k];
        if (CHECK_KEYS.indexOf(k) === -1) errs.push('알 수 없는 점검 항목: ' + k);
        else if (!isObj(c) || typeof c.done !== 'boolean' || !str(c.note, 200) || Object.keys(c).some(function (x) { return x !== 'done' && x !== 'note'; })) errs.push('점검 항목 형식: ' + k);
        else checks[k] = Object.freeze({ done: c.done, note: c.note });
      });
    }
    var review = null;
    if (e.review !== undefined && e.review !== null) {
      if (!isObj(e.review) || !iso(e.review.at) || !str(e.review.note, 500) || Object.keys(e.review).some(function (x) { return x !== 'at' && x !== 'note'; })) errs.push('사후 메모 형식');
      else review = Object.freeze({ at: e.review.at, note: e.review.note });
    }
    if (errs.length) return { ok: false, errors: errs, entry: null };
    return { ok: true, errors: [], entry: Object.freeze({ id: e.id, createdAt: e.createdAt, name: e.name.trim(), side: e.side, checks: Object.freeze(checks), reasonFor: e.reasonFor, reasonAgainst: e.reasonAgainst, emotion: e.emotion, plan: e.plan, decision: e.decision, review: review }) };
  }

  /* 점검 상태. missing 은 사람이 읽는 문장 목록. 기록을 막지 않는다. */
  function assess(entry) {
    var missing = [], warnings = [];
    required(entry.side).forEach(function (k) {
      var c = entry.checks[k], def = CHECKS[k];
      if (!c || !c.done) missing.push(def.label + ' — 아직 확인하지 않음');
      else if (def.research && c.note.trim().length < 2) missing.push(def.label + ' — 확인한 출처·내용을 적지 않음');
    });
    if (!entry.reasonFor.trim()) missing.push('이 결정의 이유를 적지 않음');
    if (!entry.reasonAgainst.trim()) missing.push('반대 근거(이 결정이 틀릴 수 있는 이유)를 적지 않음');
    if (entry.emotion !== 'calm') warnings.push('감정 상태가 "' + EMOTIONS[entry.emotion] + '"입니다. 하루 뒤 같은 점검을 다시 해 보는 것을 고려하세요.');
    if (entry.decision === 'proceed' && missing.length) warnings.push('점검이 끝나지 않은 채 "진행"으로 기록했습니다.');
    return Object.freeze({ complete: missing.length === 0, missing: Object.freeze(missing), warnings: Object.freeze(warnings), proceededIncomplete: entry.decision === 'proceed' && missing.length > 0 });
  }

  /* 성공 기준 ④ 측정: 점검을 끝내고 진행한 비율, 감정 상태에서 진행한 횟수. 수익률·적중 평가는 하지 않는다. */
  function summarize(entries) {
    var s = { total: 0, proceed: 0, wait: 0, cancel: 0, proceedComplete: 0, proceedIncomplete: 0, emotional: 0, emotionalProceed: 0, reviewed: 0 };
    (entries || []).forEach(function (e) {
      var a = assess(e); s.total++; s[e.decision]++;
      if (e.decision === 'proceed') { if (a.complete) s.proceedComplete++; else s.proceedIncomplete++; }
      if (e.emotion !== 'calm') { s.emotional++; if (e.decision === 'proceed') s.emotionalProceed++; }
      if (e.review) s.reviewed++;
    });
    return Object.freeze(s);
  }

  /* 저장소: 이 모듈의 키 하나만 다룬다. 주입된 storage 에 getItem/setItem 이 없으면 사용 불가로 처리한다. */
  function createStore(storage) {
    function usable() { return !!storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'; }
    function load() {
      if (!usable()) return { ok: false, entries: [], dropped: 0, error: 'storage-unavailable' };
      var raw; try { raw = storage.getItem(KEY); } catch (e) { return { ok: false, entries: [], dropped: 0, error: 'read-failed' }; }
      if (raw === null || raw === undefined) return { ok: true, entries: [], dropped: 0, error: null };
      if (typeof raw !== 'string' || raw.length > MAX_BYTES) return { ok: false, entries: [], dropped: 0, error: 'too-large-or-invalid' };
      var p; try { p = JSON.parse(raw); } catch (e) { return { ok: false, entries: [], dropped: 0, error: 'corrupt' }; }
      if (!isObj(p) || p.v !== 1 || !Array.isArray(p.entries)) return { ok: false, entries: [], dropped: 0, error: 'corrupt' };
      var out = [], dropped = 0, seen = {};
      p.entries.slice(0, MAX_ENTRIES).forEach(function (x) { var v = validate(x); if (v.ok && !seen[v.entry.id]) { seen[v.entry.id] = 1; out.push(v.entry); } else dropped++; });
      return { ok: true, entries: out, dropped: dropped + Math.max(0, p.entries.length - MAX_ENTRIES), error: null };
    }
    function write(entries) {
      var text = JSON.stringify({ v: 1, entries: entries });
      if (text.length > MAX_BYTES) return { ok: false, error: 'full' };
      try { storage.setItem(KEY, text); } catch (e) { return { ok: false, error: 'write-failed' }; }
      return { ok: true, error: null };
    }
    /* 읽기가 손상으로 실패하면 덮어쓰지 않는다(기존 기록 보호). */
    function add(entry) {
      var v = validate(entry); if (!v.ok) return { ok: false, error: 'invalid', errors: v.errors };
      var cur = load(); if (!cur.ok) return { ok: false, error: cur.error };
      if (cur.entries.some(function (x) { return x.id === v.entry.id; })) return { ok: false, error: 'duplicate-id' };
      if (cur.entries.length >= MAX_ENTRIES) return { ok: false, error: 'full' };
      return write(cur.entries.concat([v.entry]));
    }
    function addReview(id, note, nowISO) {
      var cur = load(); if (!cur.ok) return { ok: false, error: cur.error };
      var found = false, next = cur.entries.map(function (e) {
        if (e.id !== id) return e; found = true;
        var v = validate(Object.assign({}, e, { checks: e.checks, review: { at: nowISO, note: note } })); return v.ok ? v.entry : e;
      });
      if (!found) return { ok: false, error: 'not-found' };
      if (next.every(function (e, i) { return e === cur.entries[i]; })) return { ok: false, error: 'invalid' };
      return write(next);
    }
    return Object.freeze({ load: load, add: add, addReview: addReview });
  }

  return Object.freeze({ KEY: KEY, MAX_ENTRIES: MAX_ENTRIES, SIDES: SIDES, EMOTIONS: EMOTIONS, DECISIONS: DECISIONS, CHECKS: CHECKS, required: required, validate: validate, assess: assess, summarize: summarize, createStore: createStore });
});
