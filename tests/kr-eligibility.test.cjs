'use strict';
const { test } = require('node:test'), a = require('node:assert/strict');
const E = require('../kr-radar/eligibility.js'), F = require('../kr-radar/fixtures.js');
const c = over => E.classifyInstrument(F.instrument(over));
test('common stocks with clean status are eligible stock-rule candidates', () => { const r = c({}); a.equal(r.decision, 'eligible'); a.equal(r.group, 'stock'); a.equal(r.ruleSet, 'stock'); });
test('exclusion policy: delisted, delisting review, administrative issue, SPAC, leveraged/inverse ETF', () => {
  for (const o of [{ delisted: true }, { delistingReview: true }, { administrativeIssue: true }, { securityType: 'SPAC', name: '가상스팩1호' }, { securityType: 'ETF', name: 'KODEX 가상인버스', etfKind: 'leveraged-inverse' }]) a.equal(c(o).decision, 'excluded', JSON.stringify(o));
  a.equal(c({ delisted: true }).sellReviewAllowed, true);
});
test('hold policy: trading halt, unknown flags, ETN, REIT, preferred, caution/warning, bad type', () => {
  for (const o of [{ tradingHalt: true }, { tradingHalt: null }, { delisted: undefined }, { securityType: 'ETN', name: '가상 ETN' }, { securityType: '리츠', name: '가상리츠' }, { securityType: '우선주', name: '가상기업우' }, { investmentCaution: '경고' }, { investmentCaution: '위험' }, { investmentCaution: 'bogus' }, { securityType: 'warrant' }, { market: 'KONEX' }, { market: undefined }, { code: '12345' }, { code: 'abcdef' }, { name: '' }]) a.equal(c(o).decision, 'hold', JSON.stringify(o));
  a.equal(c({ investmentCaution: '주의' }).decision, 'eligible'); a.deepEqual(c({ investmentCaution: '주의' }).flags, ['investment-caution']);
});
test('name/type mismatches stay on hold instead of being guessed', () => {
  a.equal(c({ name: 'TIGER 가상' }).decision, 'hold'); a.equal(c({ name: '가상스팩2호' }).decision, 'hold'); a.equal(c({ name: '가상기업우B' }).decision, 'hold'); a.equal(c({ name: '가상기업우(전환)' }).decision, 'hold');
});
test('ETFs are routed to a separate ETF rule set and never to stock PER/PBR rules', () => {
  const dom = c({ securityType: 'ETF', name: 'KODEX 가상200', etfKind: 'domestic-equity' }), ovs = c({ securityType: 'ETF', name: 'TIGER 가상미국', etfKind: 'overseas-equity' }), cov = c({ securityType: 'ETF', name: 'ACE 가상커버드콜', etfKind: 'covered-call' });
  for (const r of [dom, ovs, cov]) { a.equal(r.group, 'etf'); a.equal(r.ruleSet, 'etf'); a.equal(r.decision, 'eligible'); a.match(r.reasons.join(' '), /개별주 PER\/PBR·실적 규칙 적용 금지/); }
  a.ok(cov.flags.includes('covered-call-upside-cap'));
  a.equal(c({ securityType: 'ETF', name: 'KODEX 가상채권', etfKind: 'bond' }).decision, 'hold'); a.equal(c({ securityType: 'ETF', name: 'KODEX 가상', etfKind: null }).decision, 'hold');
});
test('account suitability is never assumed; only a dated, sourced user rule answers it', () => {
  const cls = c({}), etf = c({ securityType: 'ETF', name: 'KODEX 가상200', etfKind: 'domestic-equity' });
  for (const acc of E.ACCOUNTS) a.equal(E.accountReview(cls, acc).status, '확인 필요');
  a.equal(E.accountReview(cls, '연금저축').role, 'core'); a.equal(E.accountReview(cls, 'IRP').role, 'core'); a.equal(E.accountReview(cls, '일반').role, 'satellite');
  a.equal(E.accountReview(cls, 'ISA').role, 'undetermined'); a.match(E.accountReview(cls, 'ISA').reasons.join(' '), /역할이 정책으로 정해지지 않음/);
  a.equal(E.accountReview(cls, '비과세').status, '확인 필요');
  const rule = { account: '일반', assetKey: 'stock', allowed: true, confirmedAt: '2026-10-29', source: 'https://example.com/demo/rule' };
  a.equal(E.accountReview(cls, '일반', [rule]).status, '편입 가능(사용자 확인 규칙)');
  a.equal(E.accountReview(cls, '일반', [{ ...rule, allowed: false }]).status, '편입 불가(사용자 확인 규칙)');
  a.equal(E.accountReview(cls, '일반', [{ ...rule, source: 'http://x' }]).status, '확인 필요'); a.equal(E.accountReview(cls, '일반', [{ ...rule, confirmedAt: 'bad' }]).status, '확인 필요');
  a.equal(E.accountReview(cls, 'IRP', [rule]).status, '확인 필요'); a.equal(E.accountReview(etf, '일반', [rule]).status, '확인 필요');
  a.equal(E.accountReview(etf, '일반', [{ ...rule, assetKey: 'etf:domestic-equity' }]).status, '편입 가능(사용자 확인 규칙)');
});
