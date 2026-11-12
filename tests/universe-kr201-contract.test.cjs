'use strict';
/* GPT-20261112-1830: 국내 코스피200 개수를 KRX 다운로드 기록 개수(예: 201)로 받는 동적 계약 — 오프라인 검증.
 * SYNTHETIC / TEST-ONLY. 201 픽스처는 '총수 표현의 안전성 시험'이며 실제 401종목 감시 가동 선언이 아니다.
 * 코스피200 지수가 공식적으로 항상 201종목이라는 뜻도 아니다(KRX 다운로드 시점 ≠ 지수 효력 기준일, 미검증).
 * radar/data/kospi200-20261112.json 의 공개 재배포 권한은 미확인 — 운영 공개 경로로 보내기 전에 권리 확인 필요. */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const S = require('./lib/synthetic-universe-400.test-only.cjs'), C = require('../has/universe-screen.js');
const GROUPS = ['kospi200', 'nasdaq100', 'sp100', 'sp500'];

/* 합성 200 + 합성 1종목(9ZZ200)을 선언 201로. 실제 편입종목 아님. */
function input201() {
  const x = S.input();
  x.kospi200 = { ...x.kospi200, members: x.kospi200.members.concat([{ ticker: S.kr(200) }]), expectedConstituents: 201 };
  return x;
}
const NOW = Date.parse('2026-11-12T06:00:00Z');
function summaryOf(u, priced = 30) {
  const rows = u.members.slice(0, priced).map((t, i) => C.summarize(t, S.record(t.ticker, t.market, '2026-11-11', i), null, new Date(NOW).toISOString()));
  return C.assemble(u, rows, { generation: 'synthetic-test-only-kr201', generatedAt: new Date(NOW - 3600000).toISOString() });
}
const kr = u => u.members.filter(x => x.scope === 'core' && x.market === 'KR').length;
const us = u => u.members.filter(x => x.scope === 'core' && x.market === 'US').length;

test('기존 합성 200 계약 유지: coreCount 400, 국내 200 · 미국 200', () => {
  const u = C.buildUniverse(S.input());
  assert.equal(u.coreCount, 400); assert.equal(kr(u), 200); assert.equal(us(u), 200); assert.equal(C.validateUniverse(u), u);
  const s = summaryOf(u); assert.equal(s.coreCount, 400); assert.equal(s.total, 400); assert.equal(C.validateSummary(s, NOW), s);
});

test('국내 201 픽스처: 구성·검증·배치·요약 총수 401 (선언 = 실제 고유 코드 수)', () => {
  const u = C.buildUniverse(input201());
  assert.equal(u.coreCount, 401); assert.equal(kr(u), 201); assert.equal(us(u), 200);
  assert.equal(u.sources.find(s => s.group === 'kospi200').expectedConstituents, 201);
  assert.equal(new Set(u.members.map(x => x.market + ':' + x.ticker)).size, 401);
  assert.equal(u.provenance, 'declared-snapshot-not-independently-verified');
  const bs = C.batches(u);
  assert.equal(bs.flat().length, 401); assert(bs.every(b => b.length <= 12 && new Set(b.map(x => x.market)).size === 1));
  assert.equal(bs.filter(b => b[0].market === 'KR').flat().length, 201); assert.equal(bs.length, 34); // KR 201 = 16×12+9 → 17묶음, US 200 = 16×12+8 → 17묶음
  const s = summaryOf(u);
  assert.equal(s.coreCount, 401); assert.equal(s.total, 401); assert.equal(s.missingCount, 371); assert.equal(s.referenceCount, 30);
  assert.equal(C.validateSummary(s, NOW), s); assert.deepEqual(s.buyCandidates, []); assert.equal(s.signalHold, true);
  // 추가 감시(extras)는 core 다음에, 중복 없이
  const ue = C.buildUniverse(input201(), [{ market: 'US', ticker: 'ZXTRA' }, { market: 'KR', ticker: S.kr(200) }]);
  assert.equal(ue.members.length, 402); assert.equal(ue.coreCount, 401); assert.equal(C.validateUniverse(ue), ue);
});

test('조작 거부: 선언 201·실제 200 / 선언 200·실제 201 / 중복 / 결측 / 형식 오류', () => {
  let x = input201(); x.kospi200.members.pop();
  assert.throws(() => C.buildUniverse(x), /reviewed-complete-snapshots-required/);
  x = S.input(); x.kospi200.members.push({ ticker: S.kr(200) });
  assert.throws(() => C.buildUniverse(x), /reviewed-complete-snapshots-required/);
  x = input201(); x.kospi200.members[200] = { ticker: S.kr(0) };
  assert.throws(() => C.buildUniverse(x), /invalid-or-duplicate-constituent/);
  x = input201(); x.kospi200.members[5] = { ticker: '' };
  assert.throws(() => C.buildUniverse(x), /invalid-or-duplicate-constituent/);
  x = input201(); x.kospi200.members[5] = {};
  assert.throws(() => C.buildUniverse(x), /invalid-or-duplicate-constituent/);
  x = input201(); x.kospi200.members[5] = { ticker: '5930' };
  assert.throws(() => C.buildUniverse(x), /invalid-or-duplicate-constituent/);
  x = input201(); delete x.kospi200.expectedConstituents;
  assert.throws(() => C.buildUniverse(x), /reviewed-complete-snapshots-required/);
  x = input201(); x.kospi200.complete = false;
  assert.throws(() => C.buildUniverse(x), /reviewed-complete-snapshots-required/);
});

test('선언 개수 안전 범위: 199·206 거부(임의 ">=200" 통과 아님), 200~205만', () => {
  for (const n of [199, 206, 250]) {
    const x = S.input(); x.kospi200 = { ...x.kospi200, members: Array.from({ length: n }, (_, i) => ({ ticker: S.kr(i) })), expectedConstituents: n };
    assert.throws(() => C.buildUniverse(x), /reviewed-complete-snapshots-required/, String(n));
  }
  const x = S.input(); x.kospi200 = { ...x.kospi200, members: Array.from({ length: 205 }, (_, i) => ({ ticker: S.kr(i) })), expectedConstituents: 205 };
  assert.equal(C.buildUniverse(x).coreCount, 405);
});

test('상하위 개수 일관성: 선언 400인데 핵심 401, 선언 401인데 출처 200 → 거부', () => {
  let u = C.buildUniverse(input201()); u.coreCount = 400;
  assert.throws(() => C.validateUniverse(u), /invalid-core-count/);
  u = C.buildUniverse(S.input()); u.coreCount = 401; // 실제 핵심 400개 < 선언 401
  assert.throws(() => C.validateUniverse(u), /invalid-universe|invalid-core-count/);
  u = C.buildUniverse(S.input(), [{ market: 'US', ticker: 'ZXTRA' }]); u.coreCount = 401; // 추가 감시 1개로 401을 채워도 국내 출처 200과 불일치
  assert.throws(() => C.validateUniverse(u), /invalid-core-count/);
  u = C.buildUniverse(input201()); u.sources.find(s => s.group === 'kospi200').expectedConstituents = 200;
  assert.throws(() => C.validateUniverse(u), /invalid-core-count/);
  u = C.buildUniverse(input201()); u.members = u.members.filter(m => m.ticker !== S.kr(7)); // 핵심 1개 결측(400개 남음)
  assert.throws(() => C.validateUniverse(u), /invalid-universe|invalid-core-count/);
  u = C.buildUniverse(input201()); u.members.find(m => m.ticker === S.kr(7)).scope = 'extra'; // 핵심을 추가로 위장
  assert.throws(() => C.validateUniverse(u), /invalid-core-count/);
  // 요약 단계 조작
  let s = summaryOf(C.buildUniverse(input201())); s.coreCount = 400;
  assert.throws(() => C.validateSummary(s, NOW), /invalid-core-count/);
  s = summaryOf(C.buildUniverse(input201())); s.items.pop(); s.total = s.items.length; s.missingCount--;
  assert.throws(() => C.validateSummary(s, NOW));
  s = summaryOf(C.buildUniverse(input201())); s.total = 400;
  assert.throws(() => C.validateSummary(s, NOW), /invalid-summary/);
  s = summaryOf(C.buildUniverse(S.input())); s.items.push({ ...s.items[0], ticker: S.kr(200) }); s.total = 401; s.missingCount++;
  assert.throws(() => C.validateSummary(s, NOW), /invalid-core-count/, '선언 400(출처 200)인데 국내 핵심 201');
});

test('불합리한 출처 날짜 거부: 미래(빌드 시점·요약 생성 이후), 2000년 이전, 형식 오류', () => {
  let x = input201(); x.kospi200.source = { ...x.kospi200.source, asOf: '2099-01-01' };
  assert.throws(() => C.buildUniverse(x), /future-source-date/);
  x = input201(); x.kospi200.source = { ...x.kospi200.source, asOf: '1999-12-31' };
  assert.throws(() => C.buildUniverse(x), /constituent-sources-required/);
  x = input201(); x.kospi200.source = { ...x.kospi200.source, asOf: '2026-13-01' };
  assert.throws(() => C.buildUniverse(x), /constituent-sources-required/);
  // 요약 생성(11-12 05:00Z = 14:00 KST)보다 목록 기준일이 늦으면 거부
  const s = summaryOf(C.buildUniverse(input201())); s.sources.find(g => g.group === 'kospi200').source.asOf = '2026-11-13';
  assert.throws(() => C.validateSummary(s, NOW), /future-source-date/);
});

test('실제 KRX 스냅샷 모양(201, 코드만) + 합성 미국 200: 계약상 수용(시험 전용, 실가동 아님)', () => {
  const snap = JSON.parse(fs.readFileSync('radar/data/kospi200-20261112.json', 'utf8'));
  const x = S.input();
  x.kospi200 = { members: snap.members.map(m => ({ ticker: m.ticker })), source: { url: snap.source.url, asOf: snap.source.asOf, version: snap.source.version }, complete: snap.complete, expectedConstituents: snap.expectedConstituents };
  const u = C.buildUniverse(x);
  assert.equal(u.coreCount, 401); assert.equal(kr(u), new Set(snap.members.map(m => m.ticker)).size);
  // KRX 다운로드일을 지수 효력 기준일로 주장하지 않음: 버전 문구가 '조회 기준일 미표기'를 유지
  assert.match(snap.source.version, /기준일은 파일에 미표기/);
  assert.equal(u.provenance, 'declared-snapshot-not-independently-verified');
  assert(!fs.existsSync('radar/data/universe-400.json') && !fs.existsSync('radar/data/universe-401.json'), '실제 목록 파일 생성 금지(미국 원본 미확보)');
});

test('미국 계약 불변: 나스닥100 ∪ S&P100 + S&P500 시총순 보충 = 200 (11-13 ETF 기준 변경은 미적용)', () => {
  const u = C.buildUniverse(input201()), src = fs.readFileSync('has/universe-screen.js', 'utf8');
  assert.equal(us(u), 200); assert.deepEqual(u.sources.map(s => s.group), GROUPS);
  assert(u.members.some(m => m.ticker === 'ZSYN199') && !u.members.some(m => m.ticker === 'ZSYN200'));
  assert.match(src, /us-union-exceeds-200/); assert.doesNotMatch(src, /etf/i);
});
