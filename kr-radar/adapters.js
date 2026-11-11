/* KST KR radar: provider adapter INTERFACE and data contracts. Only a synthetic adapter exists; there is no real adapter,
   no HTTP client, no key handling. Contract fields below are requirements for a future, separately approved adapter. */
'use strict';
const { finite, nonEmpty, day, httpsUrl, copy, CODE_RE } = require('./common.js');
const PRICE_CONTRACT = Object.freeze(['code', 'tradeDate(KST)', 'regularSessionClose', 'high52w(same adjustment basis)', 'adjustmentBasis', 'splitDividendHandling', 'volume', 'tradingValue', 'listedShares/float', 'tradingStatus', 'benchmark(KOSPI|KOSDAQ|sector)', 'fetchedAt', 'delayMinutes', 'source.name', 'source.url', 'licenseRef']);
const DISCLOSURE_CONTRACT = Object.freeze(['receiptNo(14 digits)', 'code', 'filedAt(KST)', 'kind(original|correction)', 'supersedes', 'statementBasis(consolidated|separate)', 'fiscalLabel', 'periodEnd', 'auditOpinion', 'dividend', 'buyback(acquired)', 'cancellation(actually cancelled)', 'majorShareholder/governance', 'managementIssue flags', 'source.url']);
function validatePriceBar(b) {
  const e = [];
  if (!b || b.synthetic !== true) e.push('합성 전용');
  else {
    if (!CODE_RE.test(b.code || '')) e.push('code');
    if (!day(b.tradeDate)) e.push('tradeDate');
    if (b.timezone !== 'Asia/Seoul') e.push('timezone(KST)');
    if (b.currency !== 'KRW') e.push('currency');
    if (b.session !== 'regular') e.push('session(regular)');
    if (!finite(b.close) || b.close <= 0) e.push('close');
    if (!['adjusted-consistent', 'unadjusted'].includes(b.adjustmentBasis)) e.push('adjustmentBasis');
    if (finite(b.high52w) && b.high52wBasis !== b.adjustmentBasis) e.push('high52w 수정기준 불일치(혼합 금지)');
    if (!['normal', 'halt', 'delisted', 'unknown'].includes(b.tradingStatus)) e.push('tradingStatus');
    if (!finite(b.delayMinutes) || b.delayMinutes < 0) e.push('delayMinutes');
    if (!nonEmpty(b.fetchedAt) || !nonEmpty(b.source && b.source.name) || !httpsUrl(b.source && b.source.url)) e.push('fetchedAt/source');
  }
  return { ok: e.length === 0, errors: e };
}
function validateDisclosure(d) {
  const e = [];
  if (!d || d.synthetic !== true) e.push('합성 전용');
  else {
    if (!/^\d{14}$/.test(d.receiptNo || '')) e.push('receiptNo');
    if (!CODE_RE.test(d.code || '')) e.push('code');
    if (!day(d.filedAt)) e.push('filedAt');
    if (!['original', 'correction'].includes(d.kind)) e.push('kind');
    if (d.kind === 'correction' && !/^\d{14}$/.test(d.supersedes || '')) e.push('정정공시는 supersedes 필요');
    if (!['consolidated', 'separate'].includes(d.statementBasis)) e.push('statementBasis');
    if (!nonEmpty(d.fiscalLabel) || !day(d.periodEnd)) e.push('fiscalLabel/periodEnd');
    if (!['unqualified', 'qualified', 'adverse', 'disclaimer'].includes(d.auditOpinion)) e.push('auditOpinion');
    if (!d.cancellation || typeof d.cancellation.actuallyCancelled !== 'boolean') e.push('cancellation.actuallyCancelled(소각 완료 여부)');
    if (!httpsUrl(d.source && d.source.url)) e.push('source.url');
  }
  return { ok: e.length === 0, errors: e };
}
function createSyntheticAdapter(fixture) {
  return Object.freeze({ id: 'kr-synthetic-v1', mode: 'synthetic', realNetwork: false,
    async load() {
      const bars = (fixture && fixture.bars) || [], filings = (fixture && fixture.filings) || [];
      const bad = [...bars.map(validatePriceBar), ...filings.map(validateDisclosure)].filter(r => !r.ok);
      if (bad.length) throw new Error('합성 응답 계약 오류: ' + bad.map(b => b.errors.join(',')).join(' | '));
      return copy({ schemaVersion: 1, mode: 'synthetic', bars, filings });
    } });
}
function createRealAdapter() { throw new Error('실제 공급자 어댑터는 별도 승인 전 생성할 수 없습니다(키·계약·네트워크 호출 금지).'); }
module.exports = { PRICE_CONTRACT, DISCLOSURE_CONTRACT, validatePriceBar, validateDisclosure, createSyntheticAdapter, createRealAdapter };
